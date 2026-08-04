import { Router } from 'express'
import { ObjectId } from 'mongodb'
import Stripe from 'stripe'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { config } from '../config.js'
import { collections, audit } from '../db.js'
import { requireAdmin } from '../middleware/auth.js'

export const checkoutRouter = Router()

export const stripeReady =
  Boolean(config.stripeSecretKey) &&
  !config.stripeSecretKey.includes('placeholder') &&
  !config.stripeSecretKey.includes('xxx')

export const stripe = stripeReady ? new Stripe(config.stripeSecretKey) : null

/**
 * Connect: everything happens on the connected account, so the money
 * lands with Nate and the session appears in his dashboard.
 *
 * An ARRAY, spread into each call, not an object passed directly.
 * stripe-node inspects the trailing argument for known option keys, and
 * an empty `{}` matches none of them — it throws "Unknown arguments"
 * rather than ignoring it. Spreading an empty array passes nothing at
 * all, which is what a standalone account needs.
 */
export const onBehalf = config.stripeAccountId
  ? [{ stripeAccount: config.stripeAccountId }]
  : []

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again shortly.' },
})

/**
 * Public config for the frontend: whether embedded checkout is on, and
 * the keys Stripe.js needs. Both values are public by design — the
 * publishable key can only tokenise, and the account id identifies, not
 * authenticates. Served from here rather than baked into the bundle so
 * changing them is an .env edit, not a rebuild.
 */
checkoutRouter.get('/config', (_req, res) => {
  const embedded = stripeReady && Boolean(config.stripePublishableKey)
  res.json({
    embedded,
    publishableKey: embedded ? config.stripePublishableKey : null,
    account: embedded ? config.stripeAccountId || null : null,
  })
})

/**
 * Start a checkout for a shop item.
 *
 * The request carries an item id and nothing else. Price, currency and
 * name are read from the database on this side — if the browser could
 * send an amount, someone would send one cent. That is the whole reason
 * this endpoint exists instead of building the session client-side.
 */
checkoutRouter.post('/session', limiter, async (req, res, next) => {
  try {
    if (!stripeReady) {
      return res.status(503).json({ error: 'Payments are not set up yet.' })
    }

    const parsed = z
      .object({ itemId: z.string().min(1).max(64) })
      .safeParse(req.body)
    if (!parsed.success || !ObjectId.isValid(parsed.data.itemId)) {
      return res.status(400).json({ error: 'Unknown item' })
    }

    const item = await collections.shopItems().findOne({
      _id: new ObjectId(parsed.data.itemId),
      visible: { $ne: false },
    })

    if (!item) return res.status(404).json({ error: 'That item is no longer available' })
    if (!item.priceCents || item.priceCents < 50) {
      return res.status(400).json({ error: 'That item is not set up for online payment' })
    }

    const site = (config.allowedOrigins[0] || '').replace(/\/$/, '')

    /**
     * Embedded when a publishable key is configured: the payment form
     * mounts inside the page and never leaves it. redirect_on_completion
     * 'never' keeps even the success step in-app — the frontend's
     * onComplete callback shows the thank-you, and the webhook records
     * the order regardless. Hosted redirect remains the fallback so
     * payments still work before the publishable key is set.
     */
    const embedded = Boolean(config.stripePublishableKey)

    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: (item.currency || 'cad').toLowerCase(),
              unit_amount: item.priceCents,
              product_data: {
                name: item.title,
                ...(item.description ? { description: item.description.slice(0, 300) } : {}),
              },
            },
          },
        ],
        // Stripe sends the receipt; we also store the address for our records.
        customer_creation: 'always',
        // Read back in the webhook to know what was bought.
        metadata: { itemId: item._id.toString(), title: item.title },
        ...(embedded
          ? { ui_mode: 'embedded', redirect_on_completion: 'never' }
          : {
              success_url: `${site}/?paid=1&session={CHECKOUT_SESSION_ID}`,
              cancel_url: `${site}/#offers`,
            }),
      },
      ...onBehalf,
    )

    res.json(embedded ? { clientSecret: session.client_secret } : { url: session.url })
  } catch (err) {
    /**
     * Anything the Stripe SDK raises is an upstream problem, not a bug
     * here, so it becomes a 502 with a message the customer can act on.
     * Checking `type` alone missed some of them — an authentication
     * failure fell through to the generic 500 handler — so this also
     * looks at rawType and statusCode.
     */
    const fromStripe =
      err?.type?.startsWith('Stripe') || err?.rawType || err?.statusCode
    if (fromStripe) {
      console.error('[checkout] stripe rejected:', err.type || err.rawType, err.message)
      return res.status(502).json({ error: 'Could not start checkout. Please try again.' })
    }
    next(err)
  }
})

/** Admin — recent paid orders, newest first. Without this the orders the
 *  webhook records are only visible by opening Compass. */
checkoutRouter.get('/orders', requireAdmin, async (_req, res, next) => {
  try {
    const rows = await collections
      .orders()
      .find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray()
    res.json(rows.map((o) => ({ ...o, id: o._id.toString(), _id: undefined })))
  } catch (err) {
    next(err)
  }
})

/**
 * Stripe webhook.
 *
 * Mounted with a raw body parser in index.js, because signature
 * verification hashes the exact bytes Stripe sent — parsed-and-restringified
 * JSON produces a different hash and every event would be rejected.
 *
 * Without the signature check this endpoint would accept a forged
 * "payment succeeded" from anyone who found the URL.
 */
checkoutRouter.post('/webhook', async (req, res) => {
  if (!stripeReady || !config.stripeWebhookSecret) {
    return res.status(503).end()
  }

  let event
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.get('stripe-signature'),
      config.stripeWebhookSecret,
    )
  } catch (err) {
    console.warn('[webhook] rejected:', err.message)
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  // Acknowledge immediately. Stripe retries on a slow or failed response,
  // and the work below must not hold that up.
  res.json({ received: true })

  /**
   * A Connect webhook on the platform receives events from EVERY
   * connected account. Without this filter, a sale on any other client's
   * account would be recorded as one of Nate's orders.
   */
  if (
    config.stripeAccountId &&
    event.account &&
    event.account !== config.stripeAccountId
  ) {
    return
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const s = event.data.object

      // A coaching-session payment: mark the booking paid and only now
      // tell Nate — an unpaid request isn't news yet.
      if (s.metadata?.bookingId && ObjectId.isValid(s.metadata.bookingId)) {
        const _id = new ObjectId(s.metadata.bookingId)
        const booking = await collections.bookings().findOneAndUpdate(
          { _id },
          {
            $set: {
              paid: true,
              awaitingPayment: false,
              paymentIntent: s.payment_intent,
              paidAmount: s.amount_total,
              paidCurrency: s.currency,
              updatedAt: new Date(),
            },
          },
          { returnDocument: 'after' },
        )
        if (booking) {
          const { notifyNewBooking } = await import('../mailer.js')
          notifyNewBooking(booking)
        }
      }

      await collections.orders().updateOne(
        { sessionId: s.id },
        {
          $set: {
            sessionId: s.id,
            paymentIntent: s.payment_intent,
            itemId: s.metadata?.itemId ?? null,
            title: s.metadata?.title ?? null,
            amount: s.amount_total,
            currency: s.currency,
            email: s.customer_details?.email ?? null,
            name: s.customer_details?.name ?? null,
            status: s.payment_status,
            createdAt: new Date(event.created * 1000),
          },
        },
        { upsert: true }, // idempotent: Stripe can deliver the same event twice
      )
      await audit('stripe-webhook', 'order.paid', { sessionId: s.id, title: s.metadata?.title })
    }
  } catch (err) {
    console.error('[webhook] handler failed:', err.message)
  }
})
