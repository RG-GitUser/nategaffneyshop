import BookingCalendar from '../components/BookingCalendar.jsx'
import Footer from '../components/Footer.jsx'
import { ArrowRight } from '../components/Icons.jsx'
import { profile } from '../content.js'

/**
 * The coaching calendar on its own page at /coaching/, shared as a direct
 * link. It always renders the booking section, whether or not that section
 * is also on the landing page — archiving "Coaching / calendar" in the
 * admin Content tab only affects the landing page, never this one.
 *
 * Deliberately spare: no profile rail, so the calendar is the first thing
 * a visitor sees. The section's own eyebrow/title/description (edited in
 * the admin Content tab) act as the page heading.
 */
export default function CoachingPage() {
  return (
    <>
      <div className="page">
        <div className="shell">
          <header className="coaching-head rise">
            <a className="coaching-back" href="/">
              <ArrowRight
                width={16}
                height={16}
                style={{ transform: 'rotate(180deg)' }}
              />
              Back to {profile.name}
            </a>
          </header>

          <main className="stack">
            <BookingCalendar />
            <Footer />
          </main>
        </div>
      </div>
    </>
  )
}
