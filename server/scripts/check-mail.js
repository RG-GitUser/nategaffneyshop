/**
 * Confirms the SMTP settings actually work.
 *
 *   cd server
 *   npm run check-mail                       # just test the connection
 *   npm run check-mail -- you@example.com    # ...and send a real test email
 *
 * Verifies the login before anything depends on it, so a wrong host or
 * password shows up here rather than the first time someone books.
 */
import 'dotenv/config'
import nodemailer from 'nodemailer'

// Reads the SMTP variables directly rather than importing src/config.js.
// That module requires MONGODB_URI and STRIPE_SECRET_KEY, which have
// nothing to do with email — importing it would mean you couldn't test
// your mail settings until the database was configured too.
const env = (name, fallback = '') => (process.env[name] || fallback).trim()

const config = {
  smtp: {
    host: env('SMTP_HOST'),
    port: Number(env('SMTP_PORT', '465')),
    user: env('SMTP_USER'),
    pass: env('SMTP_PASS'),
    from: env('MAIL_FROM', env('SMTP_USER')),
  },
}

const recipient = process.argv[2]

if (!config.smtp.host) {
  console.log('')
  console.log('  SMTP_HOST is blank, so email is switched off.')
  console.log('  Bookings and chat codes will still work — nothing gets sent.')
  console.log('')
  process.exit(0)
}

const secure = config.smtp.port === 465

console.log('')
console.log(`  Host     ${config.smtp.host}`)
console.log(`  Port     ${config.smtp.port} (${secure ? 'implicit TLS' : 'STARTTLS'})`)
console.log(`  User     ${config.smtp.user}`)
console.log(`  Password ${config.smtp.pass ? '*'.repeat(8) : '(not set)'}`)
console.log(`  From     ${config.smtp.from}`)
console.log(`  Notify   ${env('ADMIN_NOTIFY_EMAIL', '(falls back to SMTP_USER)')}`)
console.log('')

// The usual own-goal: sending as an address the mailbox doesn't own.
// Most servers reject it outright, and the ones that don't will fail SPF
// so the mail lands in spam.
const domainOf = (s) => (s.match(/@([^\s>]+)/) || [])[1]?.toLowerCase()
const userDomain = domainOf(config.smtp.user)
const fromDomain = domainOf(config.smtp.from)

if (userDomain && fromDomain && userDomain !== fromDomain) {
  console.log(`  Warning: MAIL_FROM is @${fromDomain} but you authenticate as @${userDomain}.`)
  console.log('  Most servers refuse to send as a domain you do not own, and anything')
  console.log('  that gets through will fail SPF and land in spam. Match them.')
  console.log('')
}

if (config.smtp.user && !config.smtp.user.includes('@')) {
  console.log('  Warning: SMTP_USER is usually the full email address, not just the')
  console.log('  part before the @.')
  console.log('')
}

const transport = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure,
  auth: { user: config.smtp.user, pass: config.smtp.pass },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
})

let exitCode = 0
try {
  console.log('  Checking connection and login…')
  await transport.verify()
  console.log('  Connected and authenticated.')

  if (recipient) {
    console.log(`  Sending a test message to ${recipient}…`)
    const info = await transport.sendMail({
      from: config.smtp.from,
      to: recipient,
      subject: 'Test from the nategaffneyshop server',
      text: [
        'If you are reading this, SMTP is working.',
        '',
        `Sent from ${config.smtp.host}:${config.smtp.port} as ${config.smtp.user}.`,
      ].join('\n'),
    })
    console.log(`  Sent. Message id ${info.messageId}`)
    console.log('  Check the inbox — and the spam folder, first sends often land there.')
  } else {
    console.log('')
    console.log('  Pass an address to send a real test:')
    console.log('    npm run check-mail -- you@example.com')
  }
  console.log('')
} catch (err) {
  console.error('')
  console.error(`  Failed: ${err.message}`)
  console.error('')

  const code = err.code || ''
  if (code === 'ETIMEDOUT' || code === 'ECONNREFUSED' || code === 'EDNS' || code === 'ENOTFOUND') {
    console.error('  Looks like the host or port is wrong.')
    console.error('    - SMTP_HOST is usually mail.yourdomain.com, not the bare domain.')
    console.error('      The bare domain normally points at your website, not the mail server.')
    console.error('    - Check the exact hostname in your Namecrane panel.')
    console.error('    - Some networks block outbound port 465/587. Try the other one:')
    console.error('      465 needs secure=true, 587 needs STARTTLS — the code picks by port.')
  } else if (/auth|credential|535|password/i.test(err.message)) {
    console.error('  Connected, but the login was rejected.')
    console.error('    - SMTP_USER is normally the full email address, not just the part before @.')
    console.error('    - Re-check the mailbox password in the Namecrane panel.')
  } else if (/self.signed|certificate/i.test(err.message)) {
    console.error('  TLS certificate problem — the hostname likely does not match the')
    console.error('  certificate. Use the exact hostname Namecrane gives you.')
  }
  console.error('')
  exitCode = 1
}

process.exit(exitCode)
