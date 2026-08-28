import { useEffect, useState } from 'react'
import OfferCard from './OfferCard.jsx'
import { booking } from '../content.js'

const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

/**
 * The coaching offer as a catalog container, identical in shape to the
 * workbook card: title, one-line blurb, price, full-width button. The
 * button opens the booking page at /coaching/, where the calendar lives.
 *
 * The price line shows the REAL charge amount and session length from
 * the server (the same values the booking page badge uses), so the card
 * can never advertise one price while checkout charges another. The
 * bundled price/duration text only appears if the API is unreachable.
 */
export default function CoachingCard() {
  const [live, setLive] = useState(null)

  useEffect(() => {
    fetch(`${API}/api/bookings/price`, { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then(setLive)
      .catch(() => {})
  }, [])

  if (!booking) return null

  const price = live?.priceCents
    ? `$${(live.priceCents / 100).toFixed(0)} / ${
        live.durationMinutes ? `${live.durationMinutes} min` : booking.duration
      }`
    : `${booking.price} / ${booking.duration}`

  return (
    <section className="section">
      <div className="offers">
        <OfferCard
          offer={{
            title: booking.title,
            blurb: booking.blurb || booking.description,
            kind: 'product',
            price,
            cta: 'Book a session',
            href: '/coaching/',
            accent: booking.accent,
          }}
          index={2}
        />
      </div>
    </section>
  )
}
