import { Router } from 'express'
import { randomBytes, randomInt } from 'node:crypto'
import { ObjectId } from 'mongodb'
import bcrypt from 'bcryptjs'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { config } from '../config.js'
import { collections, audit } from '../db.js'
import { sendChatCode } from '../mailer.js'
import { requireAdmin } from '../middleware/auth.js'

export const chatRouter = Router()

/**
 * Native group chat — no third-party platform.
 *
 * Deliberately mirrors the Circle routes (request-code, verify, session,
 * messages, leave) so the same frontend component drives either one by
 * changing a path prefix.
 *
 * Joining is by emailed code rather than a password: nobody wants an
 * account to say hello, but an unverified name field would make it
 * trivial to post as someone else.
 */

const COOKIE = 'ng_chat'
const CODE_TTL_MS = 10 * 60 * 1000
const SESSION_DAYS = 60
const MAX_BODY = 2000

const codeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many codes requested. Try again in 15 minutes.' },
})

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in 15 minutes.' },
})

const postLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Slow down a moment.' },
})

function cookieOpts() {
  return {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax',
    domain: config.cookieDomain || undefined,
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  }
}

async function loadSession(req, res, next) {
  const id = req.cookies?.[COOKIE]
  if (!id) return res.status(401).json({ error: 'Not joined' })

  const session = await collections.chatSessions().findOne({ sessionId: id })
  if (!session) {
    res.clearCookie(COOKIE, { ...cookieOpts(), maxAge: undefined })
    return res.status(401).json({ error: 'Not joined' })
  }

  // Bans are enforced on every request, not just at join, so removing
  // someone takes effect immediately rather than at their next login.
  if (await collections.chatBans().findOne({ email: session.email })) {
    return res.status(403).json({ error: 'You can no longer post here.' })
  }

  req.chatUser = session
  next()
}

/** Step 1 — email a one-time code. */
chatRouter.post('/request-code', codeLimiter, async (req, res, next) => {
  try {
    const parsed = z
      .object({
        email: z.string().email().max(200),
        name: z.string().max(60).optional(),
      })
      .safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'A valid email is required' })

    const email = parsed.data.email.toLowerCase().trim()

    if (await collections.chatBans().findOne({ email })) {
      // Same shape as success — don't tell a banned user they're banned.
      return res.json({ ok: true })
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    await collections.chatCodes().updateOne(
      { email },
      {
        $set: {
          email,
          name: (parsed.data.name || '').trim().slice(0, 60),
          codeHash: await bcrypt.hash(code, 10),
          expiresAt: new Date(Date.now() + CODE_TTL_MS),
          attempts: 0,
        },
      },
      { upsert: true },
    )

    sendChatCode(email, code)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

/** Step 2 — check the code and open a session. */
chatRouter.post('/verify', verifyLimiter, async (req, res, next) => {
  try {
    const parsed = z
      .object({ email: z.string().email().max(200), code: z.string().length(6) })
      .safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Enter the 6-digit code' })

    const email = parsed.data.email.toLowerCase().trim()
    const record = await collections.chatCodes().findOne({ email })

    if (!record || record.expiresAt < new Date()) {
      return res.status(400).json({ error: 'That code has expired. Request a new one.' })
    }
    if (record.attempts >= 6) {
      return res.status(429).json({ error: 'Too many wrong codes. Request a new one.' })
    }

    const ok = await bcrypt.compare(parsed.data.code, record.codeHash)
    if (!ok) {
      await collections.chatCodes().updateOne({ email }, { $inc: { attempts: 1 } })
      return res.status(400).json({ error: 'That code is not right.' })
    }

    await collections.chatCodes().deleteOne({ email })

    const displayName = record.name || email.split('@')[0]
    await collections.chatMembers().updateOne(
      { email },
      {
        $set: { email, name: displayName, lastSeenAt: new Date() },
        $setOnInsert: { joinedAt: new Date() },
      },
      { upsert: true },
    )

    const sessionId = randomBytes(32).toString('hex')
    await collections.chatSessions().insertOne({
      sessionId,
      email,
      name: displayName,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000),
    })

    res.cookie(COOKIE, sessionId, cookieOpts())
    res.json({ email, name: displayName })
  } catch (err) {
    next(err)
  }
})

chatRouter.get('/session', async (req, res, next) => {
  try {
    const id = req.cookies?.[COOKIE]
    if (!id) return res.json({ joined: false })
    const session = await collections.chatSessions().findOne({ sessionId: id })
    res.json(
      session ? { joined: true, email: session.email, name: session.name } : { joined: false },
    )
  } catch (err) {
    next(err)
  }
})

chatRouter.post('/leave', (req, res) => {
  res.clearCookie(COOKIE, { ...cookieOpts(), maxAge: undefined })
  res.json({ ok: true })
})

const shape = (m) => ({
  id: m._id.toString(),
  body: m.body,
  authorName: m.name,
  sentAt: m.createdAt,
})

/** Read the room — most recent 60, oldest first. */
chatRouter.get('/messages', loadSession, async (req, res, next) => {
  try {
    const rows = await collections
      .chatMessages()
      .find({ deleted: { $ne: true } })
      .sort({ createdAt: -1 })
      .limit(60)
      .toArray()

    res.json({ me: req.chatUser.email, messages: rows.reverse().map(shape) })
  } catch (err) {
    next(err)
  }
})

chatRouter.post('/messages', loadSession, postLimiter, async (req, res, next) => {
  try {
    const parsed = z
      .object({ body: z.string().min(1).max(MAX_BODY) })
      .safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Write something first' })

    // Stored as plain text and rendered as plain text on the client, so
    // there is no markup to sanitise and nothing to inject.
    await collections.chatMessages().insertOne({
      body: parsed.data.body.trim(),
      email: req.chatUser.email,
      name: req.chatUser.name,
      createdAt: new Date(),
    })

    res.status(201).json({ ok: true })
  } catch (err) {
    next(err)
  }
})

/* ─── moderation, admin only ─────────────────────────────────── */

chatRouter.get('/admin/messages', requireAdmin, async (_req, res, next) => {
  try {
    const rows = await collections
      .chatMessages()
      .find({})
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray()
    res.json(
      rows.map((m) => ({ ...shape(m), email: m.email, deleted: Boolean(m.deleted) })),
    )
  } catch (err) {
    next(err)
  }
})

/** Soft delete — the row stays so there's a record of what was removed. */
chatRouter.delete('/admin/messages/:id', requireAdmin, async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid id' })
    }
    await collections
      .chatMessages()
      .updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { deleted: true, deletedAt: new Date(), deletedBy: req.admin.email } },
      )
    await audit(req.admin.email, 'chat.delete_message', { id: req.params.id })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

chatRouter.post('/admin/ban', requireAdmin, async (req, res, next) => {
  try {
    const parsed = z.object({ email: z.string().email() }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Valid email required' })

    const email = parsed.data.email.toLowerCase().trim()
    await collections
      .chatBans()
      .updateOne(
        { email },
        { $set: { email, bannedAt: new Date(), bannedBy: req.admin.email } },
        { upsert: true },
      )
    // Kill their live sessions too, so the ban bites straight away.
    await collections.chatSessions().deleteMany({ email })

    await audit(req.admin.email, 'chat.ban', { email })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

chatRouter.post('/admin/unban', requireAdmin, async (req, res, next) => {
  try {
    const parsed = z.object({ email: z.string().email() }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Valid email required' })
    await collections.chatBans().deleteOne({ email: parsed.data.email.toLowerCase().trim() })
    await audit(req.admin.email, 'chat.unban', { email: parsed.data.email })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

chatRouter.get('/admin/bans', requireAdmin, async (_req, res, next) => {
  try {
    res.json(await collections.chatBans().find({}).toArray())
  } catch (err) {
    next(err)
  }
})
