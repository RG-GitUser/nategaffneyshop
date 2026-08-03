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
    req.admin = { id: payload.sub, email: payload.email }
    next()
  } catch (err) {
    const expired = err.name === 'TokenExpiredError'
    res.status(401).json({ error: expired ? 'Session expired' : 'Invalid session' })
  }
}
