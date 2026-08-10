/**
 * Render-time guard for admin-editable URLs.
 *
 * Link and image fields are free text in the dashboard and arrive via the
 * content API, so the scheme has to be checked where it's used: React
 * escapes text but passes `javascript:` hrefs through untouched, and one
 * stored in the database would run for every visitor who clicked it.
 *
 * Allowed: http(s), mailto, tel, and site-relative (/, #, ./, ../, or a
 * bare path). Everything else with an explicit scheme — javascript:,
 * data:, vbscript:, anything unknown — falls back.
 */

const EXPLICIT_SCHEME = /^[a-z][a-z0-9+.-]*:/i

export function safeHref(raw, fallback = '#') {
  const url = String(raw ?? '').trim()
  if (!url) return fallback
  if (/^(https?|mailto|tel):/i.test(url)) return url
  if (EXPLICIT_SCHEME.test(url)) return fallback
  return url
}

/** Images are stricter: http(s) or site-relative only. */
export function safeImageSrc(raw) {
  const url = String(raw ?? '').trim()
  if (!url) return ''
  if (/^https?:/i.test(url)) return url
  if (EXPLICIT_SCHEME.test(url)) return ''
  return url
}
