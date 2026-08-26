import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AuditPage from './AuditPage.jsx'
import { loadContent } from '../liveContent.js'
import { pageView } from '../beacon.js'
import '../styles/global.css'
import '../styles/components.css'
import '../styles/coaching.css'

function render() {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <AuditPage />
    </StrictMode>,
  )
}

// The audit copy is the dashboard-owned services list; loadContent merges
// it over the bundled default before first paint. Like the other pages, a
// slow or dead API never blocks the render.
loadContent().finally(render)
pageView()
