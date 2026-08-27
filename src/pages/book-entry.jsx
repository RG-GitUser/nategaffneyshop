import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import BookLinkPage from './BookLinkPage.jsx'
import { loadContent } from '../liveContent.js'
import { pageView } from '../beacon.js'
import '../styles/global.css'
import '../styles/components.css'
import '../styles/coaching.css'

function render() {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <BookLinkPage />
    </StrictMode>,
  )
}

// The calendar mechanics (slots, days, timezone) come from the shared
// booking config; loadContent merges dashboard edits to it before first
// paint. Like the other pages, a slow or dead API never blocks the render.
loadContent().finally(render)
pageView()
