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
import { MongoMemoryServer } from 'mongodb-memory-server'
import bcrypt from 'bcryptjs'
import { MongoClient } from 'mongodb'

// Must be a real-looking address with a TLD — the login route validates
// with zod's email check, which rejects bare hosts like admin@localhost.
const DEV_EMAIL = process.env.DEV_ADMIN_EMAIL || 'admin@example.com'
const DEV_PASSWORD = process.env.DEV_ADMIN_PASSWORD || 'localdevpassword'

console.log('Starting in-memory MongoDB…')
const mongo = await MongoMemoryServer.create()
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
const client = new MongoClient(uri)
await client.connect()
await client
  .db(process.env.MONGODB_DB)
  .collection('admins')
  .insertOne({
    email: DEV_EMAIL,
    passwordHash: await bcrypt.hash(DEV_PASSWORD, 10),
    createdAt: new Date(),
  })
await client.close()

console.log('')
console.log('  API      http://localhost:8080')
console.log(`  Sign in  ${DEV_EMAIL} / ${DEV_PASSWORD}`)
console.log('  Admin UI http://localhost:5173/admin/  (run `npm run dev` in the project root)')
console.log('')
console.log('  In-memory database — everything is wiped when you stop this.')
console.log('')

await import('../src/index.js')

const shutdown = async () => {
  await mongo.stop()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
