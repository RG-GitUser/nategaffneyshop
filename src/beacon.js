/**
 * First-party page-view beacon. Fires once per page load, marks the first
 * load of a browser session as a "visit" so uniques can be estimated
 * without storing anything about the person: no cookies, no IP kept, no
 * device ids, no third party. This is what the privacy policy describes.
 *
 * fetch + keepalive rather than sendBeacon: sendBeacon can't carry an
 * application/json body cross-origin (it can't answer a CORS preflight),
 * and in production the API lives on a different subdomain.
 */
const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

export function pageView() {
  try {
    if (location.pathname.startsWith('/admin')) return

    let visit = false
    try {
      if (!sessionStorage.getItem('ng-v')) {
        sessionStorage.setItem('ng-v', '1')
        visit = true
      }
    } catch {
      // storage blocked — count the view, skip the visit flag
    }

    fetch(`${API}/api/metrics/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: location.pathname, visit }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    // never let counting break the page
  }
}
