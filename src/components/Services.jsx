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

  // One section per card — on the desktop grid each section is a tile,
  // and a section holding several stacked cards would blow out its row
  // (see Offers in App.jsx).
  return services.map((s, i) => {
    const offer = {
      ...s,
      kind: s.price || s.priceCents ? 'product' : 'link',
      checkoutType: 'service',
    }
    /* The Content Audit card is a doorway, not a checkout: it goes
       to /audit/, where the full description and the booking live.
       Overrides the stored '#book' href — that points at the
       archived landing-page calendar and goes nowhere — and drops
       the id so a charge amount can't turn the card itself into a
       Stripe trigger. */
    if (/audit/i.test(s.title || '')) {
      offer.href = '/audit/'
      offer.id = null
    }
    return (
      <section className="section" id={i === 0 ? 'services' : undefined} key={s.id || s.title}>
        <div className="offers">
          <OfferCard offer={offer} index={i} />
        </div>
      </section>
    )
  })
}
