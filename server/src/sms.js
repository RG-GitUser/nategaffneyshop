import { config } from './config.js'

/**
 * Twilio SMS, via the plain REST API — same reasoning as google.js: the
 * official SDK is a large dependency for what is exactly one endpoint.
 *
 * Configured with TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM.
 * When any of them is missing, smsConfigured() is false and the chat
 * simply doesn't offer phone sign-in.
 */

export const smsConfigured = () =>
  Boolean(config.sms.accountSid && config.sms.authToken && config.sms.from)

export async function sendSms(to, body) {
  if (!smsConfigured()) throw new Error('SMS is not configured')

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${config.sms.accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization:
          'Basic ' +
          Buffer.from(`${config.sms.accountSid}:${config.sms.authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: config.sms.from, Body: body }),
    },
  )

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.message || `SMS failed (${res.status})`)
  }
}
