import { Router } from 'express'
import { ObjectId } from 'mongodb'
import Stripe from 'stripe'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { config } from '../config.js'
import { collections, audit } from '../db.js'
import { markOrderRefunded } from '../orders.js'
import { requireAdmin, signDownloadToken, signInvoiceToken } from '../middleware/auth.js'

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
 * A description sized for Stripe's checkout summary: whole sentences
 * while they fit, then whole words, never a mid-word chop. Stripe shows
 * it as one small plain-text block, so past ~300 characters it's noise.
 */
export function summarize(text, max = 300) {
  const t = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (t.length <= max) return t
  const slice = t.slice(0, max)
  const sentence = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('? '),
  )
  if (sentence > max * 0.4) return slice.slice(0, sentence + 1)
  const word = slice.lastIndexOf(' ')
  return `${slice.slice(0, word > 0 ? word : max).trimEnd()}…`
}

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
      .object({
        itemId: z.string().min(1).max(64),
        // Which catalog the id points at: shop items or service cards.
        itemType: z.enum(['shop', 'service']).default('shop'),
      })
      .safeParse(req.body)
    if (!parsed.success || !ObjectId.isValid(parsed.data.itemId)) {
      return res.status(400).json({ error: 'Unknown item' })
    }

    const coll =
      parsed.data.itemType === 'service'
        ? collections.services()
        : collections.shopItems()
    const item = await coll.findOne({
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
                ...(item.description ? { description: summarize(item.description) } : {}),
              },
            },
          },
        ],
        // Stripe sends the receipt; we also store the address for our records.
        customer_creation: 'always',
        // Read back in the webhook to know what was bought.
        metadata: {
          itemId: item._id.toString(),
          title: item.title,
          itemType: parsed.data.itemType,
        },
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
    // JSON, not res.send(string) — that would default to text/html and
    // reflect the message as a page.
    return res.status(400).json({ error: `Webhook Error: ${err.message}` })
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
    if (
      event.type === 'checkout.session.completed' ||
      // Delayed payment methods (bank debits) complete the session first
      // and confirm the money later; this second event carries the same
      // session object, now with payment_status 'paid'.
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      const s = event.data.object

      // A coaching-session payment: mark the booking paid and only now
      // tell Nate — an unpaid request isn't news yet. payment_status is
      // the gate: for async methods 'completed' fires before the money
      // is real, and the Meet link must not travel on a promise.
      if (
        s.metadata?.bookingId &&
        ObjectId.isValid(s.metadata.bookingId) &&
        s.payment_status === 'paid'
      ) {
        const _id = new ObjectId(s.metadata.bookingId)
        // paid:{$ne:true} makes the transition one-shot: Stripe can
        // deliver the same event twice, and the customer must not be
        // emailed or calendar-invited twice for it.
        const booking = await collections.bookings().findOneAndUpdate(
          { _id, paid: { $ne: true } },
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
          // A Payment Link is reusable until deactivated — the pay
          // button in the confirmation email must die with the payment,
          // or a second click would quietly charge twice.
          if (booking.payLinkId) {
            try {
              await stripe.paymentLinks.update(
                booking.payLinkId,
                { active: false },
                ...onBehalf,
              )
            } catch (sErr) {
              console.error('[booking] could not deactivate paid link:', sErr.message)
            }
          }

          const { notifyBookingPaid, notifyBookingPaymentReceived } = await import(
            '../mailer.js'
          )
          notifyBookingPaid(booking)

          if (booking.status === 'confirmed') {
            // The customer's copy carries the Meet link that was held
            // back from the confirmation email until payment landed.
            notifyBookingPaymentReceived(booking)
            // And Google's own invite — with the Meet link — goes out
            // now. One attempt: if Google is down the customer still has
            // the link from the email above, so this is best-effort.
            if (booking.googleEventId) {
              try {
                const { inviteCustomerToEvent } = await import('../google.js')
                await inviteCustomerToEvent(booking.googleEventId, booking)
              } catch (gErr) {
                console.error('[google] post-payment invite failed:', gErr.message)
              }
            }
          } else {
            /**
             * Money landed on a booking that is no longer (or not yet)
             * confirmed — cancelled in a race with the webhook, or paid
             * after being marked done. Nate decides what happens
             * (usually a refund); the customer must NOT be told they're
             * locked in for a session that isn't happening.
             */
            console.warn(
              `[booking] payment landed on a ${booking.status} booking ` +
                `${booking._id} (${booking.email}) — needs a manual look`,
            )
          }
        }
      }

      /**
       * The shop item behind the sale, where there is one. Read once, up
       * front: the order record, the receipt and the PDF delivery below
       * all need to know whether this was a download.
       */
      const item =
        s.metadata?.itemId &&
        s.metadata?.itemType !== 'service' &&
        ObjectId.isValid(s.metadata.itemId)
          ? await collections
              .shopItems()
              .findOne({ _id: new ObjectId(s.metadata.itemId) })
          : null

      await collections.orders().updateOne(
        { sessionId: s.id },
        {
          $set: {
            sessionId: s.id,
            paymentIntent: s.payment_intent,
            itemId: s.metadata?.itemId ?? null,
            itemType: s.metadata?.itemType ?? null,
            // Booking payments arrive through a Payment Link, which
            // carries a bookingId instead of an itemId. Stored so the
            // Payments dashboard can tell a session apart from a sale.
            bookingId: s.metadata?.bookingId ?? null,
            title: s.metadata?.title ?? null,
            // Sold final-sale. Recorded on the order so the dashboard can
            // say so at refund time without re-reading the catalog, and so
            // it survives the item being edited or deleted later.
            digital: item?.kind === 'pdf',
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

      /**
       * Everyone who pays gets a receipt — products, downloads, service
       * cards and coaching sessions alike. Claimed the same way as the
       * download email: a duplicate delivery of the same event finds the
       * flag already set and sends nothing.
       */
      if (s.payment_status === 'paid' && s.customer_details?.email) {
        const claimed = await collections
          .orders()
          .updateOne(
            { sessionId: s.id, receiptSent: { $ne: true } },
            { $set: { receiptSent: true } },
          )
        if (claimed.modifiedCount === 1) {
          const { sendReceipt } = await import('../mailer.js')
          /**
           * The "get an invoice" link is only worth including when it
           * would actually resolve — without a site origin configured it
           * would point at localhost and be dead in the customer's inbox.
           */
          const site = (config.allowedOrigins[0] || '').replace(/\/$/, '')
          const sent = await sendReceipt({
            to: s.customer_details.email,
            name: s.customer_details.name,
            title: s.metadata?.title,
            amountCents: s.amount_total,
            currency: s.currency,
            sessionId: s.id,
            paidAt: new Date(event.created * 1000),
            digital: item?.kind === 'pdf',
            invoiceUrl: site
              ? `${site}/invoice/?token=${signInvoiceToken(s.id)}`
              : null,
          })
          if (!sent) {
            // Release the claim so a Stripe retry can try again. A missing
            // receipt is a nuisance rather than an emergency, so unlike the
            // download email this does not page anyone.
            await collections
              .orders()
              .updateOne({ sessionId: s.id }, { $set: { receiptSent: false } })
            console.error(`[checkout] receipt email failed for session ${s.id}`)
          }
        }
      }

      /**
       * A paid PDF gets its download link by email. The flag flip is a
       * conditional update on the order row, so when Stripe delivers the
       * same event twice only the first delivery sends the email.
       */
      if (s.payment_status === 'paid' && s.customer_details?.email && item) {
        if (item.kind === 'pdf' && item.pdfFile) {
          /**
           * Claim first so a duplicate delivery of the same event can't
           * send twice — but release the claim if the send fails, so the
           * next delivery (or a manual resend) can still reach a
           * customer who has already paid.
           */
          const claimed = await collections.orders().updateOne(
            { sessionId: s.id, downloadEmailSent: { $ne: true } },
            { $set: { downloadEmailSent: true } },
          )
          if (claimed.modifiedCount === 1) {
            const { sendPdfDownload, notifyPdfDeliveryFailed } = await import('../mailer.js')

            /**
             * Without a real public URL the link would point at
             * localhost and be useless to the buyer. Better to send
             * nothing and tell Nate than to send a dead link — this is
             * the one-and-only fulfilment email.
             */
            let sent = false
            if (!config.apiPublicUrl && config.isProd) {
              console.error(
                '[checkout] API_PUBLIC_URL is not set — cannot build a download link for order ' +
                  s.id,
              )
            } else {
              const base = config.apiPublicUrl || `http://localhost:${config.port}`
              sent = await sendPdfDownload({
                to: s.customer_details.email,
                title: item.title,
                url: `${base}/api/shop/download?token=${signDownloadToken(s.id)}`,
              })
            }

            if (!sent) {
              /**
               * The alert below goes out over the same SMTP that just
               * failed, so the log is the channel that actually
               * survives — name everything needed to fulfil by hand.
               */
              console.error(
                `[checkout] DOWNLOAD EMAIL FAILED — owed a file: "${item.title}" to ` +
                  `${s.customer_details.email} (session ${s.id})`,
              )
              await collections
                .orders()
                .updateOne(
                  { sessionId: s.id },
                  { $set: { downloadEmailSent: false, downloadEmailFailed: true } },
                )
              notifyPdfDeliveryFailed({
                title: item.title,
                email: s.customer_details.email,
                sessionId: s.id,
              })
            }
          }
        }
      }
    }

    /**
     * A refund revokes the download. The order row is the only thing the
     * download route trusts, so it has to reflect the refund — the token
     * in the customer's email stays cryptographically valid until it
     * expires, and this is what stops it working.
     *
     * Also the only route by which a refund issued straight from the
     * Stripe dashboard reaches us.
     */
    if (event.type === 'charge.refunded') {
      await markOrderRefunded(event.data.object)
    }
  } catch (err) {
    console.error('[webhook] handler failed:', err.message)
  }
})
