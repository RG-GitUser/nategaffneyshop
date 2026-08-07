import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import CoachingPage from './CoachingPage.jsx'
import { loadContent } from '../liveContent.js'
import { booking } from '../content.js'
import { pageView } from '../beacon.js'
import '../styles/global.css'
import '../styles/components.css'
import '../styles/coaching.css'

function render() {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <CoachingPage />
    </StrictMode>,
  )
}

// Snapshot the bundled coaching copy before loadContent merges the
// admin-stored content over it (the merge mutates `booking` in place).
const bundled = booking ? { ...booking } : null

// Same deal as the landing page: merge admin-edited content first, but
// never let a slow or dead API block the page.
loadContent().finally(() => {
  // This page shows the calendar ALWAYS — it's the link Nate hands to
  // specific people. On the landing page, text cleared via the admin's
  // Delete hides the section; here a blank field falls back to the
  // bundled copy instead, so a cleared landing section can never blank
  // the coaching link too. Anything actually written in the admin wins.
  if (booking && bundled) {
    for (const [key, value] of Object.entries(bundled)) {
      if (booking[key] === '' || booking[key] == null) booking[key] = value
    }
  }
  render()
})
pageView()
