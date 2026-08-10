import { useState } from 'react'
import { ArrowRight, Star } from './Icons.jsx'
import CheckoutModal, { checkoutMode } from './CheckoutModal.jsx'
import { safeHref, safeImageSrc } from '../safeUrl.js'

const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

export default function OfferCard({ offer, index = 0 }) {
  const isProduct = offer.kind === 'product' || offer.kind === 'pdf'
  /** A file can't be handed back, so it's sold final-sale — said on the
   *  card as well as at checkout, before anyone has spent anything. */
  const isDownload = offer.kind === 'pdf'
  const number = String(index + 1).padStart(2, '0')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [paying, setPaying] = useState(false)
  const [expanded, setExpanded] = useState(false)

  /** Long copy is clamped so one wordy card can't swallow the page; the
   *  cutoff is roughly what four clamped lines can hold. */
  const longDesc = (offer.description || '').length > 180

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
      className={`offer offer--${offer.accent || 'navy'} rise${expanded ? ' offer--expanded' : ''}`}
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

      <span className="offer__index" aria-hidden="true">
        {number}
      </span>

      <div className="offer__body">
        <div className="offer__top">
          <h3 className="offer__title">{offer.title}</h3>
          {offer.tag && <span className="offer__tag">{offer.tag}</span>}
        </div>

        <p className={`offer__desc${longDesc && !expanded ? ' offer__desc--clamped' : ''}`}>
          {offer.description}
        </p>

        {longDesc && (
          <button
            type="button"
            className="offer__more"
            aria-expanded={expanded}
            onClick={(e) => {
              // The whole card is a link (or a checkout trigger) — this
              // toggle must do neither.
              e.preventDefault()
              e.stopPropagation()
              setExpanded((v) => !v)
            }}
          >
            {expanded ? 'Read less' : 'Read more'}
          </button>
        )}

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

        {isDownload && buyable && (
          <p className="offer__note">Instant download · final sale, no refunds</p>
        )}

        {error && <p className="offer__error">{error}</p>}
      </div>

      {paying && (
        <CheckoutModal
          itemId={offer.id}
          itemType={offer.checkoutType || 'shop'}
          title={offer.title}
          digital={isDownload}
          doneNote={
            offer.kind === 'pdf'
              ? 'Payment received — your download link and receipt are on their way to your email.'
              : 'Payment received — your receipt is on its way to your email.'
          }
          onClose={() => setPaying(false)}
        />
      )}
    </a>
  )
}
