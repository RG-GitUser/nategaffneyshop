/**
 * Refund requests, end to end against a throwaway database.
 *
 *   cd server && npm test
 *
 * Exercises the real router over real Mongo — the matching rules, the
 * status transitions, the tallies the dashboard tabs are drawn from, and
 * the privacy rule that the public response gives nothing away.
 *
 * MAIL IS HARD OFF. SMTP_* are blanked before anything imports config, so
 * the mailer builds no transport and every send is a no-op. The test
 * refuses to run if that did not take: a suite that posts a dozen refund
 * requests would otherwise put a dozen real emails in the support inbox.
 */
process.env.SMTP_HOST = ''
process.env.SMTP_USER = ''
process.env.SMTP_PASS = ''
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-only-secret-'.padEnd(64, '0')
process.env.ALLOWED_ORIGINS = 'http://localhost:5173'
process.env.MONGODB_DB = 'refund_tests'

import test, { before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { ObjectId } from 'mongodb'

let mongo
let server
let base
let collections
let token
let receiptNumber

before(async () => {
  mongo = await MongoMemoryServer.create()
  process.env.MONGODB_URI = mongo.getUri()

  // Imported only now: config reads the environment at module load, and
  // everything below reaches config through it.
  const config = (await import('../src/config.js')).config
  assert.equal(
    config.smtp.host,
    '',
    'SMTP is configured — refusing to run, this suite would send real email',
  )

  const db = await import('../src/db.js')
  await db.connect()
  collections = db.collections

  const { refundsRouter } = await import('../src/routes/refunds.js')
  const { signSession } = await import('../src/middleware/auth.js')
  receiptNumber = (await import('../src/mailer.js')).receiptNumber

  token = signSession({ _id: new ObjectId(), email: 'admin@example.com' })

  const app = express()
  // Mirrors index.js, and lets each test present its own client address so
  // the public form's per-IP throttle does not leak between them.
  app.set('trust proxy', true)
  app.use(express.json())
  app.use('/api/refund-requests', refundsRouter)

  server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://127.0.0.1:${server.address().port}/api/refund-requests`
})

after(async () => {
  server?.close()
  const db = await import('../src/db.js')
  await db.close()
  await mongo?.stop()
})

beforeEach(async () => {
  await collections.refundRequests().deleteMany({})
  await collections.orders().deleteMany({})
})

/** Each call gets its own client address unless one is pinned, so the
 *  hourly per-IP cap only bites the test that is actually testing it. */
let ip = 0
const post = (body, from) =>
  fetch(base, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': from || `10.0.0.${(ip++ % 250) + 1}`,
    },
    body: JSON.stringify(body),
  })

const getAdmin = (query = '') =>
  fetch(`${base}${query}`, { headers: { Authorization: `Bearer ${token}` } })

const patchAdmin = (id, body) =>
  fetch(`${base}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })

const order = (over = {}) => ({
  sessionId: `cs_test_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 8)}`,
  paymentIntent: `pi_${Math.random().toString(36).slice(2, 12)}`,
  title: 'Portfolio review',
  amount: 18000,
  currency: 'cad',
  email: 'buyer@example.com',
  name: 'A Buyer',
  status: 'paid',
  digital: false,
  createdAt: new Date('2026-08-26T20:19:00Z'),
  ...over,
})

const valid = {
  email: 'buyer@example.com',
  category: 'never-arrived',
  message: 'Nothing arrived.',
}

/* ---------------------------------------------------------------- public */

test('accepts a valid request and stores it as open', async () => {
  const res = await post({ ...valid, name: 'A Buyer' })
  assert.equal(res.status, 201)

  const [row] = await collections.refundRequests().find({}).toArray()
  assert.equal(row.email, 'buyer@example.com')
  assert.equal(row.category, 'never-arrived')
  assert.equal(row.status, 'open')
  assert.ok(row.createdAt instanceof Date)
})

test('normalises the address so matching is not defeated by capitals', async () => {
  await post({ ...valid, email: '  Buyer@Example.COM ' })
  const [row] = await collections.refundRequests().find({}).toArray()
  assert.equal(row.email, 'buyer@example.com')
})

test('rejects a malformed address and an unknown category', async () => {
  assert.equal((await post({ ...valid, email: 'not-an-email' })).status, 400)
  assert.equal((await post({ ...valid, category: 'made-up' })).status, 400)
  assert.equal(await collections.refundRequests().countDocuments(), 0)
})

test('tells the submitter nothing about the order it matched', async () => {
  await collections.orders().insertOne(order({ title: 'Content Audit', amount: 25000 }))
  const body = await (await post(valid)).json()

  // The form takes an address from anyone. If the response described the
  // purchase, it would be a lookup tool for what any address has bought.
  const text = JSON.stringify(body)
  assert.equal(text.includes('Content Audit'), false)
  assert.equal(text.includes('25000'), false)
  assert.deepEqual(Object.keys(body).sort(), ['ok'])
})

test('throttles a single address after six requests in the hour', async () => {
  const from = '203.0.113.9'
  const codes = []
  for (let i = 0; i < 7; i++) codes.push((await post(valid, from)).status)

  assert.deepEqual(codes.slice(0, 6), [201, 201, 201, 201, 201, 201])
  assert.equal(codes[6], 429)
})

/* -------------------------------------------------------------- matching */

test('matches the exact order named by a receipt number', async () => {
  const wanted = order({ title: 'The one they mean', createdAt: new Date('2026-08-01T12:00:00Z') })
  // Newer, so it would win on the fallback — the reference must beat it.
  await collections.orders().insertMany([
    wanted,
    order({ title: 'Newer, wrong one', createdAt: new Date('2026-09-01T12:00:00Z') }),
  ])

  const reference = receiptNumber(wanted.sessionId, wanted.createdAt)
  await post({ ...valid, reference })

  const [row] = await collections.refundRequests().find({}).toArray()
  assert.equal(row.orderTitle, 'The one they mean')
  assert.equal(row.matchedByReference, true)
})

test('matches a payment intent pasted in as the reference', async () => {
  const wanted = order({ title: 'By intent', createdAt: new Date('2026-08-01T12:00:00Z') })
  await collections.orders().insertMany([
    wanted,
    order({ title: 'Newer', createdAt: new Date('2026-09-01T12:00:00Z') }),
  ])

  await post({ ...valid, reference: wanted.paymentIntent })
  const [row] = await collections.refundRequests().find({}).toArray()
  assert.equal(row.orderTitle, 'By intent')
  assert.equal(row.matchedByReference, true)
})

/**
 * Found by this suite: with two session ids ending in the same six
 * characters, the route used findOne and presented whichever Mongo
 * reached first as a confident match. A coin toss labelled `matchedByReference: true` is how the wrong customer gets refunded, so an ambiguous tail
 * now counts as no reference at all.
 */
test('refuses to guess when two orders share a receipt tail', async () => {
  const tail = 'Z9Q4KM'
  const older = order({
    sessionId: `cs_test_aaaaaa${tail.toLowerCase()}`,
    title: 'Ambiguous older',
    createdAt: new Date('2026-07-01T12:00:00Z'),
  })
  const newer = order({
    sessionId: `cs_test_bbbbbb${tail.toLowerCase()}`,
    title: 'Ambiguous newer',
    createdAt: new Date('2026-09-01T12:00:00Z'),
  })
  await collections.orders().insertMany([older, newer])

  await post({ ...valid, reference: receiptNumber(older.sessionId, older.createdAt) })

  const [row] = await collections.refundRequests().find({}).toArray()
  assert.equal(
    row.matchedByReference,
    false,
    'an ambiguous tail must not be presented as a confident match',
  )
  // It still falls back, so Nate has somewhere to start — flagged a guess.
  assert.equal(row.orderTitle, 'Ambiguous newer')
  assert.equal(row.orderCount, 2)
})

test('falls back to the newest purchase and says the match was a guess', async () => {
  await collections.orders().insertMany([
    order({ title: 'Older', createdAt: new Date('2026-07-01T12:00:00Z') }),
    order({ title: 'Newest', createdAt: new Date('2026-09-01T12:00:00Z') }),
  ])

  await post(valid)
  const [row] = await collections.refundRequests().find({}).toArray()
  assert.equal(row.orderTitle, 'Newest')
  assert.equal(row.orderCount, 2)
  assert.equal(row.matchedByReference, false, 'an unreferenced match must read as a guess')
})

test('ignores an abandoned checkout', async () => {
  await collections.orders().insertOne(order({ status: 'unpaid', title: 'Never paid' }))
  await post(valid)

  const [row] = await collections.refundRequests().find({}).toArray()
  assert.equal(row.paymentIntent, null)
  assert.equal(row.orderTitle, null)
  assert.equal(row.orderCount, 0)
})

test('records no match when the address bought nothing', async () => {
  await post({ ...valid, email: 'stranger@example.com' })
  const [row] = await collections.refundRequests().find({}).toArray()
  assert.equal(row.paymentIntent, null)
})

/**
 * The one that ties the two halves together. The reference a customer
 * quotes is printed by the mailer; the form has to find the order from it
 * with no stored copy in between. If either side changes shape, this fails
 * rather than quietly matching nothing forever.
 */
test('a receipt number the mailer prints is one the form can resolve', async () => {
  for (const createdAt of [
    new Date('2026-01-05T00:30:00Z'),
    new Date('2026-08-26T23:59:59Z'),
    new Date('2026-12-31T12:00:00Z'),
  ]) {
    await collections.refundRequests().deleteMany({})
    await collections.orders().deleteMany({})

    const o = order({ createdAt, title: `Bought ${createdAt.toISOString()}` })
    await collections.orders().insertOne(o)

    const printed = receiptNumber(o.sessionId, o.createdAt)
    assert.match(printed, /^NG-\d{8}-[A-Z0-9]{6}$/, `unexpected shape: ${printed}`)

    await post({ ...valid, reference: printed })
    const [row] = await collections.refundRequests().find({}).toArray()
    assert.equal(row.orderTitle, o.title, `did not resolve ${printed}`)
    assert.equal(row.matchedByReference, true)
  }
})

/* ----------------------------------------------------------------- admin */

test('the queue refuses an unauthenticated caller', async () => {
  assert.equal((await fetch(base)).status, 401)
  assert.equal((await fetch(`${base}/${new ObjectId()}`, { method: 'PATCH' })).status, 401)
})

test('lists open requests by default, and each status on request', async () => {
  await post({ ...valid, category: 'duplicate' })
  await post({ ...valid, category: 'technical' })

  const open = await (await getAdmin()).json()
  assert.equal(open.data.length, 2)

  await patchAdmin(open.data[0].id, { status: 'resolved' })

  assert.equal((await (await getAdmin()).json()).data.length, 1)
  assert.equal((await (await getAdmin('?status=resolved')).json()).data.length, 1)
  assert.equal((await (await getAdmin('?status=declined')).json()).data.length, 0)
  assert.equal((await (await getAdmin('?status=all')).json()).data.length, 2)
})

test('the tab totals and the category tally agree with the rows', async () => {
  await post({ ...valid, category: 'duplicate' })
  await post({ ...valid, category: 'duplicate' })
  await post({ ...valid, category: 'technical' })

  let body = await (await getAdmin()).json()
  assert.deepEqual(body.totals, { open: 3, resolved: 0, declined: 0 })
  assert.deepEqual(body.counts, { duplicate: 2, technical: 1 })
  assert.equal(body.open, 3)

  await patchAdmin(body.data[0].id, { status: 'declined' })

  body = await (await getAdmin()).json()
  assert.deepEqual(body.totals, { open: 2, resolved: 0, declined: 1 })
  assert.equal(
    Object.values(body.counts).reduce((a, b) => a + b, 0),
    2,
    'the category tally counts open requests only',
  )
})

test('resolving stamps who and when; reopening clears it', async () => {
  await post(valid)
  const { data } = await (await getAdmin()).json()
  const id = data[0].id

  const resolved = await (await patchAdmin(id, { status: 'resolved' })).json()
  assert.equal(resolved.status, 'resolved')
  assert.equal(resolved.settledBy, 'admin@example.com')
  assert.ok(resolved.settledAt)

  const reopened = await (await patchAdmin(id, { status: 'open' })).json()
  assert.equal(reopened.status, 'open')
  assert.equal(reopened.settledAt, null, 'a reopened request must not keep a settlement')
  assert.equal(reopened.settledBy, null)
})

test('rejects a malformed id, an unknown id and an invalid status', async () => {
  await post(valid)
  const { data } = await (await getAdmin()).json()

  assert.equal((await patchAdmin('not-an-id', { status: 'resolved' })).status, 400)
  assert.equal((await patchAdmin(new ObjectId(), { status: 'resolved' })).status, 404)
  assert.equal((await patchAdmin(data[0].id, { status: 'banana' })).status, 400)
})

test('every stored category is one the browser can label', async () => {
  // The two lists live in different trees and are kept in step by hand;
  // a drift means the dashboard renders "Something else" for real reasons.
  const server = (await import('../src/refundCategories.js')).REFUND_CATEGORIES
  const browser = (await import('../../src/refundCategories.js')).REFUND_CATEGORIES

  assert.deepEqual(
    server.map((c) => c.id),
    browser.map((c) => c.id),
    'server and browser category ids have drifted apart',
  )
})
