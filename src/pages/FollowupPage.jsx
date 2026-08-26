import BookingCalendar from '../components/BookingCalendar.jsx'
import Footer from '../components/Footer.jsx'
import { ArrowRight } from '../components/Icons.jsx'
import { profile, followup } from '../content.js'

/**
 * The follow-up call page at /followup/ — a direct link Nate hands to
 * people he has already coached, never linked from the landing page.
 * Same shape as /coaching/: no profile rail, calendar first. The copy
 * comes from `followup` in content.js; the calendar mechanics and the
 * request→confirm→pay flow are shared with the main booking.
 */
export default function FollowupPage() {
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
            <BookingCalendar type="followup" copy={followup} />
          </main>

          <Footer />
        </div>
      </div>
    </>
  )
}
