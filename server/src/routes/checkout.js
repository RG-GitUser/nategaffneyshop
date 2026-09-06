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
 * Email the download link for one paid PDF order.
 *
 * Shared by the webhook and the admin resend route, so a hand-fixed
 * order travels the same code path — and the same checks — as an
 * automatic one.
 *
 * Returns a reason rather than throwing: the webhook turns a failure
 * into a Stripe retry, while the admin route has to say what went wrong.
 */
async function deliverDownload({ sessionId, email, item }) {
  if (!item || item.kind !== 'pdf') return { ok: false, reason: 'not-a-pdf' }
  /**
   * A PDF product with no file attached used to drop out of fulfilment
   * with no email, no flag and no log line — the customer paid and the
   * silence was total. Now it fails like any other delivery problem, so
   * it gets recorded, alerted and retried.
   */
  if (!item.pdfFile) return { ok: false, reason: 'no-file' }
  if (!email) return { ok: false, reason: 'no-email' }
  /**
   * Without a real public URL the link would point at localhost and be
   * useless to the buyer. Better to send nothing and tell Nate than to
   * send a dead link — this is the one-and-only fulfilment email.
   */
  if (!config.apiPublicUrl && config.isProd) return { ok: false, reason: 'no-public-url' }

  const { sendPdfDownload } = await import('../mailer.js')
  const base = config.apiPublicUrl || `http://localhost:${config.port}`
  const sent = await sendPdfDownload({
    to: email,
    title: item.title,
    url: `${base}/api/shop/download?token=${signDownloadToken(sessionId)}`,
  })
  return sent ? { ok: true } : { ok: false, reason: 'smtp' }
}

/** What each failure reason means, in words an admin can act on. */
const DELIVERY_PROBLEM = {
  'not-a-pdf': 'That order is not a PDF download, so there is no file to email.',
  'no-file': 'That product has no PDF uploaded against it. Attach the file, then resend.',
  'no-email': 'That order has no email address on it.',
  'no-public-url':
    'API_PUBLIC_URL is not set on the server, so the download link would point at localhost.',
  smtp: 'The mail server refused the message. Check the SMTP settings (npm run check-mail).',
}

/**
 * Admin — re-send the download email for one paid order.
 *
 * The delivery-failure alert has always told Nate to "re-send from the
 * dashboard"; until now there was nothing there to press. Also the
 * answer to a 7-day link that expired, and to a buyer who typo'd their
 * address at checkout.
 */
checkoutRouter.post('/orders/:sessionId/resend', requireAdmin, async (req, res, next) => {
  try {
    const sessionId = String(req.params.sessionId || '').slice(0, 128)
    const order = await collections.orders().findOne({ sessionId })
    if (!order) return res.status(404).json({ error: 'No order recorded for that session id.' })
    if (order.status !== 'paid') {
      return res.status(400).json({ error: 'That order is not paid, so nothing is owed.' })
    }
    /**
     * The same gate the download route itself applies. Re-sending a
     * refunded order would mint a fresh token for a file the customer
     * no longer has a right to — and the link would 403 anyway.
     */
    if (order.refunded) {
      return res.status(400).json({ error: 'That order was refunded — the download is revoked.' })
    }
    if (!order.itemId || !ObjectId.isValid(order.itemId)) {
      return res.status(400).json({
        error:
          'That order carries no shop item, so there is no file to send. ' +
          'Payments taken through a link made by hand in the Stripe dashboard ' +
          'look like this — send the file manually.',
      })
    }

    /**
     * An optional override address, for the commonest support ticket of
     * all: the buyer mistyped their email at checkout. Audited below,
     * because it redirects a paid download away from the address that
     * actually paid.
     */
    const parsed = z
      .object({ email: z.string().email().max(200).optional() })
      .safeParse(req.body ?? {})
    if (!parsed.success) {
      return res.status(400).json({ error: 'That does not look like an email address.' })
    }
    const to = parsed.data.email || order.email
    if (!to) {
      return res
        .status(400)
        .json({ error: 'That order has no email address. Supply one to send to.' })
    }

    const item = await collections.shopItems().findOne({ _id: new ObjectId(order.itemId) })
    const result = await deliverDownload({ sessionId, email: to, item })

    if (!result.ok) {
      return res.status(502).json({
        error: DELIVERY_PROBLEM[result.reason] || 'The download email could not be sent.',
        reason: result.reason,
      })
    }

    await collections.orders().updateOne(
      { sessionId },
      {
        $set: {
          downloadEmailSent: true,
          downloadEmailFailed: false,
          downloadResentAt: new Date(),
        },
        $unset: { downloadFailReason: '' },
      },
    )
    await audit(req.admin.email, 'order.download-resent', {
      sessionId,
      to,
      redirected: to !== order.email,
    })
    res.json({ ok: true, to })
  } catch (err) {
    next(err)
  }
})

/**
 * Everything one Stripe event asks us to do.
 *
 * Throws on anything that left a customer short, which is what earns a
 * Stripe retry — see the caller. Safe to run twice: every side effect is
 * claimed with a conditional update, so a redelivery repeats only what
 * did not land the first time.
 */
async function handleEvent(event) {
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

    /**
     * A paid session carrying no metadata at all is a payment link made
     * by hand in the Stripe dashboard rather than by the shop (see the
     * /paylink route in shop.js, which exists precisely so a shared link
     * carries the itemId this depends on). Nothing here can tell what
     * was bought, so nothing can be fulfilled — say so loudly rather
     * than recording a blank order and moving on.
     */
    if (s.payment_status === 'paid' && !s.metadata?.itemId && !s.metadata?.bookingId) {
      console.warn(
        `[checkout] paid session ${s.id} (${s.customer_details?.email || 'no email'}) ` +
          'carries no itemId or bookingId — a Stripe link made by hand? Nothing can be ' +
          'fulfilled automatically; check whether this buyer is owed a file.',
      )
    }

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
     * FULFILMENT FIRST, ahead of the receipt.
     *
     * The download is the thing they actually paid for, and both emails
     * share one try/catch: with the receipt going first, a Mongo blip
     * while claiming it skipped the download entirely. Nothing gets to
     * come between a payment and the file.
     */
    let downloadFailure = null
    if (s.payment_status === 'paid' && s.customer_details?.email && item?.kind === 'pdf') {
      /**
       * Claim first so a duplicate delivery of the same event can't
       * send twice — but release the claim if the send fails, so the
       * retry (or a manual resend) can still reach a customer who has
       * already paid.
       */
      const claimed = await collections.orders().updateOne(
        { sessionId: s.id, downloadEmailSent: { $ne: true } },
        { $set: { downloadEmailSent: true } },
      )
      if (claimed.modifiedCount === 1) {
        const result = await deliverDownload({
          sessionId: s.id,
          email: s.customer_details.email,
          item,
        })
        if (!result.ok) {
          /**
           * The alert below goes out over the same SMTP that may have
           * just failed, so the log is the channel that actually
           * survives — name everything needed to fulfil by hand.
           */
          console.error(
            `[checkout] DOWNLOAD EMAIL FAILED (${result.reason}) — owed a file: ` +
              `"${item.title}" to ${s.customer_details.email} (session ${s.id})`,
          )
          // Release the claim unconditionally, so the retry can take it.
          const before = await collections.orders().findOneAndUpdate(
            { sessionId: s.id },
            {
              $set: {
                downloadEmailSent: false,
                downloadEmailFailed: true,
                downloadFailReason: result.reason,
              },
            },
            { returnDocument: 'before' },
          )
          /**
           * Alert once, not once per retry. Stripe redelivers with
           * backoff for days, and Nate does not need the same bad news
           * a dozen times over to act on it.
           */
          if (!before?.downloadEmailFailed) {
            const { notifyPdfDeliveryFailed } = await import('../mailer.js')
            notifyPdfDeliveryFailed({
              title: item.title,
              email: s.customer_details.email,
              sessionId: s.id,
            })
          }
          downloadFailure = result.reason
        } else {
          /**
           * Clear any flag left by an earlier attempt. Without this a
           * retry that finally lands still reads as "Failed" in the
           * dashboard, which would send Nate chasing a customer who
           * already has their file.
           */
          await collections.orders().updateOne(
            { sessionId: s.id },
            { $set: { downloadEmailFailed: false }, $unset: { downloadFailReason: '' } },
          )
        }
      }
    }

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
          // Release the claim so the Stripe retry can try again.
          await collections
            .orders()
            .updateOne({ sessionId: s.id }, { $set: { receiptSent: false } })
          console.error(`[checkout] receipt email failed for session ${s.id}`)
          /**
           * Worth a retry — but the download reports its own failure
           * below, and one throw is enough to earn one. A missing
           * receipt is a nuisance; a missing file is a customer who
           * paid for nothing, so that is the error worth naming.
           */
          if (!downloadFailure) {
            throw new Error(`receipt email failed for session ${s.id}`)
          }
        }
      }
    }

    // Retried by Stripe, which is the whole point of failing here.
    if (downloadFailure) {
      throw new Error(`download email failed (${downloadFailure}) for session ${s.id}`)
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
}

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

  /**
   * A Connect webhook on the platform receives events from EVERY
   * connected account. Without this filter, a sale on any other client's
   * account would be recorded as one of Nate's orders. Acked rather than
   * retried — the event is genuinely not ours to act on.
   */
  if (
    config.stripeAccountId &&
    event.account &&
    event.account !== config.stripeAccountId
  ) {
    return res.json({ received: true })
  }

  /**
   * Do the work, THEN acknowledge.
   *
   * This endpoint used to ack before processing, on the reasoning that
   * Stripe must not be kept waiting. That threw away the only safety net
   * fulfilment has: a non-2xx response is what earns a retry, and with a
   * 200 already sent, one transient SMTP timeout meant a paying customer
   * never received their file — ever. Two comments below the ack claimed
   * "a Stripe retry can try again"; no retry could ever come.
   *
   * The handler is idempotent (every send is claimed with a conditional
   * update), so a redelivery repeats only what did not land, and the mail
   * transport is bounded at ~20s so this cannot hang past Stripe's own
   * request timeout.
   */
  try {
    await handleEvent(event)
    res.json({ received: true })
  } catch (err) {
    console.error('[webhook] handler failed, asking Stripe to retry:', err.message)
    res.status(500).json({ error: 'Handler failed' })
  }
})
