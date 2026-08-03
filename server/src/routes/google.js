import { Router } from 'express'
import { randomBytes } from 'node:crypto'
import { config } from '../config.js'
import { audit } from '../db.js'
import { requireAdmin } from '../middleware/auth.js'
import {
  googleConfigured,
  isConnected,
  authUrl,
  exchangeCode,
  disconnect,
} from '../google.js'

export const googleRouter = Router()

/**
 * OAuth consent flow for Nate's Google Calendar.
 *
 * The `state` value is a random nonce stored in a short-lived cookie and
 * checked on the way back. Without it, an attacker could hand Nate a
 * crafted callback URL and attach *their* Google account to his
 * dashboard, so every booking invite would land in the attacker's
 * calendar.
 */
const STATE_COOKIE = 'ng_gstate'

googleRouter.get('/status', requireAdmin, async (_req, res, next) => {
  try {
    res.json({
      configured: googleConfigured(),
      connected: await isConnected(),
      calendarId: config.google.calendarId,
      timeZone: config.google.timeZone,
      durationMinutes: config.google.durationMinutes,
    })
  } catch (err) {
    next(err)
  }
})

googleRouter.get('/connect', requireAdmin, (req, res) => {
  if (!googleConfigured()) {
    return res
      .status(503)
      .json({ error: 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first.' })
  }

  const state = randomBytes(16).toString('hex')
  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax',
    domain: config.cookieDomain || undefined,
    path: '/',
    maxAge: 10 * 60 * 1000,
  })
  res.json({ url: authUrl(state) })
})

/** Google redirects the browser here. Not behind requireAdmin — the
 *  admin cookie may not survive the round trip through Google — so the
 *  state nonce is what proves this callback belongs to the person who
 *  started the flow. */
googleRouter.get('/callback', async (req, res, next) => {
  const done = (msg, ok) =>
    res
      .status(ok ? 200 : 400)
      .type('html')
      .send(
        `<!doctype html><meta charset="utf-8"><title>Google Calendar</title>` +
          `<body style="font-family:system-ui;max-width:34rem;margin:14vh auto;padding:0 1.5rem;line-height:1.6">` +
          `<h1 style="font-size:1.4rem">${ok ? 'Calendar connected' : 'Could not connect'}</h1>` +
          `<p>${msg}</p><p><a href="/admin/">Back to the dashboard</a></p></body>`,
      )

  try {
    if (req.query.error) return done(`Google said: ${req.query.error}`, false)

    const state = req.cookies?.[STATE_COOKIE]
    if (!state || state !== req.query.state) {
      return done('That link did not come from this dashboard. Start again.', false)
    }
    res.clearCookie(STATE_COOKIE, { path: '/', domain: config.cookieDomain || undefined })

    if (!req.query.code) return done('Google did not send an authorisation code.', false)

    await exchangeCode(String(req.query.code))
    await audit('google-oauth', 'google.connect', {})

    done('New bookings will get a Meet link and a calendar invite automatically.', true)
  } catch (err) {
    if (err.message) return done(err.message, false)
    next(err)
  }
})

googleRouter.post('/disconnect', requireAdmin, async (req, res, next) => {
  try {
    await disconnect()
    await audit(req.admin.email, 'google.disconnect', {})
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})
