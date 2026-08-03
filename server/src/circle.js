import { config } from './config.js'
import { collections } from './db.js'

/**
 * Circle.so client.
 *
 * Both Circle tokens are secrets and stay in this process:
 *   - CIRCLE_HEADLESS_TOKEN mints per-member access tokens
 *   - CIRCLE_ADMIN_TOKEN creates community members
 * Circle's own docs are explicit: "Do not run or expose any of these
 * authentication functions in your client-side codebase."
 *
 * The per-member access token never reaches the browser either. It is
 * stored server-side against a session and every chat call is proxied,
 * so a visitor's browser can only ever do the two things we expose —
 * read the room and post to it — rather than hold a general-purpose
 * member token good for the whole Circle API.
 */

const AUTH_URL = 'https://app.circle.so/api/v1/headless/auth_token'
const MEMBER_BASE = 'https://app.circle.so/api/headless/v1'
const ADMIN_BASE = 'https://app.circle.so/api/admin/v2'

export const circleEnabled = () =>
  Boolean(config.circle.headlessToken && config.circle.chatRoomUuid)

async function circleFetch(url, { token, method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await res.text()
  let payload = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = { raw: text }
  }

  if (!res.ok) {
    const err = new Error(payload?.message || `Circle responded ${res.status}`)
    err.status = res.status
    err.payload = payload
    throw err
  }
  return payload
}

/** Creates the community member if they don't exist yet. A 422 for an
 *  already-registered email is the normal path, not a failure. */
export async function ensureCommunityMember(email, name) {
  if (!config.circle.adminToken) return
  try {
    await circleFetch(`${ADMIN_BASE}/community_members`, {
      token: config.circle.adminToken,
      method: 'POST',
      body: { email, name: name || email.split('@')[0] },
    })
  } catch (err) {
    if (err.status !== 422 && err.status !== 409) {
      console.warn(`[circle] could not create member ${email}: ${err.message}`)
    }
  }
}

export async function mintMemberTokens(email) {
  return circleFetch(AUTH_URL, {
    token: config.circle.headlessToken,
    method: 'POST',
    body: { email },
  })
}

async function refreshMemberToken(refreshToken) {
  return circleFetch(AUTH_URL, {
    token: config.circle.headlessToken,
    method: 'POST',
    body: { refresh_token: refreshToken },
  })
}

/**
 * Returns a valid access token for the session, refreshing it first if it
 * is close to expiry. Circle access tokens last an hour; the refresh token
 * lasts a month.
 */
export async function accessTokenFor(session) {
  const soon = Date.now() + 60_000 // refresh a minute early rather than mid-request
  if (session.accessToken && session.accessExpiresAt > soon) {
    return session.accessToken
  }

  const fresh = await refreshMemberToken(session.refreshToken)
  const accessToken = fresh.access_token
  const accessExpiresAt = Date.now() + 55 * 60 * 1000

  await collections
    .circleSessions()
    .updateOne({ _id: session._id }, { $set: { accessToken, accessExpiresAt } })

  return accessToken
}

export async function joinSpace(token) {
  if (!config.circle.spaceId) return
  try {
    await circleFetch(`${MEMBER_BASE}/spaces/${config.circle.spaceId}/join`, {
      token,
      method: 'POST',
    })
  } catch (err) {
    // Already a member is fine — anything else is worth knowing about.
    if (err.status !== 422) {
      console.warn(`[circle] join space failed: ${err.message}`)
    }
  }
}

export async function fetchMessages(token, { perPage = 30 } = {}) {
  const url = new URL(
    `${MEMBER_BASE}/messages/${config.circle.chatRoomUuid}/chat_room_messages`,
  )
  url.searchParams.set('previous_per_page', String(perPage))
  return circleFetch(url.toString(), { token })
}

export async function postMessage(token, text) {
  // Circle stores message bodies as TipTap documents, not plain strings.
  const rich_text_body = {
    body: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    },
  }
  return circleFetch(
    `${MEMBER_BASE}/messages/${config.circle.chatRoomUuid}/chat_room_messages`,
    { token, method: 'POST', body: { rich_text_body } },
  )
}

/** Flattens a TipTap document back to plain text for display. */
export function richTextToPlain(node) {
  if (!node) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(richTextToPlain).join('')
  if (node.text) return node.text
  if (node.content) {
    const joined = richTextToPlain(node.content)
    return node.type === 'paragraph' ? `${joined}\n` : joined
  }
  if (node.body) return richTextToPlain(node.body)
  return ''
}
