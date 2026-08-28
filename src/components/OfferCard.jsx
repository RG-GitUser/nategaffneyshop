import { useState } from 'react'
import { Star } from './Icons.jsx'
import CheckoutModal, { checkoutMode } from './CheckoutModal.jsx'
import { safeHref, safeImageSrc } from '../safeUrl.js'

const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

/**
 * Deliberately terse: title, price, button. Descriptions still live in
 * the data (content.js and the dashboard) — the card just doesn't render
 * them, so restoring the fuller card is a markup change, not a data one.
 */
export default function OfferCard({ offer, index = 0 }) {
  const isProduct = offer.kind === 'product' || offer.kind === 'pdf'
  /** A file can't be handed back, so it's sold final-sale — said on the
   *  card as well as at checkout, before anyone has spent anything. */
  const isDownload = offer.kind === 'pdf'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [paying, setPaying] = useState(false)

  /** Items stored with a priceCents go through Stripe Checkout. Anything
   *  else keeps its plain href, so link-out cards still work. */
  const buyable = Boolean(offer.id && offer.priceCents)
  const image = safeImageSrc(offer.image)

  async function startCheckout(e) {
    e.preventDefault()
    if (busy || paying) return
    setBusy(true)
    setError('')

    // Embedded when the server has a publishable key: the payment form
    // opens in a modal right here. Otherwise fall back to redirecting to
    // Stripe's hosted page, so payments work either way.
    const cfg = await checkoutMode()
    if (cfg?.embedded) {
      setBusy(false)
      setPaying(true)
      return
    }

    try {
      const res = await fetch(`${API}/api/checkout/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: offer.id,
          itemType: offer.checkoutType || 'shop',
        }),
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
      href={safeHref(offer.href)}
      onClick={buyable ? startCheckout : undefined}
      aria-busy={busy || undefined}
      style={{ animationDelay: `${120 + index * 60}ms` }}
    >
      {image && (
        <div className="offer__media">
          <img src={image} alt="" loading="lazy" />
        </div>
      )}

      <div className="offer__body">
        <h3 className="offer__title">{offer.title}</h3>

        {/* One small line under the title. Dashboard-managed cards may
            only have the fuller description — the clamp in CSS keeps
            even that to blurb length. */}
        {(offer.blurb || offer.description) && (
          <p className="offer__blurb">{offer.blurb || offer.description}</p>
        )}

        {isProduct && (
          <div className="price price--sm">
            <span className="price__now">{offer.price}</span>
            {offer.oldPrice && <span className="price__was">{offer.oldPrice}</span>}
          </div>
        )}

        {/* Takes the price's slot on a card that hasn't got one, so all
            four containers keep the same title / blurb / accent line /
            button rhythm. Carries the price colour deliberately. */}
        {!isProduct && offer.meta && <p className="offer__meta">{offer.meta}</p>}

        {offer.rating && (
          <span className="offer__rating">
            <Star width={13} height={13} />
            {offer.rating}
          </span>
        )}

        {/* Styled as the button, but stays a span: the whole card is the
            link (or the checkout trigger), and a real <button> nested in
            an <a> is invalid markup with two competing click targets. */}
        <span className="offer__cta">{busy ? 'Opening…' : offer.cta}</span>

        {/* No final-sale line on the card itself — the checkout modal
            makes the buyer acknowledge it before paying, and the terms
            spell it out. The card stays title / blurb / price / button
            like the other three. */}

        {error && <p className="offer__error">{error}</p>}
      </div>

      {paying && (
        <CheckoutModal
          itemId={offer.id}
          itemType={offer.checkoutType || 'shop'}
          title={offer.title}
          image={image}
          digital={isDownload}
          doneNote={
            offer.kind === 'pdf'
              ? 'Payment received. Your download link and receipt are on their way to your email.'
              : 'Payment received. Your receipt is on its way to your email.'
          }
          onClose={() => setPaying(false)}
        />
      )}
    </a>
  )
}
