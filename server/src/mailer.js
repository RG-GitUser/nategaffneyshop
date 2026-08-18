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

const transport = enabled
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      // 465 is implicit TLS; 587 upgrades via STARTTLS.
      secure: config.smtp.port === 465,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
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
    await transport.sendMail({ from: config.smtp.from, to, subject, text, html })
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
    ].join('\n'),
    html: wrap({
      eyebrow: 'Your download',
      title,
      preheader: 'Your PDF is ready.',
      body:
        paragraph('Thanks for the purchase! Your PDF is ready:') +
        button(url, 'Download the PDF') +
        muted(
          'The link works for 7 days. If it expires, reply to this email and we’ll send a fresh one.',
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
          `<strong>${email}</strong> paid for “${title}”, but the download email could not be sent. They are owed the file.`,
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
  // "session" vs the short paid check-in booked through /followup/.
  const kind = booking.type === 'followup' ? 'follow-up call' : 'session'
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
