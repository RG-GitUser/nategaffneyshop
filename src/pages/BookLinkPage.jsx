import { useEffect, useState } from 'react'
import BookingCalendar from '../components/BookingCalendar.jsx'
import Footer from '../components/Footer.jsx'
import { ArrowRight } from '../components/Icons.jsx'
import { profile } from '../content.js'

const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

/**
 * A custom booking link's page at /book/?k=<slug> — minted in the admin
 * Calendar tab and handed out person to person, never linked from the
 * site. Same shape as /coaching/ and /followup/: no profile rail, the
 * calendar is the page. Title, copy, price and length all come from the
 * link itself, so one static page serves every link.
 */
export default function BookLinkPage() {
  const slug = new URLSearchParams(window.location.search).get('k') || ''
  // undefined = still loading, null = no such link
  const [link, setLink] = useState(undefined)

  useEffect(() => {
    if (!slug) {
      setLink(null)
      return
    }
    fetch(`${API}/api/bookings/links/${encodeURIComponent(slug)}`, {
      headers: { Accept: 'application/json' },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(setLink)
      .catch(() => setLink(null))
  }, [slug])

  useEffect(() => {
    if (link?.title) document.title = `${link.title} | ${profile.name}`
  }, [link])

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
            {link === undefined ? null : link ? (
              <BookingCalendar
                link={link}
                copy={{
                  eyebrow: 'Book a session',
                  title: link.title,
                  description: link.description,
                  duration: `${link.durationMinutes} min`,
                  price: link.priceCents
                    ? `$${(link.priceCents / 100).toFixed(0)}`
                    : '',
                }}
              />
            ) : (
              <section className="section rise">
                <div className="section__head">
                  <h2 className="section__title">Nothing here</h2>
                </div>
                <p>
                  This booking link is no longer available. Head back to the
                  main page to see what is live.
                </p>
              </section>
            )}
          </main>

          <Footer />
        </div>
      </div>
    </>
  )
}
