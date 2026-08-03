import nodemailer from 'nodemailer'
import { config } from './config.js'

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

async function send({ to, subject, text }) {
  if (!transport || !to) return
  try {
    await transport.sendMail({ from: config.smtp.from, to, subject, text })
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

export function notifyNewBooking(booking) {
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
  })

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
  })
}

export function notifyBookingConfirmed(booking) {
  send({
    to: booking.email,
    subject: `Confirmed — ${when(booking)}`,
    text: [
      `Hi ${booking.name},`,
      ``,
      `You're booked in for ${when(booking)}.`,
      ``,
      `I'll send the call link before we start. Reschedule or cancel free`,
      `up to 24 hours before.`,
      ``,
      `— Nate`,
    ].join('\n'),
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
      `If that doesn't work, just reply and we'll find another time.`,
      ``,
      `— Nate`,
    ].join('\n'),
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
  })
}
