import { config } from './config.js'
import { collections } from './db.js'

/**
 * Google Calendar + Meet.
 *
 * Uses Google's REST API directly rather than the `googleapis` package —
 * that dependency is enormous and we need exactly four calls.
 *
 * Nate authorises once through the admin dashboard. Google returns a
 * refresh token, which is stored in Mongo and exchanged for short-lived
 * access tokens as needed. The refresh token is a credential: it lives
 * server-side only and is never sent to the browser.
 */

const OAUTH_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
const OAUTH_TOKEN = 'https://oauth2.googleapis.com/token'
const CAL_BASE = 'https://www.googleapis.com/calendar/v3'

const SCOPES = ['https://www.googleapis.com/auth/calendar.events']

export const googleConfigured = () =>
  Boolean(config.google.clientId && config.google.clientSecret)

const SETTINGS_ID = 'google'

async function loadTokens() {
  return collections.settings().findOne({ _id: SETTINGS_ID })
}

/** Consent URL. `prompt=consent` + `access_type=offline` is what makes
 *  Google actually return a refresh token — without both, a re-authorising
 *  account silently gets none and the integration breaks a week later. */
export function authUrl(state) {
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: config.google.redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })
  return `${OAUTH_AUTH}?${params}`
}

export async function exchangeCode(code) {
  const res = await fetch(OAUTH_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: config.google.redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error_description || 'Google rejected the code')
  if (!data.refresh_token) {
    throw new Error(
      'Google did not return a refresh token. Revoke access at ' +
        'myaccount.google.com/permissions and connect again.',
    )
  }

  await collections.settings().updateOne(
    { _id: SETTINGS_ID },
    {
      $set: {
        refreshToken: data.refresh_token,
        connectedAt: new Date(),
        scope: data.scope,
      },
    },
    { upsert: true },
  )
  return data
}

export async function disconnect() {
  await collections.settings().deleteOne({ _id: SETTINGS_ID })
}

export async function isConnected() {
  if (!googleConfigured()) return false
  return Boolean((await loadTokens())?.refreshToken)
}

async function accessToken() {
  const stored = await loadTokens()
  if (!stored?.refreshToken) throw new Error('Google Calendar is not connected')

  const res = await fetch(OAUTH_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      refresh_token: stored.refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    // A revoked or expired refresh token can't be recovered automatically.
    throw new Error(data.error_description || 'Could not refresh Google access')
  }
  return data.access_token
}

async function calendarFetch(path, { method = 'GET', body, query } = {}) {
  const token = await accessToken()
  const url = new URL(
    `${CAL_BASE}/calendars/${encodeURIComponent(config.google.calendarId)}${path}`,
  )
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v)

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Google Calendar ${res.status}`)
    err.status = res.status
    throw err
  }
  return data
}

/**
 * "1:00 PM" + "2026-08-05" → RFC3339 local time.
 * Returned without a UTC offset and paired with an explicit timeZone, so
 * Google resolves it in Nate's zone rather than the server's.
 */
function toRfc3339(date, time) {
  const m = String(time).trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$/i)
  if (!m) return null

  let hour = Number(m[1])
  const minute = Number(m[2] || 0)
  const meridiem = (m[3] || '').toLowerCase()

  if (meridiem.startsWith('p') && hour !== 12) hour += 12
  if (meridiem.startsWith('a') && hour === 12) hour = 0

  const pad = (n) => String(n).padStart(2, '0')
  return `${date}T${pad(hour)}:${pad(minute)}:00`
}

function endOf(startIso, minutes) {
  const [datePart, timePart] = startIso.split('T')
  const [h, m] = timePart.split(':').map(Number)
  const total = h * 60 + m + minutes
  const pad = (n) => String(n).padStart(2, '0')
  // Sessions don't run past midnight, so no date rollover to handle.
  return `${datePart}T${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}:00`
}

function eventBody(booking, { withConference } = {}) {
  const start = toRfc3339(booking.date, booking.time)
  if (!start) return null
  const end = endOf(start, config.google.durationMinutes)

  const body = {
    summary: `Coaching — ${booking.name}`,
    description: [
      `Booked through the site.`,
      ``,
      `Name:  ${booking.name}`,
      `Email: ${booking.email}`,
      ``,
      `What they want out of it:`,
      booking.note || '(nothing written)',
    ].join('\n'),
    start: { dateTime: start, timeZone: config.google.timeZone },
    end: { dateTime: end, timeZone: config.google.timeZone },
    attendees: [{ email: booking.email, displayName: booking.name }],
    reminders: { useDefault: true },
  }

  if (withConference) {
    // Asking Google to mint the Meet room. requestId must be unique per
    // request, otherwise Google returns the previous conference.
    body.conferenceData = {
      createRequest: {
        requestId: `ng-${booking._id}-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    }
  }
  return body
}

/** Creates the event with a Meet room and invites the customer. */
export async function createBookingEvent(booking) {
  const body = eventBody(booking, { withConference: true })
  if (!body) throw new Error(`Could not read the time "${booking.time}"`)

  const event = await calendarFetch('/events', {
    method: 'POST',
    body,
    query: {
      conferenceDataVersion: '1', // required or conferenceData is ignored
      sendUpdates: 'all', // Google emails the invite
    },
  })

  return {
    eventId: event.id,
    meetUrl:
      event.hangoutLink ||
      event.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ||
      null,
    htmlLink: event.htmlLink,
  }
}

export async function updateBookingEvent(eventId, booking) {
  const body = eventBody(booking)
  if (!body) throw new Error(`Could not read the time "${booking.time}"`)

  const event = await calendarFetch(`/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    body,
    query: { sendUpdates: 'all' },
  })
  return { eventId: event.id, meetUrl: event.hangoutLink || null }
}

export async function cancelBookingEvent(eventId) {
  await calendarFetch(`/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
    query: { sendUpdates: 'all' },
  })
}
