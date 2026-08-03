import { Router } from 'express'
import { ObjectId } from 'mongodb'
import Stripe from 'stripe'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { config } from '../config.js'
import { collections, audit } from '../db.js'

export const checkoutRouter = Router()

const stripeReady =
  Boolean(config.stripeSecretKey) &&
  !config.stripeSecretKey.includes('placeholder') &&
  !config.stripeSecretKey.includes('xxx')

const stripe = stripeReady ? new Stripe(config.stripeSecretKey) : null

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
const onBehalf = config.stripeAccountId
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
        success_url: `${site}/?paid=1&session={CHECKOUT_SESSION_ID}`,
        cancel_url: `${site}/#offers`,
        // Read back in the webhook to know what was bought.
        metadata: { itemId: item._id.toString(), title: item.title },
      },
      ...onBehalf,
    )

    res.json({ url: session.url })
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

  try {
    if (event.type === 'checkout.session.completed') {
      const s = event.data.object
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
