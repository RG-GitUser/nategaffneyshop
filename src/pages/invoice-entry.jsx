import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import InvoicePage from './InvoicePage.jsx'
import '../styles/global.css'
import '../styles/components.css'
import '../styles/invoice.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <InvoicePage />
  </StrictMode>,
)

// No pageView() here on purpose. This is a private transactional page
// reached from one person's receipt email, not site traffic worth
// counting alongside the shop and the coaching page.
