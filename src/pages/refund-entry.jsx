import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import RefundPage from './RefundPage.jsx'
import '../styles/global.css'
import '../styles/components.css'
import '../styles/refund.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RefundPage />
  </StrictMode>,
)

// No loadContent() and no pageView(). The page carries no admin-editable
// copy, and somebody asking for their money back is not site traffic worth
// counting alongside the shop — nor a person who should wait on an API
// call before the form appears.
