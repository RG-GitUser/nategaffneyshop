import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ContainerPage from './ContainerPage.jsx'
import { loadContent } from '../liveContent.js'
import { pageView } from '../beacon.js'
import '../styles/global.css'
import '../styles/components.css'
import '../styles/coaching.css'

function render() {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <ContainerPage />
    </StrictMode>,
  )
}

// The containers live in the dashboard-managed content, so the load has
// to finish before the page knows what to render. Like the other pages,
// a slow or dead API never blocks the render — it just falls back to the
// bundled defaults (which have no custom containers, so the page shows
// its friendly empty state).
loadContent().finally(render)
pageView()
