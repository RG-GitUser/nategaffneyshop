import { Router } from 'express'
import Stripe from 'stripe'
import { z } from 'zod'
import { config } from '../config.js'
import { audit, collections } from '../db.js'
import { markOrderRefunded } from '../orders.js'
import { requireAdmin } from '../middleware/auth.js'
import { isHiddenTestTitle } from '../hiddenTestData.js'

export const paymentsRouter = Router()

// Placeholder values from .env.example count as "not configured" — they'd
// otherwise produce confusing auth errors from Stripe rather than an
// honest "you haven't set this up yet".
const stripeReady =
  Boolean(config.stripeSecretKey) &&
  !config.stripeSecretKey.includes('placeholder') &&
  !config.stripeSecretKey.includes('xxx')

const stripe = stripeReady ? new Stripe(config.stripeSecretKey) : null

/**
 * Stripe Connect: act on behalf of the connected account.
 *
 * The key belongs to the platform; this header is what makes each call
 * read and write the *client's* account instead. Without it you'd be
 * listing the platform's own payments, which for a Connect setup is
 * usually an empty list — a confusing failure rather than an obvious one.
 *
 * An ARRAY, spread into each call. stripe-node throws "Unknown arguments"
 * on an empty trailing options object, so with STRIPE_ACCOUNT_ID blank
 * spreading an empty array passes nothing at all.
 */
const onBehalf = config.stripeAccountId
  ? [{ stripeAccount: config.stripeAccountId }]
  : []

/**
 * Every route here is admin-only. The Stripe secret key lives in this
 * process and nowhere else — the browser never sees it, and never talks
 * to Stripe directly. The frontend only ever sees the trimmed-down shapes
 * built below, so card details and raw Stripe objects stay server-side.
 */
paymentsRouter.use(requireAdmin)

// Answer honestly rather than throwing on a null client.
paymentsRouter.use((_req, res, next) => {
  if (!stripeReady) {
    return res.status(503).json({
      error: 'Stripe is not connected yet. Add STRIPE_SECRET_KEY to server/.env.',
      configured: false,
    })
  }
  next()
})

const summarise = (pi) => ({
  id: pi.id,
  amount: pi.amount,
  amountRefunded:
    pi.latest_charge && typeof pi.latest_charge === 'object'
      ? pi.latest_charge.amount_refunded
      : 0,
  currency: pi.currency,
  status: pi.status,
  created: pi.created,
  description: pi.description,
  customerEmail:
    pi.receipt_email ||
    (typeof pi.latest_charge === 'object' ? pi.latest_charge?.billing_details?.email : null),
  customerName:
    typeof pi.latest_charge === 'object'
      ? pi.latest_charge?.billing_details?.name
      : null,
  // Last four only. Never the full number — Stripe would not return it anyway.
  cardBrand:
    typeof pi.latest_charge === 'object'
      ? pi.latest_charge?.payment_method_details?.card?.brand
      : null,
  cardLast4:
    typeof pi.latest_charge === 'object'
      ? pi.latest_charge?.payment_method_details?.card?.last4
      : null,
  refunded:
    typeof pi.latest_charge === 'object' ? Boolean(pi.latest_charge?.refunded) : false,
  receiptUrl:
    typeof pi.latest_charge === 'object' ? pi.latest_charge?.receipt_url : null,
})

/** Recent payments. */
paymentsRouter.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 25, 100)
    const params = { limit, expand: ['data.latest_charge'] }
    if (req.query.starting_after) params.starting_after = req.query.starting_after

    const list = await stripe.paymentIntents.list(params, ...onBehalf)

    // Stripe's intents don't say WHAT was bought — the webhook's order
    // records do (shop item titles and "Coaching session" alike), so
    // label each payment from them where a match exists.
    const orders = await collections
      .orders()
      .find(
        { paymentIntent: { $in: list.data.map((pi) => pi.id) } },
        { projection: { paymentIntent: 1, title: 1 } },
      )
      .toArray()
    const titles = new Map(orders.map((o) => [o.paymentIntent, o.title]))

    /**
     * Two kinds of rows stay off the list: abandoned checkouts
     * (requires_payment_method — someone opened the payment form and
     * left; Stripe's own dashboard hides these by default too), and the
     * pre-launch test purchases (see hiddenTestData.js).
     */
    const visible = list.data.filter(
      (pi) =>
        pi.status !== 'requires_payment_method' &&
        !isHiddenTestTitle(titles.get(pi.id)),
    )

    res.json({
      data: visible.map((pi) => ({
        ...summarise(pi),
        label: titles.get(pi.id) || pi.description || null,
      })),
      hasMore: list.has_more,
      // Cursor from the UNfiltered page, so pagination never skips.
      lastId: list.data.at(-1)?.id ?? null,
      account: config.stripeAccountId || null,
    })
  } catch (err) {
    next(err)
  }
})

/** One payment, with its refund history. */
paymentsRouter.get('/:id', async (req, res, next) => {
  try {
    const pi = await stripe.paymentIntents.retrieve(
      req.params.id,
      { expand: ['latest_charge'] },
      ...onBehalf,
    )
    const refunds = await stripe.refunds.list(
      { payment_intent: pi.id, limit: 20 },
      ...onBehalf,
    )
    res.json({
      ...summarise(pi),
      refunds: refunds.data.map((r) => ({
        id: r.id,
        amount: r.amount,
        status: r.status,
        reason: r.reason,
        created: r.created,
      })),
    })
  } catch (err) {
    next(err)
  }
})

/** Refund — full, or partial when an amount in cents is supplied. */
const refundSchema = z.object({
  amount: z.number().int().positive().optional(),
  reason: z
    .enum(['duplicate', 'fraudulent', 'requested_by_customer'])
    .default('requested_by_customer'),
})

paymentsRouter.post('/:id/refund', async (req, res, next) => {
  try {
    const parsed = refundSchema.safeParse(req.body ?? {})
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid refund request' })
    }

    const refund = await stripe.refunds.create(
      {
        payment_intent: req.params.id,
        ...(parsed.data.amount ? { amount: parsed.data.amount } : {}),
        reason: parsed.data.reason,
        // Only meaningful for destination / separate-transfer charges,
        // where the money has to be pulled back from the connected
        // account. Harmless to omit on direct charges.
        ...(config.stripeReverseTransfer ? { reverse_transfer: true } : {}),
        ...(config.stripeRefundApplicationFee
          ? { refund_application_fee: true }
          : {}),
      },
      ...onBehalf,
    )

    /**
     * Mark the order here rather than waiting for the charge.refunded
     * webhook: a refunded PDF order must stop downloading immediately,
     * and the webhook may be unconfigured or delayed.
     *
     * The totals come from the charge itself, never from adding this
     * refund to what we had stored. Both writers therefore set the same
     * absolute value, so whichever lands second is a no-op instead of
     * double-counting a partial refund into a full one.
     */
    try {
      const charge = await stripe.charges.retrieve(refund.charge, ...onBehalf)
      await markOrderRefunded(charge)
    } catch (err) {
      // The refund itself succeeded; a failed bookkeeping read must not
      // turn that into an error for the admin. The webhook will correct it.
      console.error('[payments] could not update order after refund:', err.message)
    }

    await audit(req.admin.email, 'payment.refund', {
      paymentIntent: req.params.id,
      amount: refund.amount,
      refundId: refund.id,
    })

    res.json({ id: refund.id, amount: refund.amount, status: refund.status })
  } catch (err) {
    // Stripe's own messages are safe and useful to surface here.
    if (err?.type?.startsWith('Stripe')) {
      return res.status(400).json({ error: err.message })
    }
    next(err)
  }
})

/** Headline numbers for the dashboard. */
paymentsRouter.get('/stats/summary', async (_req, res, next) => {
  try {
    const since = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60
    const list = await stripe.paymentIntents.list(
      { limit: 100, created: { gte: since } },
      ...onBehalf,
    )
    const succeeded = list.data.filter((p) => p.status === 'succeeded')

    // The test purchases are real Stripe charges, so without this they
    // inflate the headline numbers too — same list as hiddenTestData.js.
    const orders = await collections
      .orders()
      .find(
        { paymentIntent: { $in: succeeded.map((p) => p.id) } },
        { projection: { paymentIntent: 1, title: 1 } },
      )
      .toArray()
    const titles = new Map(orders.map((o) => [o.paymentIntent, o.title]))
    const counted = succeeded.filter((p) => !isHiddenTestTitle(titles.get(p.id)))

    res.json({
      windowDays: 30,
      count: counted.length,
      grossAmount: counted.reduce((sum, p) => sum + p.amount, 0),
      currency: counted[0]?.currency ?? 'cad',
      account: config.stripeAccountId || null,
    })
  } catch (err) {
    next(err)
  }
})


/**
 * Router-level catch for anything the Stripe SDK raises: upstream
 * problems (bad key, Stripe outage, revoked Connect access) become an
 * honest 502 with a message, rather than tripping the app-wide 500.
 *
 * Must be registered AFTER every route above — Express only routes an
 * error to handlers that come later in the stack than the route that
 * threw it.
 */
paymentsRouter.use((err, _req, res, next) => {
  if (err?.type?.startsWith('Stripe') || err?.rawType || err?.statusCode) {
    console.error('[payments] stripe rejected:', err.type || err.rawType, err.message)
    return res.status(502).json({
      error: 'Stripe did not accept the request. Check the key and account id in server/.env.',
    })
  }
  next(err)
})