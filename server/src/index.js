import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import { config } from './config.js'
import { connect, close } from './db.js'
import { verifyMail } from './mailer.js'
import { authRouter } from './routes/auth.js'
import { contentRouter } from './routes/content.js'
import { shopRouter } from './routes/shop.js'
import { servicesRouter } from './routes/services.js'
import { bookingsRouter } from './routes/bookings.js'
import { paymentsRouter } from './routes/payments.js'
import { mediaRouter } from './routes/media.js'
import { circleRouter } from './routes/circle.js'
import { chatRouter } from './routes/chat.js'
import { googleRouter } from './routes/google.js'
import { checkoutRouter } from './routes/checkout.js'
import { metricsRouter } from './routes/metrics.js'
import { invoiceRouter } from './routes/invoice.js'

const app = express()

// Behind nginx on the droplet, so rate limiting and req.ip see the real
// client address rather than 127.0.0.1.
app.set('trust proxy', 1)

app.use(
  helmet({
    // Uploaded images are served from here and displayed on the site,
    // which sits on a different origin.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
)
/**
 * The Stripe webhook must be mounted BEFORE express.json().
 *
 * Signature verification hashes the exact bytes Stripe sent. Parsing the
 * JSON and re-stringifying it produces a different byte sequence and a
 * different hash, so every event would be rejected as forged.
 */
app.use('/api/checkout/webhook', express.raw({ type: 'application/json' }))

app.use(express.json({ limit: '256kb' }))
app.use(cookieParser())

app.use(
  cors({
    origin(origin, cb) {
      // Same-origin and server-to-server calls arrive with no Origin header.
      if (!origin) return cb(null, true)
      if (config.allowedOrigins.includes(origin)) return cb(null, true)
      cb(new Error(`Origin not allowed: ${origin}`))
    },
    // Required for the httpOnly session cookie to be sent at all.
    credentials: true,
  }),
)

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
  }),
)

// Uploaded images. Static, long-cached — filenames carry a random suffix
// so a replaced image never collides with a cached one.
app.use(
  '/uploads',
  express.static(config.uploadDir, {
    maxAge: '30d',
    index: false,
    dotfiles: 'deny',
  }),
)

app.get('/health', (_req, res) => res.json({ ok: true }))

app.use('/api/auth', authRouter)
app.use('/api/content', contentRouter)
app.use('/api/shop', shopRouter)
app.use('/api/services', servicesRouter)
app.use('/api/bookings', bookingsRouter)
app.use('/api/payments', paymentsRouter)
app.use('/api/media', mediaRouter)
app.use('/api/circle', circleRouter)
app.use('/api/chat', chatRouter)
app.use('/api/google', googleRouter)
app.use('/api/checkout', checkoutRouter)
app.use('/api/metrics', metricsRouter)
app.use('/api/invoice', invoiceRouter)

app.use((_req, res) => res.status(404).json({ error: 'Not found' }))

// Last resort. Logs the real error, returns something that leaks nothing.
app.use((err, _req, res, _next) => {
  console.error('[error]', err)
  if (err?.message?.startsWith('Origin not allowed')) {
    return res.status(403).json({ error: 'Origin not allowed' })
  }
  res.status(500).json({ error: 'Something went wrong' })
})

let server
try {
  await connect()
  await verifyMail()
  server = app.listen(config.port, () => {
    console.log(`API listening on :${config.port} (${config.env})`)
    console.log(`Allowed origins: ${config.allowedOrigins.join(', ') || '(any)'}`)
  })
} catch (err) {
  console.error('Failed to start:', err.message)
  process.exit(1)
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, async () => {
    console.log(`${signal} received, shutting down`)
    server?.close()
    await close()
    process.exit(0)
  })
}
