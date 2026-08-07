import OfferCard from './OfferCard.jsx'
import { services } from '../content.js'

/**
 * Service cards, managed from the admin Services tab. Rendered with the
 * same card component as the catalog; a card with a price shows it, one
 * without just links out. Empty list hides the whole section.
 */
export default function Services() {
  if (!services.length) return null

  return (
    <section className="section" id="services">
      <div className="section__head">
        <span className="eyebrow">Services</span>
        <h2 className="section__title">Ways we can work together</h2>
      </div>

      <div className="offers">
        {services.map((s, i) => (
          <OfferCard
            key={s.id || s.title}
            offer={{ ...s, kind: s.price ? 'product' : 'link' }}
            index={i}
          />
        ))}
      </div>
    </section>
  )
}
