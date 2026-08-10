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

  /**
   * Paid PDFs live OUTSIDE uploadDir on purpose: everything in uploadDir
   * is served publicly by the static /uploads mount, and these files must
   * only ever leave through the token-checked download route.
   */
  pdfDir: optional('PDF_DIR', './private-pdfs'),

  /**
   * Public base URL of this API, used when a link to it goes into an
   * email (PDF download links). Falls back to localhost in dev.
   */
  apiPublicUrl: optional('API_PUBLIC_URL', '').replace(/\/$/, ''),

  /**
   * The seller, as it must appear on an invoice a customer hands to their
   * employer or accountant. All optional so nothing breaks without it —
   * but an invoice with no address is a weak expense document, so the
   * invoice route warns in the logs when these are blank.
   *
   * BUSINESS_TAX_NUMBER is the GST/HST number. Leave it blank if the
   * business is not registered; the invoice then says so plainly rather
   * than implying tax was charged when it was not.
   */
  business: {
    name: optional('BUSINESS_NAME', 'Wabanaki Software Solutions Inc.'),
    address: optional('BUSINESS_ADDRESS'),
    email: optional('BUSINESS_EMAIL', optional('ADMIN_NOTIFY_EMAIL')),
    taxNumber: optional('BUSINESS_TAX_NUMBER'),
  },

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
   * Publishable key (pk_…) — the one Stripe key that is DESIGNED to be
   * public; it can only tokenise, never charge or read. Setting it turns
   * on the in-page embedded checkout; without it the site falls back to
   * redirecting to Stripe's hosted page.
   */
  stripePublishableKey: optional('STRIPE_PUBLISHABLE_KEY'),

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

  // Twilio SMS. Optional — without credentials, joining the chat by phone
  // simply isn't offered and email codes carry on as before.
  sms: {
    accountSid: optional('TWILIO_ACCOUNT_SID'),
    authToken: optional('TWILIO_AUTH_TOKEN'),
    from: optional('TWILIO_FROM'),
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

/**
 * A warning rather than a hard fail: these two only matter for selling
 * PDFs, and refusing to boot would take the whole site down over a
 * feature that might be unused. The webhook refuses to email a
 * localhost link, so the worst case is a sale that needs manual
 * fulfilment — announced here and by email, never silent.
 */
if (config.isProd && !config.apiPublicUrl) {
  console.warn(
    '[config] API_PUBLIC_URL is not set — paid-PDF download emails cannot be sent.',
  )
}
