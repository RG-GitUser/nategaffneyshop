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
 *  and HTML-only mail scores worse with spam filters. */
async function send({ to, subject, text, html }) {
  if (!transport || !to) return
  try {
    await transport.sendMail({ from: config.smtp.from, to, subject, text, html })
  } catch (err) {
    // Never let a mail failure break the request that triggered it.
    console.error('[mail] send failed:', err.message)
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

export function notifyNewBooking(booking) {
  // to Nate
  send({
    to: config.smtp.notify,
    subject: `New booking request — ${when(booking)}`,
    text: [
      `${booking.name} requested a session.`,
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
      title: `${booking.name} wants a session`,
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
  // If a call link has been set, send it now rather than promising it later.
  const callLines = booking.meetUrl
    ? [`Join here at that time:`, booking.meetUrl, ``]
    : [`I'll send the call link before we start.`, ``]

  send({
    to: booking.email,
    subject: `Confirmed — ${when(booking)}`,
    text: [
      `Hi ${booking.name},`,
      ``,
      `You're booked in for ${when(booking)}.`,
      ``,
      ...callLines,
      `Reschedule or cancel free up to 24 hours before.`,
      ``,
      `— Nate`,
    ].join('\n'),
    html: wrap({
      eyebrow: 'Confirmed',
      title: 'You’re booked in',
      preheader: `${when(booking)}${booking.meetUrl ? ' — call link inside.' : ''}`,
      body:
        paragraph(`Hi ${booking.name},`) +
        details([row('When', when(booking))]) +
        (booking.meetUrl
          ? button(booking.meetUrl, 'Join the call')
          : paragraph('I’ll send the call link before we start.')) +
        muted('Reschedule or cancel free up to 24 hours before. — Nate'),
    }),
  })
}

export function notifyBookingRescheduled(booking, previous) {
  send({
    to: booking.email,
    subject: `Moved — now ${when(booking)}`,
    text: [
      `Hi ${booking.name},`,
      ``,
      `Your session has moved from ${previous} to ${when(booking)}.`,
      ``,
      ...(booking.meetUrl ? [`Same link as before:`, booking.meetUrl, ``] : []),
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
        (booking.meetUrl ? button(booking.meetUrl, 'Join the call') : '') +
        muted('If that doesn’t work, just reply and we’ll find another time. — Nate'),
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
