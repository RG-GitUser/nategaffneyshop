/**
 * Who paid for a file and never got it.
 *
 *   cd server && npm run owed-downloads
 *
 * Read-only. Writes nothing, emails nobody — it only reports, so it is
 * safe to run against production while you decide what to do.
 *
 * WHY THIS EXISTS
 *
 * Until the delivery fix, a paid PDF whose product had no file attached
 * fell out of fulfilment in silence: no email, no flag, no log line. The
 * customer got a receipt and nothing else, and nothing in the data said
 * so. That is the hole this script reaches back into.
 *
 * It can, because of how the old code was shaped. `downloadEmailSent`
 * was only ever set INSIDE the block that got skipped, and a failed send
 * released the claim again. So for any paid download it is true only if
 * a link genuinely went out, and every other paid download is somebody
 * still owed a file. The flag the fix writes on failure, downloadEmailFailed,
 * only starts appearing from the deploy onwards — this does not need it.
 *
 * `digital: true` is stamped on the order at payment time, so an order
 * is still recognisable as a download after the product behind it has
 * been edited or deleted.
 */
import { connect, close, collections } from '../src/db.js'
import { config } from '../src/config.js'
import { ObjectId } from 'mongodb'

const money = (cents, currency = 'cad') =>
  new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: String(currency || 'cad').toUpperCase(),
  }).format((cents ?? 0) / 100)

const when = (d) => (d instanceof Date ? d.toISOString().slice(0, 16).replace('T', ' ') : '—')

let exitCode = 0
try {
  await connect()

  const owed = await collections
    .orders()
    .find({ status: 'paid', digital: true, downloadEmailSent: { $ne: true } })
    .sort({ createdAt: 1 })
    .toArray()

  console.log('')
  if (owed.length === 0) {
    console.log('  Nothing owed. Every paid download has had its link sent.')
    console.log('')
  } else {
    /**
     * The order says what was bought; only the product says whether a
     * file is attached NOW. That is the difference between "press resend"
     * and "upload the PDF first, then press resend", so it is worth the
     * extra read.
     */
    const ids = [...new Set(owed.map((o) => o.itemId).filter((id) => id && ObjectId.isValid(id)))]
    const items = ids.length
      ? await collections
          .shopItems()
          .find({ _id: { $in: ids.map((id) => new ObjectId(id)) } })
          .toArray()
      : []
    const byId = new Map(items.map((i) => [i._id.toString(), i]))

    console.log(`  ${owed.length} paid download${owed.length === 1 ? '' : 's'} never delivered`)
    console.log('')

    const blocked = []
    for (const o of owed) {
      const item = o.itemId ? byId.get(o.itemId) : null
      // No item row at all means the product was deleted after the sale;
      // there is nothing left to resend from, so say that rather than
      // implying a file could be attached.
      const state = !o.itemId
        ? 'NO ITEM ON ORDER — check Stripe for what was bought'
        : !item
          ? 'PRODUCT DELETED — recreate it, or send the file by hand'
          : !item.pdfFile
            ? 'NO PDF ATTACHED — upload it, then resend'
            : 'ready to resend'
      if (state !== 'ready to resend') blocked.push(state)

      console.log(`  ${when(o.createdAt)}  ${o.email || '(no email on order)'}`)
      console.log(`     ${o.title || item?.title || '(untitled)'}  ${money(o.amount, o.currency)}`)
      console.log(`     session ${o.sessionId}`)
      console.log(`     ${state}`)
      console.log('')
    }

    console.log('  ── what to do ──')
    console.log('')
    if (blocked.length) {
      console.log(`  ${blocked.length} of these cannot be resent as things stand:`)
      for (const [reason, n] of Object.entries(
        blocked.reduce((acc, r) => ({ ...acc, [r]: (acc[r] || 0) + 1 }), {}),
      )) {
        console.log(`    ${n} × ${reason}`)
      }
      console.log('')
    }
    console.log('  Fix anything listed above first, then resend each one from')
    console.log('  the dashboard: Payments → the order → Resend download.')
    console.log('')
    console.log('  Resending needs the delivery fix deployed. If the button is')
    console.log('  not there, this droplet is still running the old code.')
    console.log('')
  }

  /**
   * Both of these make delivery fail for EVERY download, so a long list
   * above with one of these unset is likely one cause, not many.
   */
  const warn = []
  if (!config.apiPublicUrl) {
    warn.push('API_PUBLIC_URL is not set — download links cannot be built.')
  }
  if (!config.smtp?.host) {
    warn.push('SMTP is not configured — no mail of any kind is going out.')
  }
  if (warn.length) {
    console.log('  ── also worth knowing ──')
    console.log('')
    for (const w of warn) console.log(`  ${w}`)
    console.log('')
  }
} catch (err) {
  console.error('')
  console.error(`  Could not read the orders: ${err.message}`)
  console.error('')
  exitCode = 1
} finally {
  await close()
}

process.exit(exitCode)
