import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { config } from '../config.js'
import { collections } from '../db.js'
import { verifyInvoiceToken } from '../middleware/auth.js'

export const invoiceRouter = Router()

/**
 * Self-serve invoices.
 *
 * A receipt proves money moved. An invoice is what someone hands to their
 * employer or their accountant, and it needs things we never asked for at
 * checkout: the company being billed, its address, a purchase-order
 * reference. Rather than making that a support email to Nate, the receipt
 * carries a link here and the customer fills in their own details.
 *
 * The link's token IS the authorisation — possession of it proves they
 * received the receipt for that order. It is signed with a key derived
 * from JWT_SECRET (see middleware/auth.js), so it can never act as an
 * admin session, and it grants nothing beyond reading one order's totals
 * and attaching billing details to it.
 */

/** Generous, because a legitimate person may reload and re-issue a few
 *  times while getting the billing address right — but bounded, since the
 *  token is a URL that could be shared or scraped from a forwarded email. */
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again in a few minutes.' },
})

invoiceRouter.use(limiter)

const money = (cents, currency = 'cad') =>
  new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: String(currency || 'cad').toUpperCase(),
  }).format((cents ?? 0) / 100)

/**
 * Same shape as the receipt number, different prefix — the two documents
 * describe the same payment and an accountant should be able to see that
 * at a glance. Derived from the session rather than a counter, so
 * re-issuing an invoice never mints a second number for one sale.
 */
const invoiceNumber = (sessionId, issuedAt) =>
  [
    'INV',
    issuedAt.toISOString().slice(0, 10).replace(/-/g, ''),
    String(sessionId || '')
      .replace(/[^a-z0-9]/gi, '')
      .slice(-6)
      .toUpperCase() || 'XXXXXX',
  ].join('-')

/**
 * What the invoice can honestly say about tax.
 *
 * Checkout does not calculate or collect GST/HST — there is no Stripe Tax
 * configuration and no tax rate on the line item — so the total the
 * customer paid is the whole amount, with nothing to break out. Claiming
 * a tax component that was never charged would make the document wrong
 * for exactly the purpose it exists for.
 *
 * With no tax number set the invoice says nothing about tax at all. A
 * total with no tax line already reads as a total with no tax in it, and
 * whether the business is registered is not something this code can know
 * — an invoice is the wrong place to guess. Set BUSINESS_TAX_NUMBER once
 * there is one and the number appears here.
 */
const taxLine = () =>
  config.business.taxNumber
    ? `GST/HST No. ${config.business.taxNumber}. No tax was calculated separately on this sale; the total shown is the full amount charged.`
    : null

const seller = () => ({
  name: config.business.name,
  address: config.business.address || null,
  email: config.business.email || null,
  taxNumber: config.business.taxNumber || null,
})

/**
 * Everything the invoice page renders, built from one or more orders.
 *
 * The first order is the anchor: it carries the billing details and the
 * invoice number, so adding a second purchase to an invoice does not
 * renumber the one already sent. Every order contributes a line.
 */
function toInvoice(orders) {
  const [head] = orders
  const issuedAt = head.invoice?.issuedAt || new Date()
  const amount = orders.reduce((sum, o) => sum + (o.amount || 0), 0)
  const currency = head.currency || 'cad'

  return {
    number: invoiceNumber(head.sessionId, issuedAt),
    issuedAt,
    // The purchase date, which is what the expense claim is actually
    // about — not the day the invoice happened to be generated. Across
    // several purchases it is the most recent of them.
    paidAt: orders.reduce(
      (latest, o) => (o.createdAt && o.createdAt > latest ? o.createdAt : latest),
      head.createdAt || issuedAt,
    ),
    seller: seller(),
    billTo: head.invoice?.billTo || null,
    reference: head.invoice?.reference || null,
    lines: orders.map((o) => ({
      item: o.title || 'Purchase',
      paidAt: o.createdAt || issuedAt,
      amount: o.amount,
      price: money(o.amount, o.currency || currency),
    })),
    amount,
    currency,
    total: money(amount, currency),
    taxNote: taxLine(),
    paidWith: 'Card (paid in full)',
  }
}

/**
 * The orders behind the token, or an honest answer why not.
 *
 * Returned in the order the token lists them, so the anchor stays the
 * anchor however Mongo feels like returning the documents.
 */
async function ordersFromToken(req, res) {
  const sessionIds = verifyInvoiceToken(req.query.token || req.body?.token)
  if (!sessionIds) {
    res.status(403).json({
      error:
        'This invoice link is invalid or has expired. Reply to your receipt email and we will send a fresh one.',
    })
    return null
  }

  const found = await collections
    .orders()
    .find({ sessionId: { $in: sessionIds }, status: 'paid' })
    .toArray()

  const bySession = new Map(found.map((o) => [o.sessionId, o]))
  const orders = sessionIds.map((id) => bySession.get(id)).filter(Boolean)

  if (!orders.length) {
    res.status(404).json({ error: 'We could not find a completed payment for this link.' })
    return null
  }

  /**
   * Every line has to belong to the same buyer. The token is signed, so
   * this is not a tampering defence — it catches a dashboard mistake
   * before someone's invoice lists a stranger's purchase.
   */
  const buyers = new Set(orders.map((o) => (o.email || '').trim().toLowerCase()).filter(Boolean))
  if (buyers.size > 1) {
    console.error(
      `[invoice] refused a link spanning ${buyers.size} customers: ${sessionIds.join(', ')}`,
    )
    res.status(409).json({
      error: 'This link mixes purchases from different customers. Email us and we will re-issue it.',
    })
    return null
  }

  return orders
}

/** The order behind the link, plus any invoice already issued for it. */
invoiceRouter.get('/', async (req, res, next) => {
  try {
    const orders = await ordersFromToken(req, res)
    if (!orders) return
    const [order] = orders

    // Worth knowing before a customer emails to ask why the invoice has
    // no address on it — this is a configuration gap, not a code fault.
    if (!config.business.address) {
      console.warn(
        '[invoice] BUSINESS_ADDRESS is not set — invoices are going out without a seller address',
      )
    }

    res.json({
      issued: Boolean(order.invoice?.billTo),
      customerEmail: order.email || null,
      customerName: order.name || null,
      invoice: toInvoice(orders),
    })
  } catch (err) {
    next(err)
  }
})

const billingSchema = z.object({
  token: z.string().min(1),
  /** Who the invoice is made out to. A person claiming a reimbursement
   *  puts their own name here, so this is not required to be a company. */
  billToName: z.string().trim().min(1).max(160),
  billToAddress: z.string().trim().max(500).default(''),
  /** Their tax id, where their finance team needs one on the document. */
  billToTaxNumber: z.string().trim().max(60).default(''),
  /** A purchase-order or expense-claim number, so their accounts payable
   *  can match the invoice to whatever they raised internally. */
  reference: z.string().trim().max(80).default(''),
  /** Send a copy by email as well as showing it on screen. */
  email: z.boolean().default(true),
})

/** Issue (or re-issue) the invoice for this order. */
invoiceRouter.post('/', async (req, res, next) => {
  try {
    const parsed = billingSchema.safeParse(req.body ?? {})
    if (!parsed.success) {
      return res.status(400).json({ error: 'Please fill in who the invoice is for.' })
    }

    const orders = await ordersFromToken(req, res)
    if (!orders) return
    const [order] = orders

    const billTo = {
      name: parsed.data.billToName,
      address: parsed.data.billToAddress || null,
      taxNumber: parsed.data.billToTaxNumber || null,
    }

    /**
     * issuedAt is set once and kept. Re-issuing with a corrected address
     * must not change the invoice number or its date — an accounts
     * payable team that already has the first copy would otherwise be
     * looking at what appears to be a second, different invoice.
     */
    const issuedAt = order.invoice?.issuedAt || new Date()
    const record = {
      billTo,
      reference: parsed.data.reference || null,
      issuedAt,
      updatedAt: new Date(),
    }

    /**
     * Written to every order on the invoice, not just the anchor, so the
     * Payments dashboard shows "invoiced" against each line rather than
     * leaving the others looking un-invoiced.
     */
    await collections
      .orders()
      .updateMany(
        { sessionId: { $in: orders.map((o) => o.sessionId) } },
        { $set: { invoice: record } },
      )

    const invoice = toInvoice([{ ...order, invoice: record }, ...orders.slice(1)])

    let emailed = false
    if (parsed.data.email && order.email) {
      const { sendInvoice } = await import('../mailer.js')
      emailed = await sendInvoice({ to: order.email, invoice })
    }

    res.json({ invoice, emailed })
  } catch (err) {
    next(err)
  }
})
