import { Router } from 'express'
import { ObjectId } from 'mongodb'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { collections, audit } from '../db.js'
import { requireAdmin } from '../middleware/auth.js'
import {
  notifyNewBooking,
  notifyBookingConfirmed,
  notifyBookingRescheduled,
  notifyBookingCancelled,
} from '../mailer.js'
import {
  isConnected as googleConnected,
  createBookingEvent,
  updateBookingEvent,
  cancelBookingEvent,
} from '../google.js'
import { stripe, stripeReady, onBehalf } from './checkout.js'
import { config } from '../config.js'

export const bookingsRouter = Router()

const STATUSES = ['pending', 'confirmed', 'cancelled', 'completed']

/**
 * Pay-to-book. The price lives in settings — until the admin sets one
 * (and Stripe is configured) bookings stay free requests, so this whole
 * feature is switched on from the dashboard, not by a deploy.
 */
const PRICE_SETTINGS_ID = 'booking'

async function bookingPrice() {
  const doc = await collections.settings().findOne({ _id: PRICE_SETTINGS_ID })
  return { priceCents: doc?.priceCents || null, currency: doc?.currency || 'cad' }
}

/**
 * An unpaid booking holds its slot only briefly: long enough to finish
 * checkout, not long enough for an abandoned cart to block the calendar.
 */
const HOLD_MS = 30 * 60 * 1000
const holdsSlot = () => ({
  $or: [
    { awaitingPayment: { $ne: true } },
    { createdAt: { $gte: new Date(Date.now() - HOLD_MS) } },
  ],
})

const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
  time: z.string().min(1).max(20),
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  note: z.string().max(2000).default(''),
})

/** The public form is unauthenticated, so it needs its own throttle —
 *  otherwise one script can fill the calendar with junk bookings. */
const publicLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many booking requests. Try again later.' },
})

const toClient = (d) => ({ ...d, id: d._id.toString(), _id: undefined })

function parseId(id, res) {
  if (!ObjectId.isValid(id)) {
    res.status(400).json({ error: 'Invalid id' })
    return null
  }
  return new ObjectId(id)
}

/** Public — what booking costs, if anything. */
bookingsRouter.get('/price', async (_req, res, next) => {
  try {
    const p = await bookingPrice()
    res.json({ ...p, enabled: Boolean(p.priceCents) && stripeReady })
  } catch (err) {
    next(err)
  }
})

/** Admin — set (or clear) the session price. Null switches payments off. */
bookingsRouter.put('/price', requireAdmin, async (req, res, next) => {
  try {
    const parsed = z
      .object({
        priceCents: z.number().int().min(50).max(9999999).nullable(),
        currency: z.enum(['cad', 'usd']).default('cad'),
      })
      .safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid price' })

    await collections.settings().updateOne(
      { _id: PRICE_SETTINGS_ID },
      { $set: { ...parsed.data, updatedAt: new Date(), updatedBy: req.admin.email } },
      { upsert: true },
    )
    await audit(req.admin.email, 'booking.price', parsed.data)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

/** Public — submit a booking request; when a price is set, checkout opens. */
bookingsRouter.post('/', publicLimiter, async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid booking', details: parsed.error.flatten() })
    }

    // Soft double-booking guard. The public site can't see live availability,
    // so this stops two people grabbing the same slot in the same minute.
    const taken = await collections.bookings().findOne({
      date: parsed.data.date,
      time: parsed.data.time,
      status: { $in: ['pending', 'confirmed'] },
      ...holdsSlot(),
    })
    if (taken) {
      return res
        .status(409)
        .json({ error: 'That time was just taken. Please pick another.' })
    }

    const doc = {
      ...parsed.data,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const { insertedId } = await collections.bookings().insertOne(doc)

    // Fire and forget — the mailer swallows its own errors, so a bad SMTP
    // password can never turn into a failed booking. Payment (when a price
    // is set) happens later, via the link in the confirmation email.
    notifyNewBooking(doc)

    res.status(201).json({ ok: true, id: insertedId.toString() })
  } catch (err) {
    next(err)
  }
})

/** Public — which slots are already spoken for, so the calendar can grey
 *  them out. Returns dates/times only, never names or emails. */
bookingsRouter.get('/taken', async (_req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const rows = await collections
      .bookings()
      .find(
        {
          date: { $gte: today },
          status: { $in: ['pending', 'confirmed'] },
          ...holdsSlot(),
        },
        { projection: { date: 1, time: 1, _id: 0 } },
      )
      .toArray()
    res.json(rows)
  } catch (err) {
    next(err)
  }
})

/**
 * Admin — book someone in by hand, alongside the public request flow.
 * Optionally creates the Google Calendar event + Meet room right away
 * and optionally emails the customer, so it covers both "we agreed on a
 * time over DM" and "just block the slot quietly".
 */
const adminCreateSchema = createSchema.extend({
  status: z.enum(['pending', 'confirmed']).default('confirmed'),
  createEvent: z.boolean().default(true),
  notifyCustomer: z.boolean().default(true),
})

bookingsRouter.post('/admin', requireAdmin, async (req, res, next) => {
  try {
    const parsed = adminCreateSchema.safeParse(req.body)
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid booking', details: parsed.error.flatten() })
    }
    const { status, createEvent, notifyCustomer, ...fields } = parsed.data

    const taken = await collections.bookings().findOne({
      date: fields.date,
      time: fields.time,
      status: { $in: ['pending', 'confirmed'] },
      ...holdsSlot(),
    })
    if (taken) {
      return res.status(409).json({ error: 'Another booking already holds that slot' })
    }

    const doc = {
      ...fields,
      status,
      adminCreated: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const warnings = []
    if (
      status === 'confirmed' &&
      createEvent &&
      (await googleConnected().catch(() => false))
    ) {
      try {
        const ev = await createBookingEvent(doc)
        doc.googleEventId = ev.eventId
        if (ev.meetUrl) doc.meetUrl = ev.meetUrl
      } catch (gErr) {
        console.error('[google] calendar sync failed:', gErr.message)
        warnings.push(`Calendar event not created: ${gErr.message}`)
      }
    }

    const { insertedId } = await collections.bookings().insertOne(doc)
    const saved = { ...doc, _id: insertedId }

    // Only a confirmation is worth a customer email — a pending manual
    // entry is Nate's own bookkeeping, not news to the customer.
    if (notifyCustomer && status === 'confirmed') notifyBookingConfirmed(saved)

    await audit(req.admin.email, 'booking.create', {
      id: insertedId.toString(),
      status,
      createEvent,
    })
    res.status(201).json({ ...toClient(saved), warnings })
  } catch (err) {
    next(err)
  }
})

/** Admin — full list, newest first, optionally filtered by status. */
bookingsRouter.get('/', requireAdmin, async (req, res, next) => {
  try {
    const filter = {}
    if (req.query.status && STATUSES.includes(req.query.status)) {
      filter.status = req.query.status
    }
    const rows = await collections
      .bookings()
      .find(filter)
      .sort({ date: 1, time: 1 })
      .limit(500)
      .toArray()
    res.json(rows.map(toClient))
  } catch (err) {
    next(err)
  }
})

/** Admin — reschedule and/or change status (confirm, cancel, complete). */
const updateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time: z.string().min(1).max(20).optional(),
  status: z.enum(STATUSES).optional(),
  adminNote: z.string().max(2000).optional(),
  // Google Meet (or any) call link. Included in the confirmation email.
  meetUrl: z.string().url().max(500).or(z.literal('')).optional(),
})

bookingsRouter.patch('/:id', requireAdmin, async (req, res, next) => {
  try {
    const _id = parseId(req.params.id, res)
    if (!_id) return

    const parsed = updateSchema.safeParse(req.body)
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid update', details: parsed.error.flatten() })
    }
    if (Object.keys(parsed.data).length === 0) {
      return res.status(400).json({ error: 'Nothing to update' })
    }

    const before = await collections.bookings().findOne({ _id })
    if (!before) return res.status(404).json({ error: 'Not found' })

    // Moving a booking onto an occupied slot would silently double-book.
    if (parsed.data.date || parsed.data.time) {
      const date = parsed.data.date ?? before.date
      const time = parsed.data.time ?? before.time
      const clash = await collections.bookings().findOne({
        _id: { $ne: _id },
        date,
        time,
        status: { $in: ['pending', 'confirmed'] },
        ...holdsSlot(),
      })
      if (clash) {
        return res.status(409).json({ error: 'Another booking already holds that slot' })
      }
    }

    const changes = { ...parsed.data, updatedAt: new Date() }
    const warnings = []

    const becomingConfirmed =
      parsed.data.status === 'confirmed' && before.status !== 'confirmed'
    const becomingCancelled =
      parsed.data.status === 'cancelled' && before.status !== 'cancelled'

    /**
     * Payment link, minted at confirmation when a price is set. A Stripe
     * Payment Link rather than a checkout session because it rides an
     * email and must still work days later — sessions expire in 24h.
     * The webhook marks the booking paid via the link's metadata.
     */
    if (becomingConfirmed && !before.paid && !before.payUrl && stripeReady) {
      const { priceCents, currency } = await bookingPrice()
      if (priceCents) {
        try {
          const price = await stripe.prices.create(
            {
              currency,
              unit_amount: priceCents,
              product_data: { name: 'Coaching session' },
            },
            ...onBehalf,
          )
          const link = await stripe.paymentLinks.create(
            {
              line_items: [{ price: price.id, quantity: 1 }],
              metadata: { bookingId: before._id.toString(), title: 'Coaching session' },
            },
            ...onBehalf,
          )
          changes.payUrl = link.url
          changes.payLinkId = link.id
          changes.priceCents = priceCents
          changes.currency = currency
        } catch (sErr) {
          console.error('[booking] payment link failed:', sErr.message)
          warnings.push(`Payment link not created: ${sErr.message}`)
        }
      }
    }

    // A cancelled booking's unpaid link goes dead, so nobody pays for a
    // session that no longer exists.
    if (becomingCancelled && before.payLinkId && !before.paid && stripeReady) {
      try {
        await stripe.paymentLinks.update(before.payLinkId, { active: false }, ...onBehalf)
        changes.payUrl = null
      } catch (sErr) {
        warnings.push(`Old payment link could not be deactivated: ${sErr.message}`)
      }
    }

    /**
     * Google Calendar, when connected. Wrapped so a Calendar failure
     * downgrades to a plain confirmation rather than losing the admin's
     * action entirely — the booking update still goes through.
     */
    if (await googleConnected().catch(() => false)) {
      const merged = { ...before, ...parsed.data }
      const nowConfirmed =
        parsed.data.status === 'confirmed' && before.status !== 'confirmed'
      const nowCancelled =
        parsed.data.status === 'cancelled' && before.status !== 'cancelled'
      const timeChanged =
        (parsed.data.date && parsed.data.date !== before.date) ||
        (parsed.data.time && parsed.data.time !== before.time)

      try {
        if (nowCancelled && before.googleEventId) {
          await cancelBookingEvent(before.googleEventId)
          changes.googleEventId = null
          changes.meetUrl = ''
        } else if (nowConfirmed && !before.googleEventId) {
          const ev = await createBookingEvent(merged)
          changes.googleEventId = ev.eventId
          // Only overwrite the link if the admin hasn't set one by hand.
          if (ev.meetUrl && !parsed.data.meetUrl) changes.meetUrl = ev.meetUrl
        } else if (timeChanged && before.googleEventId) {
          const ev = await updateBookingEvent(before.googleEventId, merged)
          if (ev.meetUrl && !parsed.data.meetUrl) changes.meetUrl = ev.meetUrl
        }
      } catch (gErr) {
        console.error('[google] calendar sync failed:', gErr.message)
        warnings.push(`Calendar not updated: ${gErr.message}`)
      }
    }

    const result = await collections
      .bookings()
      .findOneAndUpdate({ _id }, { $set: changes }, { returnDocument: 'after' })
    if (!result) return res.status(404).json({ error: 'Not found' })

    // Tell the customer what changed — only when it actually changed, so
    // an admin note or a status tidy-up doesn't spam them.
    const moved =
      (parsed.data.date && parsed.data.date !== before.date) ||
      (parsed.data.time && parsed.data.time !== before.time)

    if (moved) {
      notifyBookingRescheduled(result, `${before.date} at ${before.time}`)
    } else if (parsed.data.status && parsed.data.status !== before.status) {
      if (parsed.data.status === 'confirmed') notifyBookingConfirmed(result)
      if (parsed.data.status === 'cancelled') notifyBookingCancelled(result)
    }

    await audit(req.admin.email, 'booking.update', {
      id: req.params.id,
      changes: parsed.data,
    })
    res.json({ ...toClient(result), warnings })
  } catch (err) {
    next(err)
  }
})

bookingsRouter.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const _id = parseId(req.params.id, res)
    if (!_id) return
    const { deletedCount } = await collections.bookings().deleteOne({ _id })
    if (!deletedCount) return res.status(404).json({ error: 'Not found' })
    await audit(req.admin.email, 'booking.delete', { id: req.params.id })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})
