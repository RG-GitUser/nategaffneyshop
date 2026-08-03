import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { config } from './config.js'
import { connect, close } from './db.js'
import { contentRouter } from './routes/content.js'
import { shopRouter } from './routes/shop.js'
import { bookingsRouter } from './routes/bookings.js'
import { paymentsRouter } from './routes/payments.js'
import { mediaRouter } from './routes/media.js'

const app = express()

// Behind DigitalOcean's load balancer, so rate limiting sees the real IP
// rather than the proxy's.
app.set('trust proxy', 1)

app.use(helmet())
app.use(express.json({ limit: '256kb' }))

app.use(
  cors({
    origin(origin, cb) {
      // Same-origin and server-to-server calls arrive with no Origin header.
      if (!origin) return cb(null, true)
      if (config.allowedOrigins.includes(origin)) return cb(null, true)
      cb(new Error(`Origin not allowed: ${origin}`))
    },
    credentials: false,
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

app.get('/health', (_req, res) => res.json({ ok: true }))

app.use('/api/content', contentRouter)
app.use('/api/shop', shopRouter)
app.use('/api/bookings', bookingsRouter)
app.use('/api/payments', paymentsRouter)
app.use('/api/media', mediaRouter)

app.use((_req, res) => res.status(404).json({ error: 'Not found' }))

// Last resort. Logs the real error, returns something that leaks nothing.
app.use((err, _req, res, _next) => {
  console.error('[error]', err)
  if (err?.message?.startsWith('Origin not allowed')) {
    return res.status(403).json({ error: 'Origin not allowed' })
  }
  res.status(500).json({ error: 'Something went wrong' })
})

const server = await connect()
  .then(() =>
    app.listen(config.port, () => {
      console.log(`API listening on :${config.port} (${config.env})`)
      console.log(`Admins: ${config.adminEmails.join(', ')}`)
    }),
  )
  .catch((err) => {
    console.error('Failed to start:', err.message)
    process.exit(1)
  })

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, async () => {
    console.log(`${signal} received, shutting down`)
    server?.close()
    await close()
    process.exit(0)
  })
}
