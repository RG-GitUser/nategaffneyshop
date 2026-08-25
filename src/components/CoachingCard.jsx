import OfferCard from './OfferCard.jsx'
import { booking } from '../content.js'

/**
 * The coaching offer as a catalog container, identical in shape to the
 * workbook card: title, one-line blurb, price, full-width button. The
 * button opens the booking page at /coaching/, where the calendar lives.
 */
export default function CoachingCard() {
  if (!booking) return null

  return (
    <section className="section">
      <div className="offers">
        <OfferCard
          offer={{
            title: booking.title,
            blurb: 'Forty-five minutes on whatever is actually in your way.',
            kind: 'product',
            price: `${booking.price} / ${booking.duration}`,
            cta: 'Book a session',
            href: '/coaching/',
          }}
          index={2}
        />
      </div>
    </section>
  )
}
