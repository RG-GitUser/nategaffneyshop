import { createHmac } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { config } from '../config.js'

export const COOKIE_NAME = 'ng_session'

export function signSession(admin) {
  return jwt.sign(
    { sub: admin._id.toString(), email: admin.email },
    config.jwtSecret,
    { expiresIn: `${config.sessionHours}h`, algorithm: 'HS256' },
  )
}

/**
 * Tokens that are handed to customers (PDF download links) must never be
 * usable as an admin session. They are signed with a key DERIVED from
 * JWT_SECRET rather than the secret itself, so a customer's token fails
 * signature verification on every admin route no matter what claims it
 * carries — separation by cryptography, not by convention.
 *
 * Derived rather than a second env var so existing deployments don't
 * need new configuration to be safe.
 */
function purposeKey(purpose) {
  return createHmac('sha256', config.jwtSecret).update(`purpose:${purpose}`).digest('hex')
}

const DOWNLOAD_PURPOSE = 'pdf-download'

export function signDownloadToken(sessionId, expiresIn = '7d') {
  return jwt.sign({ purpose: DOWNLOAD_PURPOSE, sid: sessionId }, purposeKey(DOWNLOAD_PURPOSE), {
    expiresIn,
    algorithm: 'HS256',
  })
}

/** Returns the Stripe checkout session id, or null if the token is bad. */
export function verifyDownloadToken(token) {
  try {
    const payload = jwt.verify(String(token || ''), purposeKey(DOWNLOAD_PURPOSE), {
      algorithms: ['HS256'],
    })
    return payload.purpose === DOWNLOAD_PURPOSE && payload.sid ? payload.sid : null
  } catch {
    return null
  }
}

export function cookieOptions() {
  return {
    httpOnly: true, // JavaScript can't read it, so XSS can't steal the session
    secure: config.isProd, // HTTPS only in production
    sameSite: 'lax', // survives the site → api.site subdomain hop
    domain: config.cookieDomain || undefined,
    path: '/',
    maxAge: config.sessionHours * 60 * 60 * 1000,
  }
}

/**
 * Admin gate for every protected route.
 *
 * Reads the session from the httpOnly cookie, falling back to an
 * Authorization header (useful for curl and for a frontend hosted on an
 * unrelated domain where the cookie wouldn't be sent).
 *
 * The token is verified cryptographically — never decoded and trusted.
 */
export function requireAdmin(req, res, next) {
  let token = req.cookies?.[COOKIE_NAME]

  if (!token) {
    const [scheme, headerToken] = (req.get('authorization') || '').split(' ')
    if (scheme === 'Bearer' && headerToken) token = headerToken
  }

  if (!token) return res.status(401).json({ error: 'Not signed in' })

  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] })

    /**
     * Belt and braces alongside the derived signing keys above: only a
     * real session token carries both sub and email, and no session
     * token ever carries `purpose`. A token minted for anything else is
     * refused here even if it somehow verified.
     */
    if (!payload.sub || !payload.email || payload.purpose) {
      return res.status(401).json({ error: 'Invalid session' })
    }

    req.admin = { id: payload.sub, email: payload.email }
    next()
  } catch (err) {
    const expired = err.name === 'TokenExpiredError'
    res.status(401).json({ error: expired ? 'Session expired' : 'Invalid session' })
  }
}
