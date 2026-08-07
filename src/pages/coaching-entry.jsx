import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import CoachingPage from './CoachingPage.jsx'
import { loadContent } from '../liveContent.js'
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

// Same deal as the landing page: merge admin-edited content first (the
// coaching title, price, and availability are all editable), but never
// let a slow or dead API block the page.
loadContent().finally(render)
pageView()
