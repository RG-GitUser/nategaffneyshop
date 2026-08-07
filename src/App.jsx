import { useEffect } from 'react'
import ThemeToggle from './components/ThemeToggle.jsx'
import ProfileRail from './components/ProfileRail.jsx'
import FeaturedVideo from './components/FeaturedVideo.jsx'
import OfferCard from './components/OfferCard.jsx'
import BookingCalendar from './components/BookingCalendar.jsx'
import Newsletter from './components/Newsletter.jsx'
import About from './components/About.jsx'
import Testimonials from './components/Testimonials.jsx'
import Faq from './components/Faq.jsx'
import Footer from './components/Footer.jsx'
import StickyBar from './components/StickyBar.jsx'
import Services from './components/Services.jsx'
import CustomSection from './components/CustomSection.jsx'
import { offers, sections, custom, archived } from './content.js'

function Offers() {
  if (offers.length === 0) return null
  return (
    <section className="section">
      <div className="section__head">
        <span className="eyebrow">The catalog</span>
        <h2 className="section__title">Products</h2>
      </div>

      <div className="offers">
        {offers.map((offer, i) => (
          <OfferCard key={offer.title} offer={offer} index={i} />
        ))}
      </div>
    </section>
  )
}

/** Every section the admin can reorder. Footer always stays last. */
const SECTIONS = {
  featuredVideo: FeaturedVideo,
  offers: Offers,
  services: Services,
  booking: BookingCalendar,
  about: About,
  newsletter: Newsletter,
  testimonials: Testimonials,
  faqs: Faq,
}

/** Stored order, unknown ids dropped, missing sections appended at the end.
 *  Custom containers built in the dashboard count as known sections, and
 *  archived sections stay off the page entirely. */
function sectionOrder() {
  const customIds = custom.map((c) => c.id)
  const known = sections.filter(
    (id) => (SECTIONS[id] || customIds.includes(id)) && !archived.includes(id),
  )
  const missing = [...Object.keys(SECTIONS), ...customIds].filter(
    (id) => !known.includes(id) && !archived.includes(id),
  )
  return [...known, ...missing]
}

export default function App() {
  const order = sectionOrder()

  // Product and service cards link to '#book'. While the coaching calendar
  // is off the landing page (archived — it lives at /coaching/), that
  // anchor points at nothing, so send those clicks to the coaching page
  // instead of silently doing nothing. Once the section is restored the
  // same links jump to it right here again.
  const hasBooking = order.includes('booking')
  useEffect(() => {
    if (hasBooking) return
    function onClick(e) {
      if (!e.target.closest?.('a[href="#book"]')) return
      e.preventDefault()
      window.location.assign('/coaching/')
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [hasBooking])

  return (
    <>
      <ThemeToggle />

      <div className="page">
        <div className="shell">
          <ProfileRail />

          <main className="stack">
            {order.map((id) => {
              const Section = SECTIONS[id]
              if (Section) return <Section key={id} />
              return (
                <CustomSection
                  key={id}
                  container={custom.find((c) => c.id === id)}
                />
              )
            })}
            <Footer />
          </main>
        </div>
      </div>

      <StickyBar />
    </>
  )
}
