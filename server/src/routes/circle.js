import { Router } from 'express'
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcryptjs'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { config } from '../config.js'
import { collections } from '../db.js'
import { sendChatCode } from '../mailer.js'
import {
  circleEnabled,
  ensureCommunityMember,
  mintMemberTokens,
  accessTokenFor,
  joinSpace,
  fetchMessages,
  postMessage,
  richTextToPlain,
} from '../circle.js'

export const circleRouter = Router()

const COOKIE = 'ng_circle'
const CODE_TTL_MS = 10 * 60 * 1000
const SESSION_DAYS = 25 // Circle refresh tokens last a month

/**
 * Why there is an email code step at all:
 *
 * Circle mints a member access token from an email address alone. If the
 * site let anyone type any address and handed back a session, you could
 * type someone else's email and post to the community as them. The code
 * proves the person owns the inbox before any Circle token is created.
 */
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

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax',
    domain: config.cookieDomain || undefined,
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  }
}

function guard(req, res, next) {
  if (!circleEnabled()) {
    return res.status(503).json({ error: 'Community chat is not configured yet.' })
  }
  next()
}

async function loadSession(req, res, next) {
  const id = req.cookies?.[COOKIE]
  if (!id) return res.status(401).json({ error: 'Not joined' })

  const session = await collections.circleSessions().findOne({ sessionId: id })
  if (!session) {
    res.clearCookie(COOKIE, { ...sessionCookieOptions(), maxAge: undefined })
    return res.status(401).json({ error: 'Not joined' })
  }
  req.circleSession = session
  next()
}

/** Step 1 — email a one-time code. */
circleRouter.post('/request-code', guard, codeLimiter, async (req, res, next) => {
  try {
    const parsed = z
      .object({ email: z.string().email().max(200), name: z.string().max(120).optional() })
      .safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'A valid email is required' })

    const email = parsed.data.email.toLowerCase().trim()
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')

    await collections.circleCodes().updateOne(
      { email },
      {
        $set: {
          email,
          name: parsed.data.name || '',
          codeHash: await bcrypt.hash(code, 10),
          expiresAt: new Date(Date.now() + CODE_TTL_MS),
          attempts: 0,
        },
      },
      { upsert: true },
    )

    sendChatCode(email, code)

    // Same response whether or not the address is already in the community,
    // so this can't be used to enumerate members.
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

/** Step 2 — check the code, then create the Circle session. */
circleRouter.post('/verify', guard, verifyLimiter, async (req, res, next) => {
  try {
    const parsed = z
      .object({ email: z.string().email().max(200), code: z.string().length(6) })
      .safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Enter the 6-digit code' })

    const email = parsed.data.email.toLowerCase().trim()
    const record = await collections.circleCodes().findOne({ email })

    if (!record || record.expiresAt < new Date()) {
      return res.status(400).json({ error: 'That code has expired. Request a new one.' })
    }
    if (record.attempts >= 6) {
      return res.status(429).json({ error: 'Too many wrong codes. Request a new one.' })
    }

    const ok = await bcrypt.compare(parsed.data.code, record.codeHash)
    if (!ok) {
      await collections.circleCodes().updateOne({ email }, { $inc: { attempts: 1 } })
      return res.status(400).json({ error: 'That code is not right.' })
    }

    // Single use.
    await collections.circleCodes().deleteOne({ email })

    await ensureCommunityMember(email, record.name)
    const tokens = await mintMemberTokens(email)

    const sessionId = randomBytes(32).toString('hex')
    const session = {
      sessionId,
      email,
      name: record.name || email.split('@')[0],
      communityMemberId: tokens.community_member_id,
      accessToken: tokens.access_token,
      accessExpiresAt: Date.now() + 55 * 60 * 1000,
      refreshToken: tokens.refresh_token,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000),
    }
    await collections.circleSessions().insertOne(session)

    await joinSpace(tokens.access_token)

    res.cookie(COOKIE, sessionId, sessionCookieOptions())
    res.json({ email, name: session.name })
  } catch (err) {
    if (err.status) {
      console.error('[circle] verify failed:', err.status, err.message)
      return res
        .status(502)
        .json({ error: 'Could not reach the community right now. Try again shortly.' })
    }
    next(err)
  }
})

/** Are we already joined? Called on page load. */
circleRouter.get('/session', guard, async (req, res) => {
  const id = req.cookies?.[COOKIE]
  if (!id) return res.json({ joined: false })
  const session = await collections.circleSessions().findOne({ sessionId: id })
  res.json(
    session ? { joined: true, email: session.email, name: session.name } : { joined: false },
  )
})

circleRouter.post('/leave', (req, res) => {
  res.clearCookie(COOKIE, { ...sessionCookieOptions(), maxAge: undefined })
  res.json({ ok: true })
})

/** Read the room. */
circleRouter.get('/messages', guard, loadSession, async (req, res, next) => {
  try {
    const token = await accessTokenFor(req.circleSession)
    const payload = await fetchMessages(token)
    const records = payload?.records || payload?.messages || []

    res.json({
      me: req.circleSession.email,
      messages: records.map((m) => ({
        id: m.id,
        body: richTextToPlain(m.rich_text_body).trim(),
        sentAt: m.created_at || m.sent_at,
        authorName:
          m.sender?.name || m.community_member?.name || m.user?.name || 'Member',
        authorAvatar: m.sender?.avatar_url || m.community_member?.avatar_url || null,
      })),
    })
  } catch (err) {
    if (err.status) return res.status(502).json({ error: 'Could not load messages.' })
    next(err)
  }
})

/** Post to the room. */
circleRouter.post('/messages', guard, loadSession, postLimiter, async (req, res, next) => {
  try {
    const parsed = z.object({ body: z.string().min(1).max(2000) }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Write something first' })

    const token = await accessTokenFor(req.circleSession)
    await postMessage(token, parsed.data.body.trim())
    res.status(201).json({ ok: true })
  } catch (err) {
    if (err.status) return res.status(502).json({ error: 'Could not send that message.' })
    next(err)
  }
})
