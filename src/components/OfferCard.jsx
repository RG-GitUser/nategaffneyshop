import { ArrowRight, Star } from './Icons.jsx'

export default function OfferCard({ offer, index = 0 }) {
  const isProduct = offer.kind === 'product'
  const number = String(index + 1).padStart(2, '0')

  return (
    <a
      className={`offer offer--${offer.accent || 'navy'} rise`}
      href={offer.href}
      style={{ animationDelay: `${120 + index * 60}ms` }}
    >
      <span className="offer__index" aria-hidden="true">
        {number}
      </span>

      <div className="offer__body">
        <div className="offer__top">
          <h3 className="offer__title">{offer.title}</h3>
          {offer.tag && <span className="offer__tag">{offer.tag}</span>}
        </div>

        <p className="offer__desc">{offer.description}</p>

        <div className="offer__foot">
          {isProduct ? (
            <div className="price price--sm">
              <span className="price__now">{offer.price}</span>
              {offer.oldPrice && <span className="price__was">{offer.oldPrice}</span>}
            </div>
          ) : (
            <span />
          )}

          {offer.rating && (
            <span className="offer__rating">
              <Star width={13} height={13} />
              {offer.rating}
            </span>
          )}

          <span className="offer__cta">
            {offer.cta}
            <ArrowRight width={15} height={15} />
          </span>
        </div>
      </div>
    </a>
  )
}
