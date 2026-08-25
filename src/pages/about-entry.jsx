import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AboutPage from './AboutPage.jsx'
import { loadContent } from '../liveContent.js'
import { pageView } from '../beacon.js'
import '../styles/global.css'
import '../styles/components.css'
import '../styles/coaching.css'

function render() {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <AboutPage />
    </StrictMode>,
  )
}

// The about copy is the shared profile from content.js; loadContent
// merges any dashboard edits to it before first paint. Like the other
// pages, a slow or dead API never blocks the render.
loadContent().finally(render)
pageView()
