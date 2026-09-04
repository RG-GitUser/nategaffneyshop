/**
 * Local development bootstrap.
 *
 *   cd server && npm run dev:local
 *
 * Spins up a throwaway in-memory MongoDB, fills in the environment
 * variables the app requires, seeds a test admin, then starts the API.
 * Nothing is installed and nothing persists — every run starts clean.
 *
 * Use this to click through the dashboard before the droplet exists.
 * Production uses `npm start` against the real MONGODB_URI.
 */
// Load .env before anything reads process.env — DEV_ADMIN_* below is
// consumed at module top, long before the server's own config import
// would have loaded dotenv.
import 'dotenv/config'

/**
 * `npm run dev:demo` fills the dashboard with invented sales so the
 * Payments screens can actually be looked at locally — the real Stripe
 * account is unreachable from a laptop without STRIPE_ACCOUNT_ID, and a
 * throwaway database has no orders in it either.
 *
 * Set before anything imports config or devStripe, both of which read
 * this at module load.
 */
const DEMO = process.argv.includes('--demo')
if (DEMO) process.env.DEV_FAKE_STRIPE = '1'

import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { MongoMemoryServer } from 'mongodb-memory-server'
import bcrypt from 'bcryptjs'
import { MongoClient } from 'mongodb'

// Must be a real-looking address with a TLD — the login route validates
// with zod's email check, which rejects bare hosts like admin@localhost.
const DEV_EMAIL = process.env.DEV_ADMIN_EMAIL || 'admin@example.com'
const DEV_PASSWORD = process.env.DEV_ADMIN_PASSWORD || 'localdevpassword'

/**
 * The database files persist in server/.devdb (gitignored), so content
 * edited through the dashboard survives API restarts — without this,
 * every code change that needed a restart silently reset the site to the
 * bundled defaults. Delete the folder for a truly fresh start.
 */
const DATA_DIR = fileURLToPath(new URL('../.devdb', import.meta.url))
await mkdir(DATA_DIR, { recursive: true })

console.log('Starting local MongoDB (data kept in server/.devdb)…')
const mongo = await MongoMemoryServer.create({
  instance: { dbPath: DATA_DIR, storageEngine: 'wiredTiger' },
})
const uri = mongo.getUri()

// Defaults good enough to boot. Anything already set in the real
// environment wins, so you can point at Stripe test keys or SMTP.
process.env.NODE_ENV ||= 'development'
process.env.PORT ||= '8080'
process.env.MONGODB_URI = uri
process.env.MONGODB_DB ||= 'nategaffneyshop'
process.env.JWT_SECRET ||= 'dev-only-secret-'.padEnd(64, '0')
process.env.ALLOWED_ORIGINS ||= 'http://localhost:5173'
process.env.UPLOAD_DIR ||= './uploads-dev'
process.env.UPLOAD_PUBLIC_URL ||= 'http://localhost:8080/uploads'
process.env.STRIPE_SECRET_KEY ||= 'sk_test_placeholder'
process.env.COOKIE_DOMAIN = '' // localhost must not have a cookie domain

// Seed the admin before the app boots so you can sign in straight away.
// Upsert, not insert — with a persistent data dir this runs every boot.
const client = new MongoClient(uri)
await client.connect()
await client
  .db(process.env.MONGODB_DB)
  .collection('admins')
  .updateOne(
    { email: DEV_EMAIL },
    {
      $setOnInsert: {
        email: DEV_EMAIL,
        passwordHash: await bcrypt.hash(DEV_PASSWORD, 10),
        createdAt: new Date(),
      },
    },
    { upsert: true },
  )

/**
 * Demo mode: order rows matching the invented Stripe payments, so each
 * one gets its item title, its kind, its digital flag and a working
 * invoice link. Dynamic import — devStripe reads DEV_FAKE_STRIPE when it
 * loads, and static imports would have run before we set it.
 */
let demoCount = 0
if (DEMO) {
  const { devOrderRows } = await import('../src/devStripe.js')
  const rows = devOrderRows()
  const orders = client.db(process.env.MONGODB_DB).collection('orders')
  await orders.bulkWrite(
    rows.map((row) => ({
      updateOne: { filter: { sessionId: row.sessionId }, update: { $set: row }, upsert: true },
    })),
  )
  demoCount = rows.length

  /**
   * A handful of refund requests, matched against the invented sales
   * above, so the queue in the Payments tab has something in it. Seeded
   * only once — working through them locally should stick, the same way
   * edited content does.
   *
   * Written straight to the collection rather than posted to the API on
   * purpose: the real route emails support and the customer, and a demo
   * database filling up somebody's inbox would be a bad trade.
   */
  const requests = client.db(process.env.MONGODB_DB).collection('refundRequests')
  if ((await requests.countDocuments()) === 0) {
    const hoursAgo = (h) => new Date(Date.now() - h * 60 * 60 * 1000)
    const pick = (i) => rows[i % rows.length]
    const invented = [
      {
        name: 'Priya Raghunathan',
        category: 'never-arrived',
        message:
          'Paid on Tuesday and the download email has never turned up. Not in spam either. Could you send it over, or put the money back?',
        hours: 3,
      },
      {
        name: 'Dan Whitcombe',
        category: 'duplicate',
        message: 'I think my card got charged twice — there are two of these on my statement.',
        hours: 9,
      },
      {
        name: '',
        category: 'technical',
        message: 'The PDF downloads but only the first page renders. Everything after it is blank.',
        hours: 26,
      },
      {
        name: 'Marisol Fuentes',
        category: 'cant-attend',
        message: 'Something has come up at work and I cannot make Thursday. Happy to rebook instead if that is easier.',
        hours: 50,
      },
      {
        name: 'Tom Beazley',
        category: 'never-arrived',
        message: 'Same as my last email — still nothing.',
        hours: 71,
      },
      {
        name: 'Aoife Lenihan',
        category: 'not-as-described',
        message:
          'I was expecting the weekly planning system the page describes, and what I got reads more like a short intro. Not what I thought I was buying.',
        hours: 96,
      },
    ]

    await requests.insertMany(
      invented.map((r, i) => {
        const order = pick(i * 3)
        return {
          email: `${(r.name || 'someone').split(' ')[0].toLowerCase()}@example.com`,
          name: r.name,
          reference: '',
          category: r.category,
          message: r.message,
          status: 'open',
          paymentIntent: order.paymentIntent,
          orderTitle: order.title,
          orderAmount: order.amount,
          orderCurrency: order.currency,
          orderPaidAt: order.createdAt,
          orderDigital: Boolean(order.digital),
          orderCount: (i % 3) + 1,
          matchedByReference: false,
          createdAt: hoursAgo(r.hours),
          updatedAt: hoursAgo(r.hours),
        }
      }),
    )
  }
}

/**
 * First boot on a fresh data dir: the API is the source of truth for the
 * public cards even when empty, so empty collections would render a
 * homepage with no products at all. Seed the bundled content.js cards
 * once; from then on the dashboard owns them. content.js is pure data
 * with no imports, so node can load it straight from the frontend tree.
 */
const db = client.db(process.env.MONGODB_DB)
const bundled = await import('../../src/content.js')
if ((await db.collection('shopItems').countDocuments()) === 0 && bundled.offers.length) {
  await db.collection('shopItems').insertMany(
    bundled.offers.map((o, i) => ({ ...o, order: i, visible: true, createdAt: new Date() })),
  )
  console.log(`  SEED     ${bundled.offers.length} shop card(s) from content.js`)
}
if ((await db.collection('services').countDocuments()) === 0 && bundled.services.length) {
  await db.collection('services').insertMany(
    bundled.services.map((s, i) => ({ ...s, order: i, visible: true, createdAt: new Date() })),
  )
  console.log(`  SEED     ${bundled.services.length} service card(s) from content.js`)
}

await client.close()

console.log('')
if (DEMO) {
  console.log(`  DEMO     ${demoCount} invented sales seeded — Payments shows fake data`)
  console.log('')
}
console.log('  API      http://localhost:8080')
console.log(`  Sign in  ${DEV_EMAIL} / ${DEV_PASSWORD}`)
console.log('  Admin UI http://localhost:5173/admin/  (run `npm run dev` in the project root)')
console.log('')
console.log('  Data persists in server/.devdb — delete that folder to reset.')
console.log('')

await import('../src/index.js')

const shutdown = async () => {
  await mongo.stop()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
