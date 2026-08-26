import ProfileRail from './components/ProfileRail.jsx'
import OfferCard from './components/OfferCard.jsx'
import Footer from './components/Footer.jsx'
import StickyBar from './components/StickyBar.jsx'
import Services from './components/Services.jsx'
import AboutMe from './components/AboutMe.jsx'
import CoachingCard from './components/CoachingCard.jsx'
import CustomSection from './components/CustomSection.jsx'
import { offers, sections, custom, archived } from './content.js'

function Offers() {
  if (offers.length === 0) return null
  return (
    <section className="section">
      <div className="offers">
        {offers.map((offer, i) => (
          <OfferCard key={offer.title} offer={offer} index={i} />
        ))}
      </div>
    </section>
  )
}

/** Every section the admin can reorder. Footer always stays last.
 *
 *  Only what the page actually shows is registered. Retired ids in
 *  stored dashboard data (featuredVideo, newsletter, testimonials,
 *  faqs, booking, about) are ignored as unknown — the calendar lives on
 *  /coaching/ (reached from the coaching card) and the story on /about/
 *  (reached from the About Me card). New sections are built from the
 *  dashboard's "Add container". */
const SECTIONS = {
  offers: Offers,
  services: Services,
  coachingCard: CoachingCard,
  aboutMe: AboutMe,
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
  // NOTE: '#book' links on cards only jump somewhere while the coaching
  // calendar section is on the landing page. While it's archived they do
  // nothing — deliberately. The /coaching/ page is a private, link-only
  // URL, so nothing public may route people to it.
  return (
    <>
      <div className="page">
        <div className="shell">
          <ProfileRail />

          <main className="stack">
            {sectionOrder().map((id) => {
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
