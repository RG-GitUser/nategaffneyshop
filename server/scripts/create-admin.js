/**
 * Creates or updates the single admin account.
 *
 *   cd server
 *   npm run create-admin -- nate@nategaffney.com "a long passphrase"
 *
 * There is no signup route anywhere in the API — this script is the only
 * way an account comes into existence, which is what keeps the dashboard
 * to one person.
 */
import bcrypt from 'bcryptjs'
import { connect, close, collections } from '../src/db.js'

const [, , emailArg, passwordArg] = process.argv

if (!emailArg || !passwordArg) {
  console.error('Usage: npm run create-admin -- <email> "<password>"')
  process.exit(1)
}

const email = emailArg.toLowerCase().trim()

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error(`"${email}" does not look like an email address.`)
  process.exit(1)
}

if (passwordArg.length < 12) {
  console.error('Password must be at least 12 characters. Longer beats complicated.')
  process.exit(1)
}

try {
  await connect()
  const passwordHash = await bcrypt.hash(passwordArg, 12)

  const existing = await collections.admins().findOne({ email })
  await collections.admins().updateOne(
    { email },
    {
      $set: { email, passwordHash, updatedAt: new Date() },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true },
  )

  console.log(
    existing
      ? `Password updated for ${email}.`
      : `Admin account created for ${email}.`,
  )
  console.log('Sign in at /admin/ on the site.')
} catch (err) {
  console.error('Failed:', err.message)
  process.exitCode = 1
} finally {
  await close()
}
