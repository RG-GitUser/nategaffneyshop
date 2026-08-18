import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import FollowupPage from './FollowupPage.jsx'
import { loadContent } from '../liveContent.js'
import { pageView } from '../beacon.js'
import '../styles/global.css'
import '../styles/components.css'
import '../styles/coaching.css'

function render() {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <FollowupPage />
    </StrictMode>,
  )
}

// The follow-up COPY is bundled (content.js `followup`) and has no admin
// editor, so there's no merge to guard here — loadContent only fills in
// the shared calendar mechanics and site-wide content. Like the other
// pages, a slow or dead API never blocks the render.
loadContent().finally(render)
pageView()
