import { Router } from 'express'
import { ObjectId } from 'mongodb'
import { z } from 'zod'
import rateLimit from 'express-rate-limit'
import { collections, audit } from '../db.js'
import { requireAdmin } from '../middleware/auth.js'
import { REFUND_CATEGORY_IDS, refundCategoryLabel } from '../refundCategories.js'
import { notifyRefundRequest, acknowledgeRefundRequest } from '../mailer.js'

/**
 * Refund requests.
 *
 * The support mailbox still receives every one of these — that has not
 * changed, and nothing here reads it. What changed is that the request
 * arrives through a form first, so the reason is a value from a fixed list
 * rather than a sentence somewhere in an email, and the dashboard can
 * group and count them.
 *
 * Deliberately its own router rather than part of payments.js: that one
 * refuses everything with a 503 when Stripe is unconfigured, and the queue
 * has to keep working either way. A request nobody can see is worse than a
 * refund button nobody can press.
 */
export const refundsRouter = Router()

/** The public form is unauthenticated, so it needs its own throttle.
 *  Generous enough for someone who mistypes their email twice, tight
 *  enough that a script cannot bury the queue. */
const publicLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests from here. Try again later, or email support directly.',
  },
})

const requestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  name: z.string().trim().max(120).default(''),
  reference: z.string().trim().max(120).default(''),
  category: z.enum(REFUND_CATEGORY_IDS),
  message: z.string().trim().max(2000).default(''),
})

const STATUSES = ['open', 'resolved', 'declined']

/**
 * Find the purchase a request is about.
 *
 * Tries what they typed first, since a reference identifies one exact
 * order, and falls back to the newest thing that address ever bought. The
 * match is a starting point for Nate, never a decision: `orderCount` says
 * how many paid orders share the address, so a guess between several shows
 * up on the card as a guess instead of reading as certain.
 */
async function matchOrder({ email, reference }) {
  const orders = collections.orders()
  const ref = reference.trim()
  let order = null

  if (/^pi_[A-Za-z0-9_]+$/.test(ref)) {
    order = await orders.findOne({ paymentIntent: ref })
  } else if (/^cs_[A-Za-z0-9_]+$/.test(ref)) {
    order = await orders.findOne({ sessionId: ref })
  } else {
    /**
     * A receipt number is NG-20260809-A1B2C3, where the tail is the last
     * six characters of the Stripe session id — the only part of it we can
     * match on. Anchored at the end, so a six-character run in the middle
     * of some other id cannot pass for it.
     */
    const receipt = ref.toUpperCase().match(/^NG-?\d{8}-?([A-Z0-9]{6})$/)
    if (receipt) {
      /**
       * Two session ids can end in the same six characters. It is unlikely
       * — six alphanumerics is a couple of billion — but `findOne` would
       * answer with whichever Mongo reached first and the card would then
       * present a coin toss as a confident match, which is exactly the
       * kind of thing that gets the wrong customer refunded.
       *
       * So an ambiguous tail counts as no reference at all: the fallback
       * takes over, and the card says the match was a guess.
       */
      const hits = await orders
        .find({ sessionId: { $regex: `${receipt[1]}$`, $options: 'i' } })
        .limit(2)
        .toArray()
      if (hits.length === 1) order = hits[0]
    }
  }

  // Only a paid order counts as a match. A reference that resolves to an
  // abandoned checkout is not the purchase they are writing about.
  if (order && order.status !== 'paid') order = null

  const mine = await orders
    .find(
      { email, status: 'paid' },
      {
        projection: {
          _id: 0,
          paymentIntent: 1,
          title: 1,
          amount: 1,
          currency: 1,
          createdAt: 1,
          digital: 1,
        },
      },
    )
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray()

  const newest = mine[0] ?? null
  const byReference = Boolean(order)
  if (!order) order = newest

  return {
    paymentIntent: order?.paymentIntent ?? null,
    orderTitle: order?.title ?? null,
    orderAmount: order?.amount ?? null,
    orderCurrency: order?.currency ?? null,
    orderPaidAt: order?.createdAt ?? null,
    orderDigital: Boolean(order?.digital),
    // How many paid orders that address has, so the panel can flag a
    // match that was a guess between several.
    orderCount: mine.length,
    // Whether the reference they gave is what produced the match, rather
    // than "the last thing this address bought".
    matchedByReference: byReference,
  }
}

/**
 * Public — submit a refund request.
 *
 * Answers as soon as the request is on record. The two emails are
 * deliberately not awaited: the record is the thing that must not be lost,
 * and a slow mail server should not leave someone watching a spinner,
 * wondering whether to send it a second time.
 */
refundsRouter.post('/', publicLimiter, async (req, res, next) => {
  try {
    const parsed = requestSchema.safeParse(req.body ?? {})
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Check the form. An email address and a reason are both needed.',
        details: parsed.error.flatten(),
      })
    }

    const { email, name, reference, category, message } = parsed.data
    const match = await matchOrder({ email, reference })

    const doc = {
      email,
      name,
      reference,
      category,
      message,
      status: 'open',
      ...match,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const { insertedId } = await collections.refundRequests().insertOne(doc)

    await audit('customer', 'refund.requested', {
      id: insertedId.toString(),
      email,
      category,
      paymentIntent: match.paymentIntent,
    })

    const categoryLabel = refundCategoryLabel(category)
    notifyRefundRequest({ ...doc, categoryLabel })
    acknowledgeRefundRequest({ to: email, name, categoryLabel })

    /**
     * Nothing about the matched order goes back in this response. The form
     * takes an email address from whoever is typing, with nothing to prove
     * it is theirs — echoing "we found your $250 Content Audit" would turn
     * it into a way to look up what any address has bought.
     */
    res.status(201).json({ ok: true })
  } catch (err) {
    next(err)
  }
})

/**
 * Admin — the queue, plus the tally the category bar is drawn from.
 *
 * The tally counts OPEN requests only, whatever the list is filtered to:
 * it exists to show what is landing now, and folding in a year of resolved
 * history would flatten exactly that signal.
 */
refundsRouter.get('/', requireAdmin, async (req, res, next) => {
  try {
    const all = req.query.status === 'all'
    const status = STATUSES.includes(req.query.status) ? req.query.status : 'open'

    const [rows, counts, totals] = await Promise.all([
      collections
        .refundRequests()
        .find(all ? {} : { status })
        .sort({ createdAt: -1 })
        .limit(200)
        .toArray(),
      collections
        .refundRequests()
        .aggregate([
          { $match: { status: 'open' } },
          { $group: { _id: '$category', count: { $sum: 1 } } },
        ])
        .toArray(),
      /**
       * How many sit under each status, so the tabs can carry their own
       * counts. Sent with every response rather than only the first: the
       * numbers move as requests are worked, and a tab strip that still
       * says "Open 7" after you have cleared three is worse than one that
       * says nothing.
       */
      collections
        .refundRequests()
        .aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }])
        .toArray(),
    ])

    const byStatus = Object.fromEntries(totals.map((t) => [t._id, t.count]))

    res.json({
      data: rows.map(({ _id, ...r }) => ({
        ...r,
        id: _id.toString(),
        categoryLabel: refundCategoryLabel(r.category),
      })),
      // Keyed by category id. The panel owns the order and the colours, so
      // an object avoids shipping two lists that could disagree.
      counts: Object.fromEntries(counts.map((c) => [c._id, c.count])),
      totals: {
        open: byStatus.open || 0,
        resolved: byStatus.resolved || 0,
        declined: byStatus.declined || 0,
      },
      open: byStatus.open || 0,
    })
  } catch (err) {
    next(err)
  }
})

/** Admin — resolve, decline, or reopen one request. */
const patchSchema = z.object({
  status: z.enum(STATUSES),
  note: z.string().trim().max(500).default(''),
})

refundsRouter.patch('/:id', requireAdmin, async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid id' })
    }
    const parsed = patchSchema.safeParse(req.body ?? {})
    if (!parsed.success) return res.status(400).json({ error: 'Invalid update' })

    const { status, note } = parsed.data
    const settled = status !== 'open'

    const result = await collections.refundRequests().findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      {
        $set: {
          status,
          note,
          updatedAt: new Date(),
          // Reopening clears the settlement rather than leaving a stale
          // "resolved by" hanging off an open request.
          settledAt: settled ? new Date() : null,
          settledBy: settled ? req.admin.email : null,
        },
      },
      { returnDocument: 'after' },
    )
    if (!result) return res.status(404).json({ error: 'No such request' })

    await audit(req.admin.email, 'refund.request-updated', {
      id: req.params.id,
      status,
      email: result.email,
    })

    const { _id, ...rest } = result
    res.json({
      ...rest,
      id: _id.toString(),
      categoryLabel: refundCategoryLabel(rest.category),
    })
  } catch (err) {
    next(err)
  }
})
