import { MongoClient } from 'mongodb'
import { config } from './config.js'

let client
let db

export async function connect() {
  if (db) return db
  client = new MongoClient(config.mongoUri, { retryWrites: true })
  await client.connect()
  db = client.db(config.mongoDb)

  // Bookings get queried by date constantly; content is a single doc.
  await db.collection('bookings').createIndex({ date: 1, time: 1 })
  await db.collection('bookings').createIndex({ status: 1, createdAt: -1 })
  await db.collection('shopItems').createIndex({ order: 1 })
  await db.collection('services').createIndex({ order: 1 })
  // Stripe can deliver the same event more than once, so the session id is
  // unique and the handler upserts against it.
  await db.collection('orders').createIndex({ sessionId: 1 }, { unique: true })
  await db.collection('orders').createIndex({ createdAt: -1 })
  // one row per (day, path); the beacon increments counters on it
  await db.collection('pageViews').createIndex({ day: 1, path: 1 }, { unique: true })
  // One account per address, enforced by the database rather than by
  // remembering to check for duplicates everywhere.
  await db.collection('admins').createIndex({ email: 1 }, { unique: true })

  // Circle chat. Mongo expires these itself, so stale login codes and
  // sessions clean themselves up without a cron job.
  await db.collection('circleCodes').createIndex({ email: 1 }, { unique: true })
  await db.collection('circleCodes').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  await db.collection('circleSessions').createIndex({ sessionId: 1 }, { unique: true })
  await db
    .collection('circleSessions')
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })

  // Native group chat
  await db.collection('chatCodes').createIndex({ email: 1 }, { unique: true })
  await db.collection('chatCodes').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  await db.collection('chatSessions').createIndex({ sessionId: 1 }, { unique: true })
  await db.collection('chatSessions').createIndex({ email: 1 })
  await db
    .collection('chatSessions')
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  await db.collection('chatMessages').createIndex({ createdAt: -1 })
  await db.collection('chatMembers').createIndex({ email: 1 }, { unique: true })
  await db.collection('chatBans').createIndex({ email: 1 }, { unique: true })

  // Refund requests. Queried as "everything still open, newest first",
  // and by email when the same person writes twice about one purchase.
  await db.collection('refundRequests').createIndex({ status: 1, createdAt: -1 })
  await db.collection('refundRequests').createIndex({ email: 1 })

  return db
}

export function getDb() {
  if (!db) throw new Error('Database not connected yet')
  return db
}

export async function close() {
  if (client) await client.close()
  client = undefined
  db = undefined
}

export const collections = {
  admins: () => getDb().collection('admins'),
  settings: () => getDb().collection('settings'),
  content: () => getDb().collection('content'),
  shopItems: () => getDb().collection('shopItems'),
  services: () => getDb().collection('services'),
  bookings: () => getDb().collection('bookings'),
  bookingLinks: () => getDb().collection('bookingLinks'),
  orders: () => getDb().collection('orders'),
  pageViews: () => getDb().collection('pageViews'),
  circleCodes: () => getDb().collection('circleCodes'),
  circleSessions: () => getDb().collection('circleSessions'),
  chatCodes: () => getDb().collection('chatCodes'),
  chatSessions: () => getDb().collection('chatSessions'),
  chatMessages: () => getDb().collection('chatMessages'),
  chatMembers: () => getDb().collection('chatMembers'),
  chatBans: () => getDb().collection('chatBans'),
  refundRequests: () => getDb().collection('refundRequests'),
  audit: () => getDb().collection('auditLog'),
}

/** Every state-changing admin action gets a row here. If something is ever
 *  refunded or cancelled unexpectedly, this is the record of who and when. */
export async function audit(actor, action, details = {}) {
  try {
    await collections.audit().insertOne({
      actor,
      action,
      details,
      at: new Date(),
    })
  } catch {
    // Never let audit failure break the actual operation.
  }
}
