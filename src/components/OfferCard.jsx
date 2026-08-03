import { useState } from 'react'
import { ArrowRight, Star } from './Icons.jsx'

const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

export default function OfferCard({ offer, index = 0 }) {
  const isProduct = offer.kind === 'product'
  const number = String(index + 1).padStart(2, '0')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  /** Items stored with a priceCents go through Stripe Checkout. Anything
   *  else keeps its plain href, so link-out cards still work. */
  const buyable = Boolean(offer.id && offer.priceCents)

  async function startCheckout(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`${API}/api/checkout/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: offer.id }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.url) {
        setError(data?.error || 'Could not start checkout.')
        setBusy(false)
        return
      }
      // Stripe hosts the payment page; leave the site entirely.
      window.location.href = data.url
    } catch {
      setError('Could not reach the server.')
      setBusy(false)
    }
  }

  return (
    <a
      className={`offer offer--${offer.accent || 'navy'} rise`}
      href={offer.href}
      onClick={buyable ? startCheckout : undefined}
      aria-busy={busy || undefined}
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
            {busy ? 'Opening…' : offer.cta}
            <ArrowRight width={15} height={15} />
          </span>
        </div>

        {error && <p className="offer__error">{error}</p>}
      </div>
    </a>
  )
}
