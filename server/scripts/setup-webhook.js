/**
 * Registers the Stripe webhook and prints the signing secret.
 *
 *   cd server
 *   npm run setup-webhook
 *   npm run setup-webhook -- https://api.other-domain.com   # override URL
 *
 * Runs on the server where STRIPE_SECRET_KEY already lives, so the key
 * never has to leave the box. On Connect (STRIPE_ACCOUNT_ID set) it
 * creates a *platform* endpoint with `connect: true`, which is how the
 * platform receives events raised on connected accounts — the webhook
 * handler filters them down to the one account this site sells for.
 *
 * Reads env directly rather than importing src/config.js: that module
 * demands MONGODB_URI and friends, which have nothing to do with this.
 */
import 'dotenv/config'
import Stripe from 'stripe'

const env = (n, fallback = '') => (process.env[n] || fallback).trim()

const key = env('STRIPE_SECRET_KEY')
const accountId = env('STRIPE_ACCOUNT_ID')

if (!key || key.includes('placeholder') || key.includes('xxx')) {
  console.error('\n  STRIPE_SECRET_KEY is not set in server/.env. Nothing to register.\n')
  process.exit(1)
}

// Default the API origin from UPLOAD_PUBLIC_URL, which already points at it.
let apiBase = process.argv[2]
if (!apiBase) {
  try {
    apiBase = new URL(env('UPLOAD_PUBLIC_URL')).origin
  } catch {
    console.error(
      '\n  Could not work out the API origin. Pass it explicitly:\n' +
        '    npm run setup-webhook -- https://api.nategaffney.store\n',
    )
    process.exit(1)
  }
}
const url = `${apiBase.replace(/\/$/, '')}/api/checkout/webhook`

if (!url.startsWith('https://')) {
  console.error(`\n  Stripe only delivers webhooks over HTTPS. Got: ${url}\n`)
  process.exit(1)
}

const stripe = new Stripe(key)

try {
  console.log('')
  console.log(`  Endpoint  ${url}`)
  console.log(`  Mode      ${accountId ? `Connect (events from ${accountId})` : 'standalone'}`)
  console.log('')

  // One endpoint per URL. Stripe happily creates duplicates, and each has
  // its own secret — a second one would sign events the server rejects.
  const existing = await stripe.webhookEndpoints.list({ limit: 100 })
  const dupe = existing.data.find((e) => e.url === url)

  if (dupe) {
    console.log(`  An endpoint for this URL already exists (${dupe.id}, ${dupe.status}).`)
    console.log('')
    console.log('  Stripe only reveals a signing secret at creation time, so if')
    console.log('  STRIPE_WEBHOOK_SECRET is lost the fix is to recreate it:')
    console.log('')
    console.log(`    npm run setup-webhook -- --replace`)
    console.log('')
    if (process.argv.includes('--replace') || process.argv[3] === '--replace') {
      await stripe.webhookEndpoints.del(dupe.id)
      console.log(`  Deleted ${dupe.id}. Creating a fresh one…`)
      console.log('')
    } else {
      process.exit(0)
    }
  }

  const endpoint = await stripe.webhookEndpoints.create({
    url,
    enabled_events: ['checkout.session.completed'],
    description: 'nategaffney.store — records paid orders',
    // Platform endpoint that receives events from connected accounts.
    ...(accountId ? { connect: true } : {}),
  })

  console.log(`  Created ${endpoint.id}`)
  console.log('')
  console.log('  Add this line to server/.env — the secret is shown ONCE:')
  console.log('')
  console.log(`    STRIPE_WEBHOOK_SECRET=${endpoint.secret}`)
  console.log('')
  console.log('  Then restart:  systemctl restart nategaffneyshop-api')
  console.log('')
} catch (err) {
  console.error(`\n  Stripe refused: ${err.message}\n`)
  if (/permission|restricted/i.test(err.message)) {
    console.error('  A restricted key needs the "Webhook Endpoints" write permission')
    console.error('  to do this. Either add it, or create the endpoint by hand in the')
    console.error('  dashboard and paste its signing secret into STRIPE_WEBHOOK_SECRET.')
    console.error('')
  }
  process.exit(1)
}
