import { useState } from 'react'
import CheckoutModal, { checkoutMode } from '../components/CheckoutModal.jsx'
import Footer from '../components/Footer.jsx'
import { ArrowRight } from '../components/Icons.jsx'
import RichText from '../richtext.jsx'
import { profile, services, auditPage } from '../content.js'
import { safeImageSrc } from '../safeUrl.js'

const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

/**
 * The Content Audit's own page at /audit/, linked from its card on the
 * landing page. Deliberately NOT another card: a page heading, the full
 * pitch, what's included, and the booking at the end. Title, price and
 * the charge amount come from the audit entry in `services` (dashboard
 * Services tab); the longer copy is `auditPage` in content.js.
 */
export default function AuditPage() {
  const audit = services.find((s) => /audit/i.test(s.title || '')) || services[0]
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [paying, setPaying] = useState(false)

  /** With a charge amount the button is a real Stripe checkout, same as
   *  the cards; without one it opens an email instead. */
  const buyable = Boolean(audit?.id && audit?.priceCents)

  async function startCheckout(e) {
    e.preventDefault()
    if (busy || paying) return
    setBusy(true)
    setError('')

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
        body: JSON.stringify({ itemId: audit.id, itemType: 'service' }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.url) {
        setError(data?.error || 'Could not start checkout.')
        setBusy(false)
        return
      }
      window.location.href = data.url
    } catch {
      setError('Could not reach the server.')
      setBusy(false)
    }
  }

  const price =
    audit?.price || (audit?.priceCents ? `$${(audit.priceCents / 100).toFixed(0)}` : null)

  // The full descriptor, exactly as written in the Services tab — the
  // card clamps it to two lines, this page runs all of it, with line
  // breaks, **bold** and "- " bullets rendered (see richtext.jsx). The
  // bundled auditPage.intro only steps in if the stored card has no
  // description at all.
  const intro = (audit?.description || '').trim() || auditPage.intro.join('\n\n')

  return (
    <>
      <div className="page">
        <div className="shell">
          <header className="coaching-head rise">
            <a className="coaching-back" href="/">
              <ArrowRight
                width={16}
                height={16}
                style={{ transform: 'rotate(180deg)' }}
              />
              Back to {profile.name}
            </a>
          </header>

          <main className="stack">
            {audit ? (
              <section className="section rise">
                <div className="section__head">
                  <span className="eyebrow">{auditPage.eyebrow}</span>
                  <h1 className="section__title">{audit.title}</h1>
                </div>

                <div className="audit__card">
                  {safeImageSrc(audit.image) && (
                    <img
                      className="audit__img"
                      src={safeImageSrc(audit.image)}
                      alt=""
                      loading="lazy"
                    />
                  )}

                  <div className="audit__copy">
                    <RichText text={intro} />
                  </div>

                  {auditPage.list?.length > 0 && (
                    <>
                      <p className="audit__list-title">{auditPage.listTitle}</p>
                      <ul className="audit__list">
                        {auditPage.list.map((li) => (
                          <li key={li.slice(0, 32)}>{li}</li>
                        ))}
                      </ul>
                    </>
                  )}

                  <div className="audit__book">
                    {price && (
                      <div className="price">
                        <span className="price__now">{price}</span>
                      </div>
                    )}

                    {buyable ? (
                      <button
                        type="button"
                        className="offer__cta audit__cta"
                        onClick={startCheckout}
                        aria-busy={busy || undefined}
                      >
                        {busy ? 'Opening…' : 'Book the audit'}
                      </button>
                    ) : (
                      <a
                        className="offer__cta audit__cta"
                        href="mailto:support@nategaffney.store?subject=Content%20Audit%20booking"
                      >
                        Book the audit
                      </a>
                    )}

                    {auditPage.finePrint && (
                      <p className="audit__fine mono">{auditPage.finePrint}</p>
                    )}

                    {error && <p className="offer__error">{error}</p>}
                  </div>
                </div>
              </section>
            ) : (
              <section className="section">
                <div className="section__head">
                  <h2 className="section__title">Nothing here</h2>
                </div>
                <p>
                  This page is empty or has been removed. Head back to the
                  main page to see what is live.
                </p>
              </section>
            )}
          </main>

          <Footer />
        </div>
      </div>

      {paying && (
        <CheckoutModal
          itemId={audit.id}
          itemType="service"
          title={audit.title}
          image={safeImageSrc(audit.image)}
          doneNote="Payment received. Your receipt is on its way to your email."
          onClose={() => setPaying(false)}
        />
      )}
    </>
  )
}
