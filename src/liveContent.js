import * as defaults from './content.js'

/**
 * Pulls admin-edited content from the API and merges it over the bundled
 * defaults in content.js before the app renders.
 *
 * The merge mutates the exported objects in place rather than replacing
 * them. That matters: every component does `import { profile } from
 * '../content.js'`, which is a live binding to the same object — mutating
 * its properties updates every component with no refactor, whereas
 * reassigning the export would not be visible to them.
 *
 * If the API is unreachable the site simply renders the bundled defaults,
 * so a backend outage can never take the public page down.
 */

const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

/** Objects get their keys overwritten; arrays get replaced element-wise. */
function mergeInPlace(target, source) {
  if (!target || !source) return
  if (Array.isArray(target) && Array.isArray(source)) {
    target.length = 0
    target.push(...source)
    return
  }
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue
    target[key] = value
  }
}

async function fetchJson(path) {
  const res = await fetch(`${BASE}/api${path}`, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`${path} responded ${res.status}`)
  return res.json()
}

export async function loadContent() {
  try {
    const [content, shop, services] = await Promise.all([
      fetchJson('/content').catch(() => null),
      fetchJson('/shop').catch(() => null),
      fetchJson('/services').catch(() => null),
    ])

    if (content) {
      /**
       * Scheduling config is code-owned. The admin Content tab edits the
       * booking COPY (title, description, fine print) but has no editor
       * for slots or availability — yet old saves baked those fields into
       * the stored document, where they would forever override any change
       * made in content.js. Dropping them here keeps the bundled values
       * authoritative while the admin-editable text still merges.
       */
      if (content.booking && typeof content.booking === 'object') {
        for (const k of [
          'slots',
          'availableDays',
          'leadTimeDays',
          'horizonDays',
          'blackouts',
          'timezoneName',
        ]) {
          delete content.booking[k]
        }
      }
      for (const [key, value] of Object.entries(content)) {
        // Only keys with a matching object default can merge — anything
        // else (unknown or retired sections) is ignored.
        if (defaults[key] && typeof defaults[key] === 'object') {
          mergeInPlace(defaults[key], value)
        }
      }
    }

    // A working API is the source of truth for the shop — even when it's
    // empty. The bundled demo cards in content.js only ever show when the
    // API is unreachable (dev without the server, or an outage), never as
    // filler on the live site. An empty list simply hides the section.
    if (Array.isArray(shop)) {
      mergeInPlace(defaults.offers, shop)
    }

    // Same deal for service cards — the Services tab is the source of truth.
    if (Array.isArray(services)) {
      mergeInPlace(defaults.services, services)
    }
  } catch (err) {
    console.warn('[content] falling back to bundled defaults:', err.message)
  }
}
