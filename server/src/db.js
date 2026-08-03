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
  content: () => getDb().collection('content'),
  shopItems: () => getDb().collection('shopItems'),
  bookings: () => getDb().collection('bookings'),
  circleCodes: () => getDb().collection('circleCodes'),
  circleSessions: () => getDb().collection('circleSessions'),
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
