import jwt from 'jsonwebtoken'
import { config } from '../config.js'

/**
 * Admin gate. Two independent checks, both must pass:
 *
 *   1. The bearer token is a valid, unexpired Supabase JWT (verified
 *      cryptographically against the project's JWT secret — not decoded
 *      and trusted).
 *   2. The email inside that token is on the ADMIN_EMAILS allowlist.
 *
 * The second check matters: if signups are ever left open on the Supabase
 * project, a valid token alone would otherwise be enough to get in.
 */
export function requireAdmin(req, res, next) {
  const header = req.get('authorization') || ''
  const [scheme, token] = header.split(' ')

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing bearer token' })
  }

  let payload
  try {
    payload = jwt.verify(token, config.supabaseJwtSecret, {
      algorithms: ['HS256'],
    })
  } catch (err) {
    const expired = err.name === 'TokenExpiredError'
    return res
      .status(401)
      .json({ error: expired ? 'Session expired' : 'Invalid token' })
  }

  const email = String(payload.email || '').toLowerCase()
  if (!email || !config.adminEmails.includes(email)) {
    // Deliberately vague to the client; the detail goes to the log.
    console.warn(`[auth] rejected non-admin login attempt: ${email || '(no email)'}`)
    return res.status(403).json({ error: 'Not authorised' })
  }

  req.admin = { id: payload.sub, email }
  next()
}
