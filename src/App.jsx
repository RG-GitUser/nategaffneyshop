import ThemeToggle from './components/ThemeToggle.jsx'
import ProfileRail from './components/ProfileRail.jsx'
import FeaturedCard from './components/FeaturedCard.jsx'
import FeaturedVideo from './components/FeaturedVideo.jsx'
import OfferCard from './components/OfferCard.jsx'
import BookingCalendar from './components/BookingCalendar.jsx'
import Newsletter from './components/Newsletter.jsx'
import About from './components/About.jsx'
import Testimonials from './components/Testimonials.jsx'
import Faq from './components/Faq.jsx'
import Footer from './components/Footer.jsx'
import StickyBar from './components/StickyBar.jsx'
import { offers } from './content.js'

export default function App() {
  return (
    <>
      <ThemeToggle />

      <div className="page">
        <div className="shell">
          <ProfileRail />

          <main className="stack">
            <FeaturedVideo />
            <FeaturedCard />

            <section className="section">
              <div className="section__head">
                <span className="eyebrow">The catalog</span>
                <h2 className="section__title">Where to start</h2>
              </div>

              <div className="offers">
                {offers.map((offer, i) => (
                  <OfferCard key={offer.title} offer={offer} index={i} />
                ))}
              </div>
            </section>

            <BookingCalendar />
            <About />
            <Newsletter />
            <Testimonials />
            <Faq />
            <Footer />
          </main>
        </div>
      </div>

      <StickyBar />
    </>
  )
}
