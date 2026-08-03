/**
 * Confirms the database connection before you rely on it.
 *
 *   cd server && npm run check-db
 *
 * Reports what it connected to and what is already stored, without
 * printing the password from the connection string.
 */
import { connect, close, getDb, collections } from '../src/db.js'
import { config } from '../src/config.js'

/** mongodb://user:secret@host/… → mongodb://user:***@host/… */
function safeUri(uri) {
  return uri.replace(/\/\/([^:@/]+):([^@]+)@/, '//$1:***@')
}

let exitCode = 0
try {
  console.log('')
  console.log(`  Connecting to ${safeUri(config.mongoUri)}`)
  console.log(`  Database: ${config.mongoDb}`)

  const started = Date.now()
  await connect()
  console.log(`  Connected in ${Date.now() - started}ms`)

  const build = await getDb().admin().serverInfo()
  console.log(`  MongoDB version ${build.version}`)

  const names = (await getDb().listCollections().toArray()).map((c) => c.name).sort()
  console.log(`  Collections: ${names.length ? names.join(', ') : '(none yet — normal on a fresh database)'}`)

  const admins = await collections.admins().countDocuments()
  console.log('')
  if (admins === 0) {
    console.log('  No admin account yet. Create one with:')
    console.log('    npm run create-admin')
  } else {
    const list = await collections
      .admins()
      .find({}, { projection: { email: 1, _id: 0 } })
      .toArray()
    console.log(`  Admin account(s): ${list.map((a) => a.email).join(', ')}`)
  }
  console.log('')
} catch (err) {
  console.error('')
  console.error(`  Could not connect: ${err.message}`)
  console.error('')

  // Atlas refuses connections from unlisted IPs by aborting the TLS
  // handshake, so it surfaces as an SSL error rather than an auth error.
  // Worth calling out specifically — nothing about the message suggests
  // "your IP isn't allowed", which is nearly always the actual cause.
  const tlsAbort =
    /alert number 80|tlsv1 alert internal error|SSL routines/i.test(err.message)

  if (tlsAbort && /mongodb\.net/i.test(config.mongoUri)) {
    console.error('  This looks like the Atlas IP allowlist.')
    console.error('')
    console.error('  Atlas drops the TLS connection outright when the source IP is not')
    console.error('  allowlisted, which shows up as an SSL error rather than "access')
    console.error('  denied". If this works from your laptop but not from a server, that')
    console.error('  is almost certainly it.')
    console.error('')
    console.error('    Atlas -> Network Access -> Add IP Address')
    console.error('    Add this machine\'s public IP. Find it with:')
    console.error('      curl -s ifconfig.me')
    console.error('')
    console.error('  Allow a few minutes for the change to take effect.')
    console.error('')
  } else {
    console.error('  Common causes:')
    console.error('    - MONGODB_URI not filled in, or has a typo')
    console.error('    - password contains special characters and needs URL encoding')
    console.error('      (@ : / ? # [ ] % must be percent-encoded)')
    console.error('    - IP not allowlisted (Atlas -> Network Access)')
    console.error('    - auth database is wrong — try adding ?authSource=admin')
    console.error('    - mongod is bound to 127.0.0.1 and you are connecting from elsewhere')
    console.error('')
  }
  exitCode = 1
} finally {
  await close()
  process.exit(exitCode)
}
