/**
 * A fake Stripe, for local development only.
 *
 * The Payments dashboard reads money from Stripe, not from our database,
 * so on a laptop it is always empty: the dev bootstrap runs a throwaway
 * MongoDB, and STRIPE_ACCOUNT_ID is normally unset, which means the real
 * client lists the *platform's* payments rather than the connected
 * account's. The filters and the invoice buttons then have nothing to
 * render and cannot be judged or clicked.
 *
 * This stands in for the parts of the Stripe client those screens use,
 * over a fixed set of invented sales. It is deterministic — the same
 * payments, amounts and dates every run — so the dashboard does not
 * reshuffle itself between restarts and a figure you are looking at does
 * not change under you.
 *
 * Turned on ONLY by `npm run dev:demo`, and hard-refuses to load in
 * production. Two independent guards, because a fake payments screen in
 * front of a real business would be considerably worse than an empty one.
 */
import { config } from './config.js'

export const devStripeEnabled =
  config.env !== 'production' && process.env.DEV_FAKE_STRIPE === '1'

if (devStripeEnabled && config.isProd) {
  throw new Error('devStripe must never load in production')
}

/**
 * Deterministic pseudo-randomness. Math.random would give a different
 * dashboard on every restart, which makes "did my change do that?"
 * impossible to answer.
 */
function rng(seed) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

/** The catalogue behind the invented sales. */
const CATALOGUE = [
  { title: 'Boiled Egg Salad Sando — the guide', cents: 2400, itemType: 'shop', kind: 'pdf' },
  { title: 'The Home Kitchen Field Guide', cents: 3800, itemType: 'shop', kind: 'pdf' },
  { title: 'Signed print', cents: 6500, itemType: 'shop', kind: 'product' },
  { title: 'Portfolio review', cents: 18000, itemType: 'service', kind: null },
  { title: 'Coaching session', cents: 12000, itemType: null, kind: null, booking: true },
]

const PEOPLE = [
  ['Jamie Fletcher', 'jamie.fletcher@example.com'],
  ['Priya Raman', 'priya.raman@example.com'],
  ['Tom Osei', 'tom.osei@example.org'],
  ['Marie-Claude Roy', 'mc.roy@example.ca'],
  ['Dan Whitfield', 'dan@whitfield.example'],
  ['Sofia Marchetti', 'sofia.marchetti@example.com'],
  ['Alex Nkemdirim', 'alex.n@example.net'],
  ['Rosa Delgado', 'rosa.delgado@example.com'],
]

const CARDS = [
  ['visa', '4242'],
  ['mastercard', '5556'],
  ['amex', '0005'],
  ['visa', '1881'],
]

/**
 * Roughly what each of the last five quarters is worth, in whole dollars,
 * climbing gently — a plausible shape for a shop finding its feet, and
 * enough volume (250-odd sales) that the payments list pages more than
 * once and the filters have something to bite on.
 */
const QUARTER_TARGETS = [3800, 4200, 5100, 6500, 5400]

const quarterStart = (d) => new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1)
const shiftQuarters = (d, n) => new Date(d.getFullYear(), d.getMonth() + n * 3, 1)

/**
 * Build the sales once, at import. Every consumer below reads this same
 * array so the Stripe side and the database side cannot drift apart.
 */
function build() {
  const now = new Date()
  const thisQuarter = quarterStart(now)
  const sales = []
  let n = 0

  QUARTER_TARGETS.forEach((targetDollars, qi) => {
    const start = shiftQuarters(thisQuarter, qi - 4)
    const end = qi === 4 ? now : shiftQuarters(start, 1)
    const span = Math.max(end - start, 86400000)
    const random = rng(20260809 + qi * 7919)

    let cents = 0
    const target = targetDollars * 100
    // Fill the quarter until one more sale would overshoot badly.
    while (cents < target - 1500) {
      const item = CATALOGUE[Math.floor(random() * CATALOGUE.length)]
      if (cents + item.cents > target + 1500) break
      cents += item.cents
      n += 1

      const [name, email] = PEOPLE[n % PEOPLE.length]
      const [cardBrand, cardLast4] = CARDS[n % CARDS.length]
      const created = Math.floor((start.getTime() + random() * span) / 1000)
      const id = String(n).padStart(4, '0')

      sales.push({
        ...item,
        n,
        name,
        email,
        cardBrand,
        cardLast4,
        created,
        sessionId: `cs_dev_${id}`,
        paymentIntent: `pi_dev_${id}`,
        chargeId: `ch_dev_${id}`,
        // A couple of refunds, so the refunded display and the
        // "remaining" maths both get exercised.
        amountRefunded: n % 37 === 0 ? item.cents : 0,
        /**
         * A few sales with no order row, mimicking a charge taken
         * straight from the Stripe dashboard or an old Payment Link —
         * these exercise the "unknown kind, no invoice link" path.
         */
        hasOrder: n % 23 !== 0,
      })
    }
  })

  return sales.sort((a, b) => b.created - a.created)
}

const SALES = devStripeEnabled ? build() : []

const asCharge = (s) => ({
  id: s.chargeId,
  object: 'charge',
  amount: s.cents,
  amount_refunded: s.amountRefunded,
  currency: 'cad',
  created: s.created,
  paid: true,
  status: 'succeeded',
  refunded: s.amountRefunded >= s.cents,
  payment_intent: s.paymentIntent,
  receipt_url: `https://pay.stripe.com/receipts/dev/${s.chargeId}`,
  billing_details: { name: s.name, email: s.email },
  payment_method_details: { card: { brand: s.cardBrand, last4: s.cardLast4 } },
})

const asIntent = (s) => ({
  id: s.paymentIntent,
  object: 'payment_intent',
  amount: s.cents,
  currency: 'cad',
  status: 'succeeded',
  created: s.created,
  description: s.title,
  receipt_email: s.email,
  latest_charge: asCharge(s),
})

/** Stripe's cursor pagination, over an array. */
function page(all, params = {}) {
  const limit = Math.min(Number(params.limit) || 10, 100)
  let rows = all
  if (params.created?.gte) rows = rows.filter((r) => r.created >= params.created.gte)
  if (params.starting_after) {
    const at = rows.findIndex((r) => r.id === params.starting_after)
    rows = at === -1 ? rows : rows.slice(at + 1)
  }
  return { object: 'list', data: rows.slice(0, limit), has_more: rows.length > limit }
}

const notSupported = (what) => {
  const err = new Error(
    `${what} is not available against the demo data — run without the demo flag and use Stripe test mode.`,
  )
  err.type = 'StripeInvalidRequestError'
  return err
}

export const devStripe = {
  paymentIntents: {
    list: async (params) => page(SALES.map(asIntent), params),
    retrieve: async (id) => {
      const s = SALES.find((x) => x.paymentIntent === id)
      if (!s) throw notSupported(`Payment ${id}`)
      return asIntent(s)
    },
  },
  charges: {
    list: async (params) => page(SALES.map(asCharge), params),
    retrieve: async (id) => {
      const s = SALES.find((x) => x.chargeId === id)
      if (!s) throw notSupported(`Charge ${id}`)
      return asCharge(s)
    },
  },
  refunds: {
    list: async () => ({ object: 'list', data: [], has_more: false }),
    // Refunding invented money would teach the wrong thing about a
    // button that moves real money everywhere else.
    create: async () => {
      throw notSupported('Refunding')
    },
  },
}

/**
 * The same sales as order rows, for the database side — this is what
 * gives each payment its item title, its kind, its digital flag and its
 * invoice link. Seeded by scripts/dev.js.
 */
export function devOrderRows() {
  return SALES.filter((s) => s.hasOrder).map((s) => ({
    sessionId: s.sessionId,
    paymentIntent: s.paymentIntent,
    itemId: null,
    itemType: s.itemType,
    bookingId: s.booking ? `dev_booking_${s.n}` : null,
    title: s.title,
    digital: s.kind === 'pdf',
    amount: s.cents,
    currency: 'cad',
    email: s.email,
    name: s.name,
    status: 'paid',
    receiptSent: true,
    createdAt: new Date(s.created * 1000),
  }))
}

export const devSalesCount = () => SALES.length
