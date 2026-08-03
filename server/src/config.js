import 'dotenv/config'

/**
 * Reads and validates environment configuration once, at boot.
 *
 * Deliberately fails loudly on startup rather than at first request: a
 * server that boots without STRIPE_SECRET_KEY looks healthy right up until
 * someone tries to issue a refund. Better to never come up at all.
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

function optional(name, fallback = '') {
  const value = process.env[name]
  return value && value.trim() ? value.trim() : fallback
}

function list(name) {
  return optional(name)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export const config = {
  env: optional('NODE_ENV', 'development'),
  port: Number(optional('PORT', '8080')),

  allowedOrigins: list('ALLOWED_ORIGINS'),

  mongoUri: required('MONGODB_URI'),
  mongoDb: optional('MONGODB_DB', 'nategaffneyshop'),

  supabaseUrl: required('SUPABASE_URL'),
  supabaseJwtSecret: required('SUPABASE_JWT_SECRET'),
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  supabaseBucket: optional('SUPABASE_BUCKET', 'site-media'),

  // Lowercased so the comparison in auth.js can't fail on capitalisation.
  adminEmails: list('ADMIN_EMAILS').map((e) => e.toLowerCase()),

  stripeSecretKey: required('STRIPE_SECRET_KEY'),
}

if (config.adminEmails.length === 0) {
  throw new Error(
    'ADMIN_EMAILS is empty. With no allowlist, anyone who can sign up to the ' +
      'Supabase project would have admin access. Refusing to start.',
  )
}

if (config.env === 'production' && config.allowedOrigins.length === 0) {
  throw new Error(
    'ALLOWED_ORIGINS is empty in production. Refusing to start with open CORS.',
  )
}
