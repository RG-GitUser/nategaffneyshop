/**
 * Creates or updates the single admin account.
 *
 *   cd server
 *   npm run create-admin
 *
 * Prompts for the password with the input hidden. Deliberately NOT taken
 * as a command-line argument by default: argv lands in shell history and
 * is visible in `ps` output to every other user on the box for as long as
 * the command runs.
 *
 * There is no signup route anywhere in the API — this script is the only
 * way an account comes into existence, which is what keeps the dashboard
 * to one person.
 */
import { createInterface } from 'node:readline'
import { stdin, stdout } from 'node:process'
import bcrypt from 'bcryptjs'
import { connect, close, collections } from '../src/db.js'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const MIN_LENGTH = 12

/**
 * ONE readline interface for the whole script, reused for every prompt.
 *
 * Creating a fresh interface per question looks tidier but breaks: the
 * first close() ends stdin, so the second prompt never receives input and
 * the script hangs forever on an unsettled await.
 */
const rl = createInterface({
  input: stdin,
  output: stdout,
  terminal: stdin.isTTY,
})

let muted = false
rl._writeToOutput = (chunk) => {
  if (!muted) stdout.write(chunk)
}

/**
 * Lines are buffered as they arrive rather than read via rl.question().
 *
 * With piped input readline drains the whole stream immediately, so any
 * line that arrives before its question() call is emitted with nobody
 * listening and silently lost — the script then waits forever for input
 * that already came and went. Queueing them makes the script behave the
 * same whether it's typed into or piped to.
 */
const pending = []
const waiting = []

rl.on('line', (line) => {
  const next = waiting.shift()
  if (next) next(line)
  else pending.push(line)
})

const readLine = () =>
  new Promise((resolve) => {
    const buffered = pending.shift()
    if (buffered !== undefined) resolve(buffered)
    else waiting.push(resolve)
  })

async function ask(question) {
  stdout.write(question)
  return (await readLine()).trim()
}

/** Same as ask(), but the typing isn't echoed back. */
async function askHidden(question) {
  stdout.write(question)
  muted = true
  try {
    return (await readLine()).trim()
  } finally {
    muted = false
    stdout.write('\n')
  }
}

let exitCode = 0
try {
  // argv still works for scripted/CI use, with a warning.
  const [, , emailArg, passwordArg] = process.argv
  if (passwordArg) {
    console.warn(
      '\n  Warning: passing the password as an argument leaves it in your\n' +
        '  shell history. Run `npm run create-admin` with no arguments to be\n' +
        '  prompted instead.\n',
    )
  }

  const email = (emailArg || (await ask('Email: '))).toLowerCase().trim()
  if (!EMAIL_RE.test(email)) {
    throw new Error(
      `"${email}" does not look like an email address. It needs a domain with a dot.`,
    )
  }

  let password = passwordArg
  if (!password) {
    password = await askHidden('Password (min 12 chars, hidden): ')
    const again = await askHidden('Repeat it: ')
    if (password !== again) throw new Error('Those did not match. Nothing was changed.')
  }

  if (password.length < MIN_LENGTH) {
    throw new Error(
      `Password must be at least ${MIN_LENGTH} characters. A long phrase you can ` +
        'remember beats a short one full of symbols.',
    )
  }

  await connect()
  const existing = await collections.admins().findOne({ email })
  const passwordHash = await bcrypt.hash(password, 12)

  await collections.admins().updateOne(
    { email },
    {
      $set: { email, passwordHash, updatedAt: new Date() },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true },
  )

  console.log('')
  console.log(
    existing ? `  Password updated for ${email}.` : `  Admin account created for ${email}.`,
  )

  const others = await collections.admins().countDocuments({ email: { $ne: email } })
  if (others > 0) {
    console.log(`  Note: ${others} other admin account(s) also exist on this database.`)
  }

  console.log('  Sign in at /admin/ on the site.')
  console.log('')
} catch (err) {
  console.error(`\n  ${err.message}\n`)
  exitCode = 1
} finally {
  rl.close()
  await close()
  process.exit(exitCode)
}
