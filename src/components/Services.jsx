import OfferCard from './OfferCard.jsx'
import { services } from '../content.js'

/**
 * Service cards, managed from the admin Services tab. Rendered with the
 * same card component as the catalog. A service with a charge amount
 * opens Stripe Checkout like a shop item; one with just a display price
 * shows it and links out; one with neither is a plain link card. Empty
 * list hides the whole section.
 */
export default function Services() {
  if (!services.length) return null

  return (
    <section className="section" id="services">
      <div className="section__head">
        <span className="eyebrow">Work with me</span>
        <h2 className="section__title">Services</h2>
      </div>

      <div className="offers">
        {services.map((s, i) => (
          <OfferCard
            key={s.id || s.title}
            offer={{
              ...s,
              kind: s.price || s.priceCents ? 'product' : 'link',
              checkoutType: 'service',
            }}
            index={i}
          />
        ))}
      </div>
    </section>
  )
}
