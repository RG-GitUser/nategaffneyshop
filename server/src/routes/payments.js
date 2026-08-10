import { Router } from 'express'
import Stripe from 'stripe'
import { z } from 'zod'
import { config } from '../config.js'
import { audit, collections } from '../db.js'
import { markOrderRefunded } from '../orders.js'
import { requireAdmin, signInvoiceToken } from '../middleware/auth.js'
import { isHiddenTestTitle, notHiddenTestOrder } from '../hiddenTestData.js'
import { devStripe, devStripeEnabled, devSalesCount } from '../devStripe.js'

export const paymentsRouter = Router()

// Placeholder values from .env.example count as "not configured" — they'd
// otherwise produce confusing auth errors from Stripe rather than an
// honest "you haven't set this up yet".
const realKey =
  Boolean(config.stripeSecretKey) &&
  !config.stripeSecretKey.includes('placeholder') &&
  !config.stripeSecretKey.includes('xxx')

/**
 * `npm run dev:demo` swaps in invented sales so this dashboard can be
 * looked at on a laptop — see devStripe.js. It cannot engage in
 * production, and it never touches checkout, which keeps using the real
 * client so nothing can accidentally take a payment against a fake.
 */
const stripeReady = devStripeEnabled || realKey
const stripe = devStripeEnabled
  ? devStripe
  : realKey
    ? new Stripe(config.stripeSecretKey)
    : null

if (devStripeEnabled) {
  console.warn(
    `[payments] DEMO DATA — serving ${devSalesCount()} invented payments, not Stripe`,
  )
}

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

/**
 * What a payment was for, in the three buckets the dashboard filters on.
 *
 * A coaching session is paid through a Stripe Payment Link, which carries
 * a bookingId and no itemType — that's what separates it from a service
 * card bought straight off the site. Orders written before bookingId was
 * stored are recognised by the title the link has always used.
 */
export const orderKind = (order) => {
  if (!order) return null
  if (order.bookingId) return 'booking'
  if (order.itemType === 'service') return 'service'
  if (order.itemType === 'shop') return 'product'
  if (String(order.title || '').trim().toLowerCase() === 'coaching session') return 'booking'
  return null
}

const KINDS = ['product', 'service', 'booking']

const normTitle = (t) => String(t || '').trim().toLowerCase()

/**
 * Stripe pages by cursor and never says how many payments exist, so
 * "page 3 of 12" is not a number it can give us. The only way to know is
 * to walk the history and count it — which is also what searching by
 * name or email already required, since Stripe's list API cannot filter
 * on either.
 *
 * So one scan does both jobs: walk back through history, decorate and
 * filter every payment, then slice the requested page out of the result.
 * Bounded, so a shop that grows into thousands of payments cannot turn
 * one page click into an unbounded pile of API calls — past the cap the
 * dashboard says what it could not reach rather than quietly lying about
 * the page count.
 */
const PAGE = 100
const MAX_SCAN = 1000

/** One Stripe page, joined to the order rows that say what was bought. */
async function fetchPage(params) {
  const list = await stripe.paymentIntents.list(
    { ...params, expand: ['data.latest_charge'] },
    ...onBehalf,
  )
  const ids = list.data.map((pi) => pi.id)
  const orders = ids.length
    ? await collections
        .orders()
        .find(
          { paymentIntent: { $in: ids } },
          {
            projection: {
              paymentIntent: 1,
              title: 1,
              itemId: 1,
              itemType: 1,
              bookingId: 1,
              digital: 1,
              sessionId: 1,
              invoice: 1,
            },
          },
        )
        .toArray()
    : []
  return { list, byIntent: new Map(orders.map((o) => [o.paymentIntent, o])) }
}

/**
 * The last scan, kept briefly so clicking through pages doesn't re-walk
 * Stripe every time. Keyed by the filter, because a different filter is
 * a different result set.
 *
 * Short-lived on purpose: this is live money, and a stale page after a
 * refund would be worse than a slow one. Refunding clears it outright.
 */
const scanCache = new Map()
const SCAN_TTL_MS = 30_000

export const clearPaymentScanCache = () => scanCache.clear()

/** Walk history, decorating and filtering everything the scan reaches. */
async function scanPayments({ q, kind, item, returns }) {
  const key = `${q}|${kind || ''}|${item}|${returns ? 'r' : ''}`
  const hit = scanCache.get(key)
  if (hit && Date.now() - hit.at < SCAN_TTL_MS) return hit.value

  /**
   * Every decorated row, before filtering. Kept because each row needs to
   * know the customer's OTHER purchases — and those have to come from the
   * whole scan, not the filtered slice, or filtering to "Bookings" would
   * hide the very purchases the invoice dropdown is meant to offer.
   */
  const all = []
  const matched = []
  let scanned = 0
  let cursor = null
  let hasMore = false

  do {
    const { list, byIntent } = await fetchPage({
      limit: PAGE,
      ...(cursor ? { starting_after: cursor } : {}),
    })
    scanned += list.data.length
    hasMore = list.has_more
    cursor = list.data.at(-1)?.id ?? null

    for (const pi of list.data) {
      const order = byIntent.get(pi.id)

      /**
       * Two kinds of rows stay off the list: abandoned checkouts
       * (requires_payment_method — someone opened the payment form and
       * left; Stripe's own dashboard hides these by default too), and
       * the pre-launch test purchases (see hiddenTestData.js).
       */
      if (pi.status === 'requires_payment_method') continue
      if (isHiddenTestTitle(order?.title)) continue

      const row = {
        ...summarise(pi),
        label: order?.title || pi.description || null,
        kind: orderKind(order),
        // Sold final-sale, so the refund dialog can say what refunding
        // it actually does — and doesn't — reach.
        digital: Boolean(order?.digital),
        // Who the customer had the invoice made out to, if they asked
        // for one. Null means they never did.
        invoicedTo: order?.invoice?.billTo?.name || null,
        // Whether an invoice link can be minted for this row at all —
        // it needs the checkout session the order was written from.
        invoiceable: Boolean(order?.sessionId),
      }

      all.push(row)

      /**
       * Returns are money going back out, which is a different question
       * from what was bought — so this is its own filter rather than
       * another option in the category list. Partial refunds count: a
       * customer given half their money back has still had a return.
       */
      if (returns && !(row.amountRefunded > 0)) continue
      if (kind && row.kind !== kind) continue
      if (item && normTitle(row.label) !== item) continue
      if (q) {
        // Everything the admin might have to hand: the name or email
        // off the receipt, what was bought, or a Stripe id pasted in
        // from an email or the Stripe dashboard.
        const haystack = [row.customerName, row.customerEmail, row.label, row.id]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(q)) continue
      }

      matched.push(row)
    }
  } while (hasMore && scanned < MAX_SCAN)

  /**
   * Everything each customer has bought, so a row can offer the choice of
   * which purchase to invoice. Grouped by email — the only identifier
   * that survives across separate checkouts, since Stripe mints a new
   * customer per session here.
   *
   * Only invoiceable purchases are offered: without the checkout session
   * behind it there is nothing to sign a link against.
   */
  const byCustomer = new Map()
  for (const row of all) {
    const email = row.customerEmail?.trim().toLowerCase()
    if (!email || !row.invoiceable) continue
    if (!byCustomer.has(email)) byCustomer.set(email, [])
    byCustomer.get(email).push({
      id: row.id,
      label: row.label,
      amount: row.amount,
      currency: row.currency,
      created: row.created,
    })
  }

  /**
   * The row's own purchase leads, so invoicing the payment you are
   * looking at is one click. The rest follow newest-first, capped —
   * a long-standing customer should not produce a hundred-option menu.
   */
  const MAX_CHOICES = 12
  for (const row of matched) {
    const email = row.customerEmail?.trim().toLowerCase()
    const mine = (email && byCustomer.get(email)) || []
    const own = mine.filter((b) => b.id === row.id)
    const others = mine.filter((b) => b.id !== row.id)
    row.purchases = [...own, ...others].slice(0, MAX_CHOICES)
  }

  // `truncated` means history ran on past where the scan stopped, so the
  // count — and therefore the page count — is a floor, not a total.
  const value = {
    rows: matched,
    scanned,
    truncated: hasMore,
    // What went back out across everything matched, not just this page —
    // the headline the Returns view exists to show.
    refunded: matched.reduce((sum, r) => sum + (r.amountRefunded || 0), 0),
  }
  scanCache.set(key, { at: Date.now(), value })
  return value
}

/** One page of payments, optionally filtered by what was bought or who bought it. */
paymentsRouter.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100)
    const q = String(req.query.q || '').trim().toLowerCase()
    const kind = KINDS.includes(req.query.kind) ? req.query.kind : null
    const item = normTitle(req.query.item)
    const returns = req.query.returns === '1'

    const { rows, scanned, truncated, refunded } = await scanPayments({
      q,
      kind,
      item,
      returns,
    })

    const total = rows.length
    const pages = Math.max(1, Math.ceil(total / limit))
    // Clamp rather than 404: deleting or refunding rows can shrink the
    // list under someone sitting on the last page, and an empty table
    // with a stuck page number is a worse answer than the last page.
    const page = Math.min(Math.max(Number(req.query.page) || 1, 1), pages)
    const start = (page - 1) * limit

    res.json({
      data: rows.slice(start, start + limit),
      page,
      pages,
      total,
      limit,
      // How far back the scan actually reached, so the panel can say so
      // rather than implying it looked at everything.
      scanned,
      truncated,
      // Total sent back across every matching payment, so the Returns
      // view can lead with it instead of making Nate add up a column.
      refunded,
      account: config.stripeAccountId || null,
    })
  } catch (err) {
    next(err)
  }
})

/**
 * The distinct things people have actually bought, newest first — the
 * options behind the "specific item" filter.
 *
 * Grouped by title rather than item id: the title is what the admin
 * recognises, it is stored on the order at purchase time, and it survives
 * the catalog item being edited or deleted.
 *
 * MUST stay above '/:id' — that route would otherwise swallow '/filters'.
 */
paymentsRouter.get('/filters', async (_req, res, next) => {
  try {
    const rows = await collections
      .orders()
      .aggregate([
        { $match: { ...notHiddenTestOrder, title: { $type: 'string', $ne: '' } } },
        {
          $group: {
            _id: { $trim: { input: '$title' } },
            count: { $sum: 1 },
            itemTypes: { $addToSet: '$itemType' },
            booking: { $max: { $cond: [{ $ifNull: ['$bookingId', false] }, 1, 0] } },
            last: { $max: '$createdAt' },
          },
        },
        { $sort: { last: -1 } },
        { $limit: 100 },
      ])
      .toArray()

    res.json({
      items: rows.map((r) => ({
        title: r._id,
        count: r.count,
        kind: orderKind({
          title: r._id,
          bookingId: r.booking ? 'y' : null,
          itemType: r.itemTypes.includes('service')
            ? 'service'
            : r.itemTypes.includes('shop')
              ? 'shop'
              : null,
        }),
      })),
    })
  } catch (err) {
    next(err)
  }
})

/**
 * A fresh invoice link for one payment, on demand.
 *
 * Every receipt already carries one, but a customer who bought before
 * this existed — or who deleted the email — has no way to reach the
 * invoice page. This gives Nate a link to paste back to them.
 *
 * Minted per request rather than returned with the payments list: the
 * token is a bearer credential for that order, and there is no reason to
 * spray one across every row of a list nobody asked to invoice.
 */
paymentsRouter.post('/invoice-link', async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.paymentIntents)
      ? req.body.paymentIntents.filter((s) => typeof s === 'string' && s.length < 128).slice(0, 20)
      : []
    if (!ids.length) {
      return res.status(400).json({ error: 'Pick at least one purchase to invoice.' })
    }

    const orders = await collections
      .orders()
      .find(
        { paymentIntent: { $in: ids }, status: 'paid' },
        { projection: { sessionId: 1, paymentIntent: 1, email: 1, createdAt: 1 } },
      )
      .toArray()

    if (!orders.length) {
      return res.status(404).json({
        error:
          'No order records for those payments, so there is nothing to invoice. ' +
          'Only payments the webhook recorded can produce a link.',
      })
    }

    /**
     * One invoice, one buyer. The dashboard groups by email already, but
     * this is the gate that decides — a link is a signed credential and
     * must never be able to put a stranger's purchase on someone's
     * invoice.
     */
    const buyers = new Set(orders.map((o) => (o.email || '').trim().toLowerCase()).filter(Boolean))
    if (buyers.size > 1) {
      return res.status(400).json({
        error: 'Those purchases belong to different customers. An invoice can only cover one.',
      })
    }

    const site = (config.allowedOrigins[0] || '').replace(/\/$/, '')
    if (!site) {
      return res.status(503).json({
        error: 'ALLOWED_ORIGINS is not set on the server, so the link would have no site to point at.',
      })
    }

    // Oldest first, so a multi-line invoice reads down the page in the
    // order the purchases actually happened.
    const sessionIds = orders
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
      .map((o) => o.sessionId)
      .filter(Boolean)

    await audit(req.admin.email, 'invoice.link', { paymentIntents: ids, lines: sessionIds.length })
    res.json({ url: `${site}/invoice/?token=${signInvoiceToken(sessionIds)}` })
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

    // The list reloads straight after this; it must not be served the
    // pre-refund scan.
    clearPaymentScanCache()

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