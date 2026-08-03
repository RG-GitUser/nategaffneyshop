import 'dotenv/config'

/**
 * Reads and validates environment configuration once, at boot.
 *
 * Deliberately fails loudly on startup rather than at first request: a
 * server that boots without STRIPE_SECRET_KEY looks healthy right up until
 * someone tries to issue a refund.
 */

/**
 * Config problems print a readable message and exit, rather than throwing.
 * This runs at import time, so a throw here surfaces as a raw Node stack
 * trace before any entry point gets the chance to catch it — which is a
 * miserable first experience for "I forgot to fill in .env".
 */
function fail(message, hint) {
  console.error('')
  console.error('  Configuration problem')
  console.error(`  ${message}`)
  if (hint) console.error(`  ${hint}`)
  console.error('')
  process.exit(1)
}

function required(name) {
  const value = process.env[name]
  if (!value || !value.trim()) {
    fail(
      `${name} is not set.`,
      'Copy server/.env.example to server/.env and fill it in.',
    )
  }
  return value.trim()
}

const optional = (name, fallback = '') => {
  const v = process.env[name]
  return v && v.trim() ? v.trim() : fallback
}

const list = (name) =>
  optional(name)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

export const config = {
  env: optional('NODE_ENV', 'development'),
  port: Number(optional('PORT', '8080')),
  isProd: optional('NODE_ENV', 'development') === 'production',

  allowedOrigins: list('ALLOWED_ORIGINS'),

  mongoUri: required('MONGODB_URI'),
  mongoDb: optional('MONGODB_DB', 'nategaffneyshop'),

  jwtSecret: required('JWT_SECRET'),
  sessionHours: Number(optional('SESSION_HOURS', '12')),
  cookieDomain: optional('COOKIE_DOMAIN'),

  uploadDir: optional('UPLOAD_DIR', './uploads'),
  uploadPublicUrl: optional('UPLOAD_PUBLIC_URL', '/uploads').replace(/\/$/, ''),

  smtp: {
    host: optional('SMTP_HOST'),
    port: Number(optional('SMTP_PORT', '465')),
    user: optional('SMTP_USER'),
    pass: optional('SMTP_PASS'),
    from: optional('MAIL_FROM', optional('SMTP_USER')),
    notify: optional('ADMIN_NOTIFY_EMAIL', optional('SMTP_USER')),
  },

  /**
   * Optional. Without it the Payments tab reports itself unconfigured and
   * everything else — bookings, chat, content, images — runs normally.
   * Requiring it would mean a missing Stripe key blocks the entire site
   * from starting, which is a bad trade for one dashboard tab.
   */
  stripeSecretKey: optional('STRIPE_SECRET_KEY'),

  /**
   * Stripe Connect.
   *
   * STRIPE_SECRET_KEY is the *platform* key. STRIPE_ACCOUNT_ID is the
   * connected account this site sells for — every Stripe call is made on
   * its behalf. Leave the account id blank to act as the platform itself,
   * which is the right setup for a standalone (non-Connect) account.
   */
  stripeAccountId: optional('STRIPE_ACCOUNT_ID'),

  /**
   * Refund behaviour, which differs by charge type:
   *
   *   Direct charges     — the charge lives on the connected account.
   *                        Leave both of these false.
   *   Destination /      — the charge lives on the platform and funds were
   *   separate transfers   transferred out. Set reverseTransfer=true so the
   *                        money comes back, and refundApplicationFee=true
   *                        if you also want to hand back your fee.
   *
   * Getting this wrong doesn't fail loudly — it refunds the customer while
   * leaving the money on the wrong side of the ledger.
   */
  stripeReverseTransfer: optional('STRIPE_REVERSE_TRANSFER') === 'true',
  stripeRefundApplicationFee: optional('STRIPE_REFUND_APPLICATION_FEE') === 'true',

  /**
   * Signing secret for the Stripe webhook. Without it the webhook route
   * refuses every request — an unverified endpoint would accept a forged
   * "payment succeeded" from anyone who found the URL.
   * Stripe Dashboard -> Developers -> Webhooks -> your endpoint.
   */
  stripeWebhookSecret: optional('STRIPE_WEBHOOK_SECRET'),

  // Google Calendar + Meet. Optional — without a client id, bookings fall
  // back to a Meet link pasted in by hand.
  google: {
    clientId: optional('GOOGLE_CLIENT_ID'),
    clientSecret: optional('GOOGLE_CLIENT_SECRET'),
    redirectUri: optional('GOOGLE_REDIRECT_URI'),
    calendarId: optional('GOOGLE_CALENDAR_ID', 'primary'),
    timeZone: optional('GOOGLE_TIMEZONE', 'America/Halifax'),
    durationMinutes: Number(optional('SESSION_MINUTES', '45')),
  },

  // Circle.so community chat. Optional — leave the token blank and the
  // chat section simply reports itself as unconfigured instead of breaking.
  circle: {
    headlessToken: optional('CIRCLE_HEADLESS_TOKEN'),
    adminToken: optional('CIRCLE_ADMIN_TOKEN'),
    spaceId: optional('CIRCLE_SPACE_ID'),
    chatRoomUuid: optional('CIRCLE_CHAT_ROOM_UUID'),
  },
}

// A guessable session secret is the same as no login at all.
if (config.jwtSecret.length < 32) {
  fail(
    'JWT_SECRET is too short.',
    'Generate one: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
  )
}

if (config.jwtSecret.includes('replace-me')) {
  fail(
    'JWT_SECRET is still the placeholder from .env.example.',
    'Generate a real one before going anywhere near production.',
  )
}

if (config.isProd && config.allowedOrigins.length === 0) {
  fail(
    'ALLOWED_ORIGINS is empty while NODE_ENV=production.',
    'Refusing to start with open CORS. List your site origins, comma separated.',
  )
}
