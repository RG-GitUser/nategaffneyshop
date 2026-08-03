import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { loadContent } from './liveContent.js'
import './styles/global.css'
import './styles/components.css'

function render() {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

// Merge admin-edited content first, but never let a slow or dead API block
// the page — loadContent already swallows its own errors, and `finally`
// guarantees we render either way.
loadContent().finally(render)
