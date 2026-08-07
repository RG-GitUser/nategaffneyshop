import { Router } from 'express'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { config } from '../config.js'
import { audit } from '../db.js'
import { requireAdmin } from '../middleware/auth.js'
import {
  googleConfigured,
  isConnected,
  authUrl,
  exchangeCode,
  disconnect,
  calendarSettings,
  saveCalendarSettings,
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
    const settings = await calendarSettings()
    res.json({
      configured: googleConfigured(),
      connected: await isConnected(),
      ...settings,
    })
  } catch (err) {
    next(err)
  }
})

/** Calendar options, editable from the dashboard. */
googleRouter.put('/settings', requireAdmin, async (req, res, next) => {
  try {
    const parsed = z
      .object({
        calendarId: z.string().trim().min(1).max(200),
        timeZone: z.string().trim().min(1).max(64),
        durationMinutes: z.number().int().min(15).max(240),
      })
      .safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid settings', details: parsed.error.flatten() })
    }

    // Reject a timezone the runtime doesn't know — a typo here would
    // otherwise put every future event at the wrong hour.
    try {
      new Intl.DateTimeFormat('en', { timeZone: parsed.data.timeZone })
    } catch {
      return res.status(400).json({ error: `Unknown time zone "${parsed.data.timeZone}"` })
    }

    await saveCalendarSettings(parsed.data)
    await audit(req.admin.email, 'google.settings', parsed.data)
    res.json({ ok: true })
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

  // Without this, the consent URL goes out with an empty redirect_uri and
  // Google shows an "invalid_request" page — fail here, readably, instead.
  if (!config.google.redirectUri) {
    return res
      .status(503)
      .json({ error: 'Set GOOGLE_REDIRECT_URI in server/.env first.' })
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
  // This page renders on the API origin, so it can't use the site's CSS —
  // it fakes the same look (bone paper, serif, navy/oxblood accents) inline.
  const site = config.allowedOrigins[0] || ''
  const done = (msg, ok) => {
    const accent = ok ? '#05192b' : '#500d0d'
    res
      .status(ok ? 200 : 400)
      .type('html')
      .send(
        `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
          `<meta name="viewport" content="width=device-width, initial-scale=1">` +
          `<meta name="robots" content="noindex">` +
          `<title>${ok ? 'Calendar connected' : 'Could not connect'}</title></head>` +
          `<body style="margin:0;min-height:100vh;display:grid;place-items:center;` +
          `background:#f1ede4;color:#120b07;font-family:Garamond,Georgia,'Times New Roman',serif;">` +
          `<main style="max-width:26rem;margin:24px;padding:40px 36px;background:#f6f3ed;` +
          `border:1px solid #d8d5cf;border-left:4px solid ${accent};border-radius:14px;` +
          `box-shadow:0 12px 34px rgba(18,11,7,.16);">` +
          `<p style="margin:0;font-size:11px;font-weight:700;letter-spacing:2px;` +
          `text-transform:uppercase;color:${accent};font-family:ui-sans-serif,system-ui,sans-serif;">` +
          `Google Calendar</p>` +
          `<h1 style="margin:10px 0 0;font-size:28px;font-weight:600;letter-spacing:.02em;">` +
          `${ok ? 'Calendar connected' : 'Could not connect'}</h1>` +
          `<p style="margin:14px 0 0;font-size:17px;line-height:1.6;color:#605952;">${msg}</p>` +
          `<a href="${site}/admin/" style="display:inline-block;margin-top:26px;padding:12px 24px;` +
          `background:#05192b;color:#ebe5d8;text-decoration:none;border-radius:6px;` +
          `font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px;font-weight:600;">` +
          `Back to the dashboard</a>` +
          `</main></body></html>`,
      )
  }

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
