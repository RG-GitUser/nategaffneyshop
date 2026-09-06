import nodemailer from 'nodemailer'
import { config } from './config.js'
import {
  wrap,
  paragraph,
  muted,
  details,
  row,
  button,
  codeBlock,
} from './emailTemplate.js'

/**
 * Namecrane SMTP. Optional by design — if SMTP_HOST is blank the app runs
 * normally and simply doesn't send anything, so a mail outage or a missing
 * password can never stop someone booking.
 */

const enabled = Boolean(config.smtp.host && config.smtp.user)

/** One address for refunds, problems and questions — repeated in every
 *  customer-facing message so nobody has to hunt for where to write. */
const SUPPORT = 'support@nategaffney.store'

/**
 * The public site, for the one link a customer-facing email needs to point
 * at. Blank in a dev shell with no ALLOWED_ORIGINS, and every use below
 * falls back to the plain support address rather than emitting a href to
 * nowhere.
 */
const SITE = (config.allowedOrigins[0] || '').replace(/\/$/, '')
const REFUND_URL = SITE ? `${SITE}/refund/` : ''

/** Where to send someone who wants their money back.
 *
 *  The form is preferred because it asks for the reason as one of a fixed
 *  set, which is what lets the dashboard see what is actually going wrong
 *  — but the mailbox is named in the same breath every time. Somebody
 *  upset about a charge should never have to use a particular form to be
 *  heard, and a form is no use at all to a customer whose complaint is
 *  that the site is broken. */
const refundRoute = REFUND_URL
  ? `ask for a refund at ${REFUND_URL}, or email ${SUPPORT}`
  : `email ${SUPPORT}`

const transport = enabled
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      // 465 is implicit TLS; 587 upgrades via STARTTLS.
      secure: config.smtp.port === 465,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
      /**
       * Bounded, because the Stripe webhook now WAITS on the download
       * email before answering. Nodemailer's defaults run to minutes; a
       * hung mail server would hold the webhook open past Stripe's own
       * timeout, which reads as a failure anyway but costs the retry a
       * clean error to act on. Better to fail in ten seconds and retry.
       */
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    })
  : null

if (!enabled) {
  console.warn('[mail] SMTP not configured — notification emails are disabled')
}

/** Always sends both parts — some people read in plain text by choice,
 *  and HTML-only mail scores worse with spam filters.
 *
 *  Resolves true only when the mail actually went out, so a caller whose
 *  message IS the product (the PDF download link) can react to failure
 *  rather than assume delivery. */
async function send({ to, subject, text, html }) {
  if (!transport || !to) return false
  try {
    await transport.sendMail({
      from: config.smtp.from,
      /**
       * Several of these messages tell the customer to "reply to this
       * email", and MAIL_FROM is often a noreply@ mailbox nobody reads.
       * Pointing replies at support keeps that promise honest whatever
       * the from address happens to be.
       */
      replyTo: SUPPORT,
      to,
      subject,
      text,
      html,
    })
    return true
  } catch (err) {
    // Never let a mail failure break the request that triggered it.
    console.error('[mail] send failed:', err.message)
    return false
  }
}

/** Verifies SMTP credentials at boot so problems surface in the logs
 *  rather than silently the first time someone books. */
export async function verifyMail() {
  if (!transport) return
  try {
    await transport.verify()
    console.log(`[mail] SMTP ready (${config.smtp.host}:${config.smtp.port})`)
  } catch (err) {
    console.error(`[mail] SMTP check failed: ${err.message}`)
  }
}

const when = (b) => `${b.date} at ${b.time}`

/**
 * The legal seller, which a receipt has to name — this is the company
 * the customer's card was actually charged by, and the same name that
 * appears throughout the terms and privacy policy.
 */
const SELLER = 'Wabanaki Software Solutions Inc.'

const money = (cents, currency = 'cad') =>
  new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: String(currency || 'cad').toUpperCase(),
  }).format((cents ?? 0) / 100)

/**
 * A stable, readable reference: NG-20260809-A1B2C3.
 *
 * Derived from the Stripe session rather than a counter, so replaying the
 * same webhook event produces the same number instead of burning a new
 * one — and there is no sequence to get out of step during an outage.
 */
export const receiptNumber = (sessionId, paidAt) =>
  [
    'NG',
    paidAt.toISOString().slice(0, 10).replace(/-/g, ''),
    String(sessionId || '').replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase() || 'XXXXXX',
  ].join('-')

/**
 * To any buyer — proof of payment for whatever they just bought.
 *
 * A receipt, not an invoice: the money has already moved, so this records
 * the payment rather than requesting it. Sent for every paid checkout —
 * PDFs, products, service cards and coaching sessions alike — separately
 * from whatever delivers the thing itself.
 *
 * The refund line is set by what was bought, because the policy really is
 * different: a downloaded file cannot be handed back, a session can be
 * called off.
 */
export function sendReceipt({
  to,
  name,
  title,
  amountCents,
  currency,
  sessionId,
  paidAt = new Date(),
  digital = false,
  invoiceUrl = null,
}) {
  const total = money(amountCents, currency)
  const ref = receiptNumber(sessionId, paidAt)
  const date = paidAt.toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const item = title || 'Your order'

  const policy = digital
    ? `Digital downloads are final sale. Once the download link has been sent the file cannot be returned, so it cannot be refunded. That does not affect your rights if a file is faulty, not as described, or never arrives. For a refund, a problem, or any concern at all, ${refundRoute}.`
    : `To change, cancel or ask for a refund, or with any concern at all, ${refundRoute}. The cancellation terms are on the site.`

  return send({
    to,
    subject: `Your receipt — ${item}`,
    text: [
      `Thanks${name ? `, ${name}` : ''}! Here is your receipt.`,
      ``,
      `Receipt   ${ref}`,
      `Date      ${date}`,
      `Item      ${item}`,
      `Total     ${total}`,
      `Paid to   ${SELLER}`,
      ``,
      policy,
      ``,
      ...(invoiceUrl
        ? [
            `Need a proper invoice for your business or an expense claim?`,
            `Add your billing details here and we'll issue one:`,
            invoiceUrl,
            ``,
          ]
        : []),
      `Questions about this payment? Reply to this email, or write to ${SUPPORT}.`,
    ].join('\n'),
    html: wrap({
      eyebrow: 'Receipt',
      title: `${total} paid`,
      preheader: `${ref} — ${item}`,
      body:
        paragraph(`Thanks${name ? `, ${name}` : ''}! Here is your receipt.`) +
        details([
          row('Receipt', ref),
          row('Date', date),
          row('Item', item),
          row('Total paid', total),
          row('Paid to', SELLER),
        ]) +
        (invoiceUrl
          ? paragraph(
              'Need a proper invoice for your business or an expense claim? Add your billing details and we’ll issue one:',
            ) + button(invoiceUrl, 'Get an invoice')
          : '') +
        muted(`${policy} Questions about this payment? Reply to this email.`),
    }),
  })
}

/**
 * To a buyer — the invoice they just asked for, made out to whoever they
 * told us to bill. Sent as well as being shown on screen, because an
 * expense claim usually has to be forwarded to someone else.
 */
export function sendInvoice({ to, invoice }) {
  const issued = new Date(invoice.issuedAt).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const paid = new Date(invoice.paidAt).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  /** Names the purchase, or counts them once there is more than one. */
  const summary =
    invoice.lines.length > 1
      ? `${invoice.lines.length} purchases`
      : invoice.lines[0]?.item || 'your purchase'

  return send({
    to,
    subject: `Invoice ${invoice.number} — ${summary}`,
    text: [
      `Here is invoice ${invoice.number}.`,
      ``,
      `Invoice    ${invoice.number}`,
      `Issued     ${issued}`,
      `Paid on    ${paid}`,
      `Billed to  ${invoice.billTo?.name || '—'}`,
      ...(invoice.reference ? [`Reference  ${invoice.reference}`] : []),
      ...invoice.lines.map((l) => `Item       ${l.item}  ${l.price}`),
      `Total      ${invoice.total}`,
      `Status     PAID IN FULL`,
      ``,
      `From ${invoice.seller.name}`,
      ...(invoice.seller.address ? [invoice.seller.address] : []),
      ``,
      // Null unless a GST/HST number is configured, and an unguarded null
      // would print the word "null" in a customer's invoice.
      ...(invoice.taxNote ? [invoice.taxNote, ''] : []),
      `Something wrong on this invoice, or any other concern, including a`,
      `refund? Email ${SUPPORT} and we'll correct it and re-issue.`,
    ].join('\n'),
    html: wrap({
      eyebrow: `Invoice ${invoice.number}`,
      title: `${invoice.total} — paid in full`,
      preheader: `${invoice.number} — ${summary}`,
      body:
        paragraph(`Here is your invoice for ${summary}.`) +
        details([
          row('Invoice', invoice.number),
          row('Issued', issued),
          row('Paid on', paid),
          row('Billed to', invoice.billTo?.name || '—'),
          ...(invoice.billTo?.address ? [row('Address', invoice.billTo.address)] : []),
          ...(invoice.billTo?.taxNumber ? [row('Their tax no.', invoice.billTo.taxNumber)] : []),
          ...(invoice.reference ? [row('Reference', invoice.reference)] : []),
          ...invoice.lines.map((l) => row('Item', `${l.item}  ${l.price}`)),
          row('Total', invoice.total),
          row('Status', 'Paid in full'),
          row('From', invoice.seller.name),
          ...(invoice.seller.address ? [row('Address', invoice.seller.address)] : []),
        ]) +
        muted(
          `${invoice.taxNote ? `${invoice.taxNote} ` : ''}Something wrong on this invoice, or any other concern, including a refund? Email ${SUPPORT} and we’ll correct it and re-issue.`,
        ),
    }),
  })
}

export function sendChatCode(email, code) {
  send({
    to: email,
    subject: `${code} is your code to join the chat`,
    text: [
      `Your code is ${code}`,
      ``,
      `Enter it on the site to join the group chat. It expires in 10 minutes.`,
      ``,
      `If you didn't ask for this, ignore it — nothing has been created.`,
    ].join('\n'),
    html: wrap({
      eyebrow: 'Your code',
      title: 'Join the chat',
      preheader: `${code} — expires in 10 minutes.`,
      body:
        paragraph('Enter this on the site to join the group chat:') +
        codeBlock(code) +
        muted(
          'Expires in 10 minutes. If you didn’t ask for this, ignore it — nothing has been created.',
        ),
    }),
  })
}

/** To a shop buyer — their paid PDF is ready to download. Awaited by the
 *  webhook: this email IS the thing they paid for, so delivery has to be
 *  known rather than assumed. */
export function sendPdfDownload({ to, title, url }) {
  return send({
    to,
    subject: `Your download — ${title}`,
    text: [
      `Thanks for the purchase! Download "${title}" here:`,
      ``,
      url,
      ``,
      `The link works for 7 days. If it expires, reply to this email and we'll send a fresh one.`,
      ``,
      `Because this is a download, the sale is final and cannot be refunded.`,
      `If the file is faulty, not as described, or never arrives — or you have`,
      `any other concern — email ${SUPPORT} and we'll fix it.`,
      ``,
      `Your separate receipt is on its way, with a link to request an invoice.`,
    ].join('\n'),
    html: wrap({
      eyebrow: 'Your download',
      title,
      preheader: 'Your PDF is ready.',
      body:
        paragraph('Thanks for the purchase! Your PDF is ready:') +
        button(url, 'Download the PDF') +
        muted(
          'The link works for 7 days. If it expires, reply to this email and we’ll send a fresh one. ' +
            'Because this is a download, the sale is final and cannot be refunded — but if the file is ' +
            'faulty, not as described, or never arrives, or you have any other concern, email ' +
            `${SUPPORT} and we’ll fix it. Your receipt follows in a separate email, with a link to ` +
            'request an invoice.',
        ),
    }),
  })
}

/** To Nate — a customer paid for a PDF but the download email did not
 *  go out. Someone is owed a file, so this must not fail silently. */
export function notifyPdfDeliveryFailed({ title, email, sessionId }) {
  send({
    to: config.smtp.notify,
    subject: `Action needed — download email failed for "${title}"`,
    text: [
      `${email} paid for "${title}" but the download email could not be sent.`,
      ``,
      `They are owed the file. Send it to them directly, or fix the mail`,
      `settings and re-send from the dashboard.`,
      ``,
      `Stripe session: ${sessionId}`,
    ].join('\n'),
    html: wrap({
      eyebrow: 'Action needed',
      title: 'A download email failed',
      preheader: `${email} paid for "${title}" and has not received it.`,
      body:
        paragraph(
          `${email} paid for “${title}”, but the download email could not be sent. They are owed the file.`,
        ) +
        details([row('Item', title), row('Customer', email), row('Stripe session', sessionId)]) +
        muted('Send the file directly, or fix the mail settings and re-send.'),
    }),
  })
}

/** To Nate — a confirmed session's payment landed. */
export function notifyBookingPaid(booking) {
  const amount = booking.paidAmount
    ? `$${(booking.paidAmount / 100).toFixed(2)}`
    : 'Payment'
  send({
    to: config.smtp.notify,
    subject: `Paid — ${when(booking)}`,
    text: [
      `${booking.name} paid ${amount} for ${when(booking)}.`,
      ``,
      `Nothing to do — this is just the receipt landing.`,
    ].join('\n'),
    html: wrap({
      eyebrow: 'Booking paid',
      title: `${amount} received`,
      preheader: `${booking.name} — ${when(booking)}`,
      body:
        paragraph(`${booking.name} paid ${amount} for ${when(booking)}.`) +
        muted('Nothing to do — this is just the receipt landing.'),
    }),
  })
}

export function notifyChatBanned(email) {
  send({
    to: email,
    subject: 'Your access to the chat has been removed',
    text: [
      `You can no longer post in the group chat.`,
      ``,
      `If you think this was a mistake, reply to this email.`,
    ].join('\n'),
    html: wrap({
      eyebrow: 'Group chat',
      title: 'Access removed',
      preheader: 'You can no longer post in the group chat.',
      body:
        paragraph('You can no longer post in the group chat.') +
        muted('If you think this was a mistake, reply to this email.'),
    }),
  })
}

export function notifyChatUnbanned(email) {
  send({
    to: email,
    subject: 'You can join the chat again',
    text: [
      `Your access to the group chat has been restored.`,
      ``,
      `Join again from the site — you'll get a fresh sign-in code by email.`,
    ].join('\n'),
    html: wrap({
      eyebrow: 'Group chat',
      title: 'Welcome back',
      preheader: 'Your access to the group chat has been restored.',
      body:
        paragraph('Your access to the group chat has been restored.') +
        paragraph('Join again from the site — you’ll get a fresh sign-in code by email.'),
    }),
  })
}

export function notifyNewBooking(booking) {
  // "session" vs the short paid check-in booked through /followup/ vs a
  // custom share link, which is named after the link itself.
  const kind = booking.linkTitle
    ? `"${booking.linkTitle}" session`
    : booking.type === 'followup'
      ? 'follow-up call'
      : 'session'
  // to Nate
  send({
    to: config.smtp.notify,
    subject: `New booking request — ${when(booking)}`,
    text: [
      `${booking.name} requested a ${kind}.`,
      ``,
      `When:  ${when(booking)}`,
      `Name:  ${booking.name}`,
      `Email: ${booking.email}`,
      ``,
      `What they want out of it:`,
      booking.note || '(nothing written)',
      ``,
      `Confirm or reschedule it in the admin dashboard.`,
    ].join('\n'),
    html: wrap({
      eyebrow: 'New request',
      title: `${booking.name} wants a ${kind}`,
      preheader: `${when(booking)} — confirm or reschedule in the dashboard.`,
      body:
        details([
          row('When', when(booking)),
          row('Name', booking.name),
          row('Email', booking.email),
          row('Notes', booking.note || '—'),
        ]) +
        button('https://nategaffney.store/admin/', 'Open the dashboard') +
        muted('Nothing is confirmed until you accept it.'),
    }),
  })

  // to the person booking
  send({
    to: booking.email,
    subject: 'Got your booking request',
    text: [
      `Hi ${booking.name},`,
      ``,
      `Thanks — I've got your request for ${when(booking)}.`,
      ``,
      `Nothing is locked in yet. I'll email you shortly to confirm the time`,
      `and sort out payment.`,
      ``,
      `— Nate`,
    ].join('\n'),
    html: wrap({
      eyebrow: 'Request received',
      title: 'Got it — I’ll be in touch',
      preheader: `Your request for ${when(booking)} came through.`,
      body:
        paragraph(`Hi ${booking.name},`) +
        paragraph(`Thanks — your request came through for:`) +
        details([row('When', when(booking))]) +
        paragraph(
          `Nothing is locked in yet. I’ll email shortly to confirm the time and sort out payment.`,
        ) +
        muted('— Nate'),
    }),
  })
}

export function notifyBookingConfirmed(booking) {
  const owes = booking.payUrl && !booking.paid

  /**
   * The Meet link is the door to the session, so it travels only once
   * the session is paid for — notifyBookingPaymentReceived delivers it.
   * A free booking (no price set) gets its link right here as always.
   */
  const callLines = owes
    ? [`Once your payment is in, I'll send over the call link.`, ``]
    : booking.meetUrl
      ? [`Join here at that time:`, booking.meetUrl, ``]
      : [`I'll send the call link before we start.`, ``]

  const payLines = owes
    ? [`Lock in your spot — pay for the session here:`, booking.payUrl, ``]
    : []

  send({
    to: booking.email,
    subject: `Confirmed — ${when(booking)}`,
    text: [
      `Hi ${booking.name},`,
      ``,
      `You're booked in for ${when(booking)}.`,
      ``,
      ...payLines,
      ...callLines,
      owes || booking.paid
        ? `Cancel a day or more ahead for a full refund. With less notice, half the fee is kept.`
        : `Reschedule or cancel free up to 24 hours before.`,
      ``,
      `— Nate`,
    ].join('\n'),
    html: wrap({
      eyebrow: 'Confirmed',
      title: 'You’re booked in',
      preheader: `${when(booking)}${booking.meetUrl && !owes ? ' — call link inside.' : ''}`,
      body:
        paragraph(`Hi ${booking.name},`) +
        details([row('When', when(booking))]) +
        (owes
          ? button(
              booking.payUrl,
              `Pay ${booking.priceCents ? `$${(booking.priceCents / 100).toFixed(0)}` : 'now'} & lock it in`,
            )
          : '') +
        (owes
          ? paragraph('Once your payment is in, I’ll send over the call link.')
          : booking.meetUrl
            ? button(booking.meetUrl, 'Join the call')
            : paragraph('I’ll send the call link before we start.')) +
        muted(
          booking.paid || booking.payUrl
            ? 'Cancel a day or more ahead for a full refund. With less notice, half the fee is kept. — Nate'
            : 'Reschedule or cancel free up to 24 hours before. — Nate',
        ),
    }),
  })
}

export function notifyBookingRescheduled(booking, previous) {
  // Same gate as the confirmation: no Meet link while payment is owed.
  const hasLink = booking.meetUrl && !(booking.payUrl && !booking.paid)
  send({
    to: booking.email,
    subject: `Moved — now ${when(booking)}`,
    text: [
      `Hi ${booking.name},`,
      ``,
      `Your session has moved from ${previous} to ${when(booking)}.`,
      ``,
      ...(hasLink ? [`Same link as before:`, booking.meetUrl, ``] : []),
      `If that doesn't work, just reply and we'll find another time.`,
      ``,
      `— Nate`,
    ].join('\n'),
    html: wrap({
      eyebrow: 'Rescheduled',
      title: 'Your session has moved',
      preheader: `Now ${when(booking)}.`,
      body:
        paragraph(`Hi ${booking.name},`) +
        details([row('Was', previous), row('Now', when(booking))]) +
        (hasLink ? button(booking.meetUrl, 'Join the call') : '') +
        muted('If that doesn’t work, just reply and we’ll find another time. — Nate'),
    }),
  })
}

/** To the customer — their payment landed, so the call link (held back
 *  from the confirmation email) travels now. */
export function notifyBookingPaymentReceived(booking) {
  const amount = booking.paidAmount
    ? `$${(booking.paidAmount / 100).toFixed(2)}`
    : null
  send({
    to: booking.email,
    subject: `Payment received — you're locked in for ${when(booking)}`,
    text: [
      `Hi ${booking.name},`,
      ``,
      `${amount ? `Your ${amount} payment` : 'Your payment'} came through — you're locked in for ${when(booking)}.`,
      ``,
      ...(booking.meetUrl
        ? [`Join here at that time:`, booking.meetUrl, ``]
        : [`I'll send the call link before we start.`, ``]),
      `Cancel a day or more ahead for a full refund. With less notice, half the fee is kept.`,
      ``,
      `— Nate`,
    ].join('\n'),
    html: wrap({
      eyebrow: 'Paid',
      title: 'You’re locked in',
      preheader: `${when(booking)}${booking.meetUrl ? ' — call link inside.' : ''}`,
      body:
        paragraph(`Hi ${booking.name},`) +
        paragraph(
          `${amount ? `Your ${amount} payment` : 'Your payment'} came through.`,
        ) +
        details([row('When', when(booking))]) +
        (booking.meetUrl
          ? button(booking.meetUrl, 'Join the call')
          : paragraph('I’ll send the call link before we start.')) +
        muted(
          'Cancel a day or more ahead for a full refund. With less notice, half the fee is kept. — Nate',
        ),
    }),
  })
}

export function notifyBookingCancelled(booking) {
  send({
    to: booking.email,
    subject: 'Session cancelled',
    text: [
      `Hi ${booking.name},`,
      ``,
      `Your session on ${when(booking)} has been cancelled.`,
      ``,
      `If this was a mistake or you'd like another time, just reply.`,
      ``,
      `— Nate`,
    ].join('\n'),
    html: wrap({
      eyebrow: 'Cancelled',
      title: 'Your session is cancelled',
      preheader: `${when(booking)} has been cancelled.`,
      body:
        paragraph(`Hi ${booking.name},`) +
        details([row('Was', when(booking))]) +
        paragraph('If this was a mistake, or you’d like another time, just reply.') +
        muted('— Nate'),
    }),
  })
}

/**
 * To support — somebody has asked for their money back.
 *
 * Goes to the support mailbox, not ADMIN_NOTIFY_EMAIL, because that is
 * where refund requests have always landed and this must not quietly move
 * them somewhere else. The dashboard is the place to work through them;
 * this is the nudge that says there is something to work through.
 *
 * The matched purchase is included when there is one, and named as a guess
 * when it is a guess — reading "Content Audit, $250" and acting on it,
 * only to find the request was about a different order, is exactly the
 * mistake this line exists to prevent.
 */
export function notifyRefundRequest({
  email,
  name,
  categoryLabel,
  message,
  reference,
  orderTitle,
  orderAmount,
  orderCurrency,
  orderCount,
  matchedByReference,
}) {
  const who = name ? `${name} (${email})` : email
  const match = orderTitle
    ? `${orderTitle}, ${money(orderAmount, orderCurrency)}${
        matchedByReference
          ? ''
          : orderCount > 1
            ? ` (their most recent of ${orderCount} purchases, so check it is the right one)`
            : ''
      }`
    : 'No matching order found for that address'

  send({
    to: SUPPORT,
    subject: `Refund request: ${categoryLabel} (${email})`,
    text: [
      `${who} has asked for a refund.`,
      ``,
      `Reason     ${categoryLabel}`,
      `Purchase   ${match}`,
      ...(reference ? [`Reference  ${reference}`] : []),
      ``,
      ...(message ? [`What they said:`, message, ``] : []),
      `It is in the Payments tab of the dashboard, where you can refund it`,
      `and mark it done.`,
    ].join('\n'),
    html: wrap({
      eyebrow: 'Refund request',
      title: categoryLabel,
      preheader: `${who}: ${categoryLabel}`,
      body:
        paragraph(`${who} has asked for a refund.`) +
        details([
          row('Reason', categoryLabel),
          row('Purchase', match),
          ...(reference ? [row('Reference', reference)] : []),
          ...(message ? [row('What they said', message)] : []),
        ]) +
        muted(
          'It is waiting in the Payments tab of the dashboard, where you can refund it and mark it done.',
        ),
    }),
  })
}

/**
 * To the customer — their request landed.
 *
 * Sent because the alternative is silence: somebody who has just asked for
 * money back and hears nothing assumes the form ate it, and writes again,
 * or writes somewhere louder. It promises a reply from a person, and
 * promises nothing about the outcome, which is not this email's to decide.
 */
export function acknowledgeRefundRequest({ to, name, categoryLabel }) {
  send({
    to,
    subject: 'We have your refund request',
    text: [
      `Hi${name ? ` ${name}` : ''},`,
      ``,
      `Your refund request has reached us, logged as "${categoryLabel}".`,
      ``,
      `A real person reads every one of these, and you'll get a reply.`,
      `If anything else is relevant, just reply to this email and it will`,
      `land on the same request.`,
      ``,
      `Nate`,
    ].join('\n'),
    html: wrap({
      eyebrow: 'Refund request',
      title: 'We have your request',
      preheader: `Logged as "${categoryLabel}". A person will reply.`,
      body:
        paragraph(`Hi${name ? ` ${name}` : ''},`) +
        paragraph(`Your refund request has reached us, logged as “${categoryLabel}”.`) +
        paragraph(
          'A real person reads every one of these, and you’ll get a reply. If anything else is relevant, reply to this email and it will land on the same request.',
        ) +
        muted('Nate'),
    }),
  })
}
