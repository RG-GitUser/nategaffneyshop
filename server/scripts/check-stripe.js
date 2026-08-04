/**
 * Confirms the Stripe key and Connect account actually work, and says
 * exactly what to fix when they don't.
 *
 *   cd server && npm run check-stripe
 *
 * Reads env directly rather than importing src/config.js, so it runs
 * even when the database half of .env is broken — unrelated systems
 * shouldn't block each other's diagnostics.
 */
import 'dotenv/config'
import Stripe from 'stripe'

const env = (n) => (process.env[n] || '').trim()
const key = env('STRIPE_SECRET_KEY')
const acct = env('STRIPE_ACCOUNT_ID')
const whsec = env('STRIPE_WEBHOOK_SECRET')

console.log('')

// ── 1. key shape ─────────────────────────────────────────────
if (!key || key.includes('placeholder') || key.includes('xxx')) {
  console.log('  STRIPE_SECRET_KEY is not set (or still a placeholder).')
  console.log('  Paste the key into server/.env and run this again.')
  console.log('')
  process.exit(1)
}

const shape = key.match(/^(sk|rk)_(live|test)_/)
if (!shape) {
  console.log(`  STRIPE_SECRET_KEY does not look like a Stripe secret key.`)
  console.log(`  It starts "${key.slice(0, 8)}…" — expected sk_live_, sk_test_,`)
  console.log('  rk_live_ or rk_test_. A publishable key (pk_…) cannot be used here.')
  console.log('')
  process.exit(1)
}
const [, kind, mode] = shape
console.log(`  Key      ${kind === 'rk' ? 'restricted' : 'secret'} key, ${mode.toUpperCase()} mode`)
console.log(`  Account  ${acct || '(blank — acting as the key owner itself)'}`)
console.log(`  Webhook  ${whsec ? 'secret present' : 'STRIPE_WEBHOOK_SECRET not set yet'}`)
console.log('')

const stripe = new Stripe(key)
let failed = false

// ── 2. does Stripe accept the key at all? ────────────────────
try {
  const bal = await stripe.balance.retrieve()
  console.log(`  Key works. Platform balance readable (livemode=${bal.livemode}).`)
} catch (err) {
  failed = true
  console.log(`  Key REJECTED: ${err.message}`)
  if (err.type === 'StripeAuthenticationError') {
    console.log('    - The key is wrong, revoked, or was rolled in the dashboard.')
    console.log('    - Re-copy it: dashboard.stripe.com/apikeys (watch the test/live toggle).')
  } else if (err.type === 'StripePermissionError') {
    console.log('    - Restricted key without the needed permission. It needs at least')
    console.log('      Payment Intents: read, Charges: read, Refunds: write —')
    console.log('      plus the "connected accounts" box ticked for Connect.')
  }
}

// ── 3. can it act on behalf of the connected account? ────────
if (!failed && acct) {
  if (!/^acct_/.test(acct)) {
    failed = true
    console.log(`  STRIPE_ACCOUNT_ID "${acct}" does not start with acct_ — that is not`)
    console.log('  an account id. Find it under Connect -> Accounts.')
  } else {
    try {
      const list = await stripe.paymentIntents.list({ limit: 1 }, { stripeAccount: acct })
      console.log(`  Connect works. Read payments on ${acct} (${list.data.length} found in the first page).`)
    } catch (err) {
      failed = true
      console.log(`  Connect REJECTED for ${acct}: ${err.message}`)
      if (/No such account|account_invalid|does not have access/i.test(err.message)) {
        console.log(`    - That account is not connected to THIS platform in ${mode.toUpperCase()} mode.`)
        console.log('    - Test and live mode each have their own connected accounts: an')
        console.log('      account connected in live mode does not exist for a test key.')
        console.log('    - Check Connect -> Accounts (with the mode toggle matching the key)')
        console.log('      and copy the acct_… exactly.')
      } else if (err.type === 'StripePermissionError') {
        console.log('    - Restricted key without the "connected accounts" permission —')
        console.log('      it cannot make requests on behalf of an account without it.')
      }
    }
  }
}

console.log('')
if (failed) {
  console.log('  Fix the above in server/.env, restart the service, run this again.')
} else {
  console.log('  Stripe is fully working. Remaining steps:')
  if (!whsec) console.log('    - npm run setup-webhook   (records paid orders)')
  console.log('    - set a Charge amount on each item in Admin -> Shop')
}
console.log('')
process.exit(failed ? 1 : 0)
