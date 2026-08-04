/**
 * HTML email shell, in the site palette.
 *
 * Email clients are two decades behind browsers, so this deliberately
 * avoids things that work fine on the web:
 *   - tables for layout, because Outlook ignores div-based layout
 *   - inline styles only; <style> blocks get stripped by Gmail and others
 *   - no flexbox, grid, custom properties, or web fonts
 *   - hex colours written literally, since color-mix() means nothing here
 *
 * Every message also ships a plain-text part. Some people read in plain
 * text by choice, and spam filters treat HTML-only mail with suspicion.
 */

const BLACK = '#120B07'
const NAVY = '#05192B' // the site's accent — strip, eyebrow and buttons

// Derived tones, pre-computed because email can't mix colours itself.
const OUTER = '#FFFFFF' // outside the card: no colour
const INSET = '#F5F5F5' // code block background
const LINE = '#E6E6E6'
const INK_SOFT = '#6B6B6B'

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const MONO = "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace"

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** A label/value row inside the details block. */
export function row(label, value) {
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid ${LINE};font-family:${MONO};font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:${INK_SOFT};white-space:nowrap;vertical-align:top;">${esc(label)}</td>
      <td style="padding:10px 0 10px 20px;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:15px;color:${BLACK};vertical-align:top;">${esc(value)}</td>
    </tr>`
}

export function button(href, text) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 0;">
      <tr>
        <td style="background:${NAVY};border-radius:6px;">
          <a href="${esc(href)}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;">${esc(text)}</a>
        </td>
      </tr>
    </table>`
}

/**
 * @param {object}   opts
 * @param {string}   opts.title     big heading
 * @param {string}   opts.preheader one-line inbox preview, hidden in the body
 * @param {string}   opts.body      inner HTML
 * @param {string}  [opts.eyebrow]  small label above the title
 */
export function wrap({ title, preheader, body, eyebrow }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:${OUTER};">
  <!-- Inbox preview text. Hidden in the message itself, then padded with
       zero-width spaces so the client doesn't pull body copy in after it. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    ${esc(preheader)}${'&#8203;&nbsp;'.repeat(60)}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${OUTER};">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#FFFFFF;border:1px solid ${LINE};border-radius:14px;overflow:hidden;">
          <!-- Orange rule across the top, the one flash of colour -->
          <tr><td style="height:4px;background:${NAVY};font-size:0;line-height:0;">&nbsp;</td></tr>

          <tr>
            <td style="padding:36px 34px 34px;">
              ${
                eyebrow
                  ? `<p style="margin:0 0 12px;font-family:${MONO};font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${NAVY};">${esc(eyebrow)}</p>`
                  : ''
              }
              <h1 style="margin:0 0 20px;font-family:${FONT};font-size:27px;line-height:1.15;font-weight:700;letter-spacing:-0.4px;color:${BLACK};">${esc(title)}</h1>
              ${body}
            </td>
          </tr>
        </table>

        <p style="margin:20px 0 0;font-family:${MONO};font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:${INK_SOFT};">
          nategaffney.store
        </p>

      </td>
    </tr>
  </table>
</body>
</html>`
}

export function paragraph(text) {
  return `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.65;color:${BLACK};">${esc(text)}</p>`
}

export function muted(text) {
  return `<p style="margin:22px 0 0;padding-top:18px;border-top:1px solid ${LINE};font-family:${FONT};font-size:13px;line-height:1.6;color:${INK_SOFT};">${esc(text)}</p>`
}

export function details(rows) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0;border-top:1px solid ${LINE};">${rows.join('')}</table>`
}

/** Big monospace code for the chat join emails. */
export function codeBlock(code) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;">
      <tr>
        <td style="background:${INSET};border:1px solid ${LINE};border-radius:10px;padding:20px 34px;font-family:${MONO};font-size:34px;font-weight:700;letter-spacing:9px;color:${BLACK};">${esc(code)}</td>
      </tr>
    </table>`
}

export const palette = { BLACK, NAVY, OUTER, INSET, LINE, INK_SOFT, FONT, MONO }
