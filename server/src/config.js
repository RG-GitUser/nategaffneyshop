import 'dotenv/config'

/**
 * Reads and validates environment configuration once, at boot.
 *
 * Deliberately fails loudly on startup rather than at first request: a
 * server that boots without STRIPE_SECRET_KEY looks healthy right up until
 * someone tries to issue a refund.
 */

function required(name) {
  const value = process.env[name]
  if (!value || !value.trim()) {
    throw new Error(
      `Missing required environment variable: ${name}. See server/.env.example.`,
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

  stripeSecretKey: required('STRIPE_SECRET_KEY'),

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
  throw new Error(
    'JWT_SECRET is too short. Generate one with:\n' +
      '  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
  )
}

if (config.jwtSecret.includes('replace-me')) {
  throw new Error('JWT_SECRET is still the placeholder from .env.example. Refusing to start.')
}

if (config.isProd && config.allowedOrigins.length === 0) {
  throw new Error(
    'ALLOWED_ORIGINS is empty in production. Refusing to start with open CORS.',
  )
}
