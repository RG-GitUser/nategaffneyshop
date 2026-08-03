import { Router } from 'express'
import Stripe from 'stripe'
import { z } from 'zod'
import { config } from '../config.js'
import { audit } from '../db.js'
import { requireAdmin } from '../middleware/auth.js'

export const paymentsRouter = Router()

const stripe = new Stripe(config.stripeSecretKey)

/**
 * Stripe Connect: act on behalf of the connected account.
 *
 * The key belongs to the platform; this header is what makes each call
 * read and write the *client's* account instead. Without it you'd be
 * listing the platform's own payments, which for a Connect setup is
 * usually an empty list — a confusing failure rather than an obvious one.
 *
 * With STRIPE_ACCOUNT_ID blank this is an empty object, so a plain
 * standalone Stripe account behaves exactly as before.
 */
const onBehalf = config.stripeAccountId
  ? { stripeAccount: config.stripeAccountId }
  : {}

/**
 * Every route here is admin-only. The Stripe secret key lives in this
 * process and nowhere else — the browser never sees it, and never talks
 * to Stripe directly. The frontend only ever sees the trimmed-down shapes
 * built below, so card details and raw Stripe objects stay server-side.
 */
paymentsRouter.use(requireAdmin)

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

    const list = await stripe.paymentIntents.list(params, onBehalf)
    res.json({
      data: list.data.map(summarise),
      hasMore: list.has_more,
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
      onBehalf,
    )
    const refunds = await stripe.refunds.list(
      { payment_intent: pi.id, limit: 20 },
      onBehalf,
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
      onBehalf,
    )

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
      onBehalf,
    )
    const succeeded = list.data.filter((p) => p.status === 'succeeded')
    res.json({
      windowDays: 30,
      count: succeeded.length,
      grossAmount: succeeded.reduce((sum, p) => sum + p.amount, 0),
      currency: succeeded[0]?.currency ?? 'cad',
      account: config.stripeAccountId || null,
    })
  } catch (err) {
    next(err)
  }
})
