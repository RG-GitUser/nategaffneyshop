import { Router } from 'express'
import { randomBytes, randomInt } from 'node:crypto'
import { ObjectId } from 'mongodb'
import bcrypt from 'bcryptjs'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { config } from '../config.js'
import { collections, audit } from '../db.js'
import { sendChatCode, notifyChatBanned, notifyChatUnbanned } from '../mailer.js'
import { smsConfigured, sendSms } from '../sms.js'
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

/**
 * Identifiers: a member is keyed by EITHER an email address or a phone
 * number. To keep sessions, bans, messages and their indexes untouched,
 * the identifier travels in the existing `email` field throughout the
 * chat collections; member docs additionally carry `phone` when the
 * identifier is a phone number, so the dashboard can show and filter it.
 */
const phoneRe = /^\+?[0-9][0-9\s\-().]{6,18}$/

/** "+1 (902) 555-0134" → "+19025550134"; bare 10-digit NA numbers get +1. */
function normalizePhone(raw) {
  const digits = raw.replace(/[^\d]/g, '')
  if (raw.trim().startsWith('+')) return `+${digits}`
  if (digits.length === 10) return `+1${digits}`
  return `+${digits}`
}

const isEmail = (id) => id.includes('@')

/** Same as readIdentifier, but for ADMIN moderation — a phone identifier
 *  must stay bannable even if Twilio is later unconfigured. */
function readIdentifierLoose(body) {
  const email = z.string().email().max(200).safeParse(body?.email)
  if (email.success) return email.data.toLowerCase().trim()
  const phone = z.string().regex(phoneRe).safeParse(body?.email ?? body?.phone)
  if (phone.success) return normalizePhone(phone.data)
  return null
}

/** Pull one identifier out of a request body carrying email OR phone. */
function readIdentifier(body) {
  const parsed = z
    .object({
      email: z.string().email().max(200).optional(),
      phone: z.string().regex(phoneRe).optional(),
    })
    .safeParse({ email: body?.email, phone: body?.phone })
  if (!parsed.success) return null
  const { email, phone } = parsed.data
  if (email && phone) return null
  if (email) return email.toLowerCase().trim()
  if (phone) {
    if (!smsConfigured()) return null // don't accept what we can't verify
    return normalizePhone(phone)
  }
  return null
}

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

/** Which sign-in routes exist — the site only offers phone when SMS is set up. */
chatRouter.get('/join-options', (_req, res) => {
  res.json({ email: true, phone: smsConfigured() })
})

/** Step 1 — send a one-time code, by email or by SMS. */
chatRouter.post('/request-code', codeLimiter, async (req, res, next) => {
  try {
    const identifier = readIdentifier(req.body)
    const nameParsed = z.object({ name: z.string().max(60).optional() }).safeParse(req.body)
    if (!identifier || !nameParsed.success) {
      return res.status(400).json({ error: 'A valid email or phone number is required' })
    }

    if (await collections.chatBans().findOne({ email: identifier })) {
      // Same shape as success — don't tell a banned user they're banned.
      return res.json({ ok: true })
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    await collections.chatCodes().updateOne(
      { email: identifier },
      {
        $set: {
          email: identifier,
          name: (nameParsed.data.name || '').trim().slice(0, 60),
          codeHash: await bcrypt.hash(code, 10),
          expiresAt: new Date(Date.now() + CODE_TTL_MS),
          attempts: 0,
        },
      },
      { upsert: true },
    )

    if (isEmail(identifier)) {
      sendChatCode(identifier, code)
    } else {
      sendSms(
        identifier,
        `${code} is your code to join the chat. It expires in 10 minutes.`,
      ).catch((err) => console.error('[sms] code send failed:', err.message))
    }
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

/** Step 2 — check the code and open a session. */
chatRouter.post('/verify', verifyLimiter, async (req, res, next) => {
  try {
    const identifier = readIdentifier(req.body)
    const parsed = z.object({ code: z.string().length(6) }).safeParse(req.body)
    if (!identifier || !parsed.success) {
      return res.status(400).json({ error: 'Enter the 6-digit code' })
    }

    const email = identifier
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

    const displayName =
      record.name || (isEmail(email) ? email.split('@')[0] : `…${email.slice(-4)}`)
    await collections.chatMembers().updateOne(
      { email },
      {
        $set: {
          email,
          name: displayName,
          lastSeenAt: new Date(),
          ...(isEmail(email) ? {} : { phone: email }),
        },
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

    res.json({
      me: req.chatUser.email,
      // `mine` instead of exposing every author's email to every member.
      messages: rows
        .reverse()
        .map((m) => ({ ...shape(m), mine: m.email === req.chatUser.email })),
    })
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

/* ─── discussion topics ──────────────────────────────────────── */

const SETTINGS_ID = 'chat'

/** Public: the chat shows the current discussion topics to members. */
chatRouter.get('/topics', async (_req, res, next) => {
  try {
    const doc = await collections.settings().findOne({ _id: SETTINGS_ID })
    res.json({ topics: doc?.topics || [] })
  } catch (err) {
    next(err)
  }
})

/* ─── moderation, admin only ─────────────────────────────────── */

/** Everyone who has ever joined, with ban state and live-session count. */
chatRouter.get('/admin/members', requireAdmin, async (_req, res, next) => {
  try {
    const [members, bans, sessions] = await Promise.all([
      collections.chatMembers().find({}).sort({ joinedAt: -1 }).limit(500).toArray(),
      collections.chatBans().find({}).toArray(),
      collections
        .chatSessions()
        .aggregate([{ $group: { _id: '$email', n: { $sum: 1 } } }])
        .toArray(),
    ])
    const banned = new Set(bans.map((b) => b.email))
    const live = new Map(sessions.map((s) => [s._id, s.n]))
    res.json(
      members.map((m) => ({
        email: m.email,
        phone: m.phone || null,
        name: m.name,
        joinedAt: m.joinedAt,
        lastSeenAt: m.lastSeenAt,
        banned: banned.has(m.email),
        sessions: live.get(m.email) || 0,
      })),
    )
  } catch (err) {
    next(err)
  }
})

chatRouter.get('/admin/settings', requireAdmin, async (_req, res, next) => {
  try {
    const doc = await collections.settings().findOne({ _id: SETTINGS_ID })
    res.json({ topics: doc?.topics || [] })
  } catch (err) {
    next(err)
  }
})

chatRouter.put('/admin/settings', requireAdmin, async (req, res, next) => {
  try {
    const parsed = z
      .object({ topics: z.array(z.string().trim().min(1).max(120)).max(12) })
      .safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'Topics must be 1–120 characters, 12 at most.' })
    }
    await collections.settings().updateOne(
      { _id: SETTINGS_ID },
      { $set: { topics: parsed.data.topics, updatedAt: new Date(), updatedBy: req.admin.email } },
      { upsert: true },
    )
    await audit(req.admin.email, 'chat.settings', { topics: parsed.data.topics.length })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

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
    const email = readIdentifierLoose(req.body)
    if (!email) return res.status(400).json({ error: 'Valid email or phone required' })

    await collections
      .chatBans()
      .updateOne(
        { email },
        { $set: { email, bannedAt: new Date(), bannedBy: req.admin.email } },
        { upsert: true },
      )
    // Kill their live sessions too, so the ban bites straight away.
    await collections.chatSessions().deleteMany({ email })

    // Fire and forget — tell them on the channel they joined with.
    if (isEmail(email)) {
      notifyChatBanned(email)
    } else if (smsConfigured()) {
      sendSms(email, 'Your access to the group chat has been removed.').catch(() => {})
    }

    await audit(req.admin.email, 'chat.ban', { email })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

chatRouter.post('/admin/unban', requireAdmin, async (req, res, next) => {
  try {
    const email = readIdentifierLoose(req.body)
    if (!email) return res.status(400).json({ error: 'Valid email or phone required' })
    await collections.chatBans().deleteOne({ email })
    if (isEmail(email)) {
      notifyChatUnbanned(email)
    } else if (smsConfigured()) {
      sendSms(email, 'Your access to the group chat has been restored.').catch(() => {})
    }
    await audit(req.admin.email, 'chat.unban', { email })
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
