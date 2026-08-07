import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

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
  onPaid,
  onClose,
}) {
  const [state, setState] = useState('loading') // loading | ready | paid | error
  const [error, setError] = useState('')
  const mountRef = useRef(null)
  const checkoutRef = useRef(null)

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

  // Portaled to <body>: the trigger lives inside the offer card's <a>,
  // and a dialog nested in an anchor is both invalid markup and a click
  // hazard — every tap inside it would bubble into the link.
  return createPortal(
    <div className="pay" role="dialog" aria-modal="true" aria-label={`Buy ${title}`}>
      <div className="pay__scrim" onClick={state === 'ready' ? undefined : onClose} />
      <div className={`pay__card${state === 'paid' ? ' pay__card--paid' : ''}`}>
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
            <button className="btn btn--primary" onClick={onClose}>
              Done
            </button>
          </div>
        )}

        {/* Stripe mounts its iframe here; keep it in the tree during
            'loading' so the mount target exists when init resolves. */}
        <div
          ref={mountRef}
          className="pay__frame"
          style={{ display: state === 'paid' ? 'none' : undefined }}
        />
      </div>
    </div>,
    document.body,
  )
}
