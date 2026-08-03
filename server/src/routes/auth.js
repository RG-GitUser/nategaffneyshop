import { Router } from 'express'
import bcrypt from 'bcryptjs'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { collections, audit } from '../db.js'
import {
  COOKIE_NAME,
  cookieOptions,
  signSession,
  requireAdmin,
} from '../middleware/auth.js'

export const authRouter = Router()

/** Brute force is the realistic attack on a single known admin address,
 *  so the login endpoint gets a far tighter limit than everything else. */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many attempts. Try again in 15 minutes.' },
})

const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
})

authRouter.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'Email and password required' })
    }

    const email = parsed.data.email.toLowerCase().trim()
    const admin = await collections.admins().findOne({ email })

    // Always run a hash comparison, even when the account doesn't exist.
    // Returning early would make missing accounts measurably faster to
    // reject, which leaks which addresses are real.
    const hash = admin?.passwordHash || '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin'
    const ok = await bcrypt.compare(parsed.data.password, hash)

    if (!admin || !ok) {
      console.warn(`[auth] failed login for ${email} from ${req.ip}`)
      // Same message either way — never confirm whether the address exists.
      return res.status(401).json({ error: 'Those details did not work.' })
    }

    const token = signSession(admin)
    res.cookie(COOKIE_NAME, token, cookieOptions())

    await collections
      .admins()
      .updateOne({ _id: admin._id }, { $set: { lastLoginAt: new Date() } })
    await audit(admin.email, 'auth.login', { ip: req.ip })

    // Token also returned for clients that can't use the cookie.
    res.json({ email: admin.email, token })
  } catch (err) {
    next(err)
  }
})

authRouter.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined })
  res.json({ ok: true })
})

/** The admin app calls this on load to decide whether to show the dashboard. */
authRouter.get('/me', requireAdmin, (req, res) => {
  res.json({ email: req.admin.email })
})

/** Change password. Requires the current one, so a stolen session alone
 *  can't be used to lock Nate out of his own dashboard. */
const changeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12).max(200),
})

authRouter.post('/password', requireAdmin, async (req, res, next) => {
  try {
    const parsed = changeSchema.safeParse(req.body)
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'New password must be at least 12 characters.' })
    }

    const admin = await collections.admins().findOne({ email: req.admin.email })
    if (!admin) return res.status(404).json({ error: 'Account not found' })

    const ok = await bcrypt.compare(parsed.data.currentPassword, admin.passwordHash)
    if (!ok) return res.status(401).json({ error: 'Current password is wrong.' })

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12)
    await collections
      .admins()
      .updateOne({ _id: admin._id }, { $set: { passwordHash, updatedAt: new Date() } })

    await audit(admin.email, 'auth.password_change', {})
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})
