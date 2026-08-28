import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import RichText from '../richtext.jsx'

const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

/** One address for refunds, problems and questions. */
const SUPPORT = 'support@nategaffney.store'

/**
 * In-page Stripe checkout.
 *
 * Stripe.js is loaded from js.stripe.com on first use — Stripe requires
 * their script comes from them (it's PCI-scoped code), so it can't be
 * bundled. The publishable key and Connect account arrive from
 * /api/checkout/config, so rotating them is an .env edit on the server,
 * not a frontend rebuild.
 *
 * Payment completion stays in-app too: the session is created with
 * redirect_on_completion 'never', so success fires the onComplete
 * callback here instead of navigating away. The webhook records the
 * order server-side either way.
 */

let scriptPromise = null
function loadStripeJs() {
  if (window.Stripe) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://js.stripe.com/v3/'
    s.async = true
    s.onload = resolve
    s.onerror = () => {
      scriptPromise = null // allow a retry on the next open
      reject(new Error('Could not load the payment form. Check your connection.'))
    }
    document.head.appendChild(s)
  })
  return scriptPromise
}

let configPromise = null
function getCheckoutConfig() {
  if (configPromise) return configPromise
  configPromise = fetch(`${API}/api/checkout/config`).then((r) => {
    if (!r.ok) throw new Error('Payments are not available right now.')
    return r.json()
  })
  configPromise.catch(() => {
    configPromise = null
  })
  return configPromise
}

/** Resolved config, or null — lets OfferCard decide redirect vs modal. */
export async function checkoutMode() {
  try {
    return await getCheckoutConfig()
  } catch {
    return null
  }
}

/**
 * Pass either `itemId` (a purchase — the session is created here; set
 * `itemType` to 'service' for a service card, default is a shop item) or
 * a ready-made `clientSecret` (e.g. a booking payment created upstream).
 */
export default function CheckoutModal({
  itemId,
  itemType = 'shop',
  clientSecret,
  title,
  doneNote,
  digital = false,
  /** Cover/preview image URL — when set, the checkout splits in two:
   *  the preview beside the payment form. */
  image = null,
  /** The product's full description, shown under the cover so the buyer
   *  can read everything right where they pay. */
  description = '',
  onPaid,
  onClose,
}) {
  const [state, setState] = useState('loading') // loading | ready | paid | error
  const [error, setError] = useState('')
  const mountRef = useRef(null)
  const checkoutRef = useRef(null)

  /**
   * A download cannot be handed back, so it is sold final-sale — and the
   * buyer has to say they understand that before they can pay, not
   * discover it in the terms afterwards. The payment form stays mounted
   * but inert until the box is ticked: Stripe allows only one live
   * embedded instance, so mounting it late (or remounting it) is the
   * fragile way to do this.
   */
  const [acked, setAcked] = useState(!digital)

  useEffect(() => {
    let cancelled = false

    async function start() {
      try {
        const [cfg] = await Promise.all([getCheckoutConfig(), loadStripeJs()])
        if (cancelled) return

        let secret = clientSecret
        if (!secret) {
          const res = await fetch(`${API}/api/checkout/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId, itemType }),
          })
          const data = await res.json().catch(() => null)
          if (!res.ok || !data?.clientSecret) {
            throw new Error(data?.error || 'Could not start checkout.')
          }
          secret = data.clientSecret
        }
        if (cancelled) return

        const stripe = window.Stripe(
          cfg.publishableKey,
          cfg.account ? { stripeAccount: cfg.account } : undefined,
        )
        const checkout = await stripe.initEmbeddedCheckout({
          clientSecret: secret,
          onComplete: () => {
            setState('paid')
            onPaid?.()
          },
        })

        // The modal may have been closed while Stripe was initialising —
        // Stripe allows only one live embedded instance, so destroy
        // rather than leak it.
        if (cancelled) {
          checkout.destroy()
          return
        }
        checkoutRef.current = checkout
        checkout.mount(mountRef.current)
        setState('ready')
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
          setState('error')
        }
      }
    }

    start()
    document.body.style.overflow = 'hidden' // no scrolling behind the modal

    return () => {
      cancelled = true
      document.body.style.overflow = ''
      checkoutRef.current?.destroy()
      checkoutRef.current = null
    }
  }, [itemId, itemType, clientSecret])

  // The preview only makes sense while there is a payment form to sit
  // beside — the paid and error states go back to the single column.
  const split =
    Boolean(image || description) && state !== 'paid' && state !== 'error'

  // Portaled to <body>: the trigger lives inside the offer card's <a>,
  // and a dialog nested in an anchor is both invalid markup and a click
  // hazard — every tap inside it would bubble into the link.
  return createPortal(
    <div className="pay" role="dialog" aria-modal="true" aria-label={`Buy ${title}`}>
      <div className="pay__scrim" onClick={state === 'ready' ? undefined : onClose} />
      <div
        className={`pay__card${state === 'paid' ? ' pay__card--paid' : ''}${
          split ? ' pay__card--split' : ''
        }`}
      >
        <button className="pay__close" onClick={onClose} aria-label="Close checkout">
          ×
        </button>

        {state === 'loading' && <p className="pay__status">Opening secure checkout…</p>}

        {state === 'error' && (
          <div className="pay__status">
            <p className="pay__error">{error}</p>
            <button className="btn btn--primary" onClick={onClose}>
              Close
            </button>
          </div>
        )}

        {state === 'paid' && (
          <div className="pay__status" role="status">
            <p className="pay__done-title">Payment received</p>
            <p className="pay__done-note">
              {doneNote || 'A receipt is on its way to your email. Thank you!'}
            </p>
            {/* The moment someone is most likely to need it: the receipt
                carries the invoice link, and this carries the address for
                everything the receipt does not cover. */}
            <p className="pay__done-note">
              Need an invoice for your business? There’s a link in your receipt
              email. For a refund, a problem, or any other question, write to{' '}
              <a className="pay__done-link" href={`mailto:${SUPPORT}`}>
                {SUPPORT}
              </a>
              .
            </p>
            <button className="btn btn--primary" onClick={onClose}>
              Done
            </button>
          </div>
        )}

        <div
          className={`pay__body${split ? ' pay__body--split' : ''}`}
          style={{ display: state === 'paid' || state === 'error' ? 'none' : undefined }}
        >
          {/* Cover on top, the FULL description under it, payment to the
              right — the buyer reads everything right where they pay. */}
          {split && (
            <div className="pay__preview">
              {image && <img src={image} alt="" aria-hidden="true" />}
              <p className="pay__preview-title">{title}</p>
              {description && (
                <div className="pay__desc">
                  <RichText text={description} />
                </div>
              )}
            </div>
          )}

          <div className="pay__main">
            {digital && (
              <div className="pay__terms">
                <p className="pay__terms-title">This is a download, so the sale is final</p>
                <p className="pay__terms-copy">
                  Your file is sent as soon as you pay. Because a file can’t be given
                  back, <strong>this purchase can’t be refunded or cancelled</strong>.
                  If it never arrives, or it’s faulty or not as described, or you have
                  any other concern, email{' '}
                  <a href={`mailto:${SUPPORT}`}>{SUPPORT}</a> and we’ll put it right.
                </p>
                <label className="pay__ack">
                  <input
                    type="checkbox"
                    checked={acked}
                    onChange={(e) => setAcked(e.target.checked)}
                  />
                  {/* The box is this span, not the input: Safari won't
                      reliably paint a native tick or pseudo-elements on
                      the input itself, and an invisible consent control
                      at the moment of payment is not acceptable. */}
                  <span className="pay__box" aria-hidden="true" />
                  <span>
                    I understand this purchase is final and non-refundable, and I want
                    the file straight away.
                  </span>
                </label>
              </div>
            )}

            {/* Stripe mounts its iframe here; keep it in the tree during
                'loading' so the mount target exists when init resolves. */}
            <div
              ref={mountRef}
              className={`pay__frame${acked ? '' : ' pay__frame--locked'}`}
              aria-hidden={acked ? undefined : true}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
