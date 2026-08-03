import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import LegalPage from './LegalPage.jsx'
import { terms } from '../legal/terms.js'
import '../styles/global.css'
import '../styles/components.css'
import '../styles/legal.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LegalPage doc={terms} />
  </StrictMode>,
)
