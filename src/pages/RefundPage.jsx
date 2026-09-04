import { useState } from 'react'
import { REFUND_CATEGORIES, REFUND_CATEGORY_HINTS } from '../refundCategories.js'

const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const SUPPORT = 'support@nategaffney.store'

/**
 * Ask for a refund.
 *
 * Reached from the receipt email and the site footer. It exists for two
 * reasons at once, and the second is not the customer's problem: it gives
 * somebody a clear place to go, and it asks for the reason as one of a
 * fixed set, which is the only way the dashboard can ever see that (say)
 * four people this week never received a file.
 *
 * Everything except the address and the reason is optional. A person who
 * has just been charged for something that went wrong is not in the mood
 * to fill in a form, and a request that arrives thin is worth far more
 * than one that was abandoned halfway.
 */
export default function RefundPage() {
  const [form, setForm] = useState({
    email: '',
    name: '',
    reference: '',
    category: '',
    message: '',
  })
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    if (sending) return
    setSending(true)
    setError('')
    try {
      const res = await fetch(`${API}/api/refund-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'We could not send that. Try again.')
      setDone(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  if (done) {
    return (
      <main className="rfd">
        <a className="rfd__back" href="/">
          ← Nate Gaffney
        </a>
        <div className="rfd__done">
          <h1 className="rfd__title">That’s with us</h1>
          <p className="rfd__sub">
            A confirmation is on its way to {form.email}. A real person reads every
            one of these, and you’ll get a reply from a person, not an automated decision.
          </p>
          <p className="rfd__sub">
            If anything else is relevant, reply to that email and it lands on the
            same request. You can also write to{' '}
            <a href={`mailto:${SUPPORT}`}>{SUPPORT}</a> at any point.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="rfd">
      <a className="rfd__back" href="/">
        ← Nate Gaffney
      </a>

      <header className="rfd__head">
        <h1 className="rfd__title">Ask for a refund</h1>
        <p className="rfd__sub">
          Tell us what happened and we’ll sort it out. Only the first two fields
          are needed; the rest just helps us find your order.
        </p>
      </header>

      <form className="rfd__form" onSubmit={submit}>
        <div className="rfd__field">
          <label htmlFor="email">The email you bought with *</label>
          <input
            id="email"
            type="email"
            required
            maxLength={200}
            autoComplete="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={set('email')}
          />
          <p className="rfd__hint">
            This is how we find the purchase, so it has to be the address on the
            receipt.
          </p>
        </div>

        {/*
          The label wraps its radio, but the accessible name still has to be
          wired by hand: with the visible text sitting in a nested span, the
          browser computed each option's name as its VALUE — a screen reader
          announced "duplicate" where the page says "Charged twice".
        */}
        <fieldset
          className="rfd__field rfd__reasons"
          aria-labelledby="rfd-reasons-legend"
        >
          <legend id="rfd-reasons-legend">What went wrong? *</legend>
          {REFUND_CATEGORIES.map((c) => (
            <label
              key={c.id}
              className={`rfd__reason${form.category === c.id ? ' is-on' : ''}`}
            >
              <input
                type="radio"
                name="category"
                value={c.id}
                required
                checked={form.category === c.id}
                onChange={set('category')}
                aria-labelledby={`rfd-label-${c.id}`}
                aria-describedby={`rfd-hint-${c.id}`}
              />
              <span className="rfd__reason-body">
                <span className="rfd__reason-label" id={`rfd-label-${c.id}`}>
                  {c.label}
                </span>
                <span className="rfd__reason-hint" id={`rfd-hint-${c.id}`}>
                  {REFUND_CATEGORY_HINTS[c.id]}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="rfd__field">
          <label htmlFor="message">Anything you want to add</label>
          <textarea
            id="message"
            rows={5}
            maxLength={2000}
            placeholder="In your own words. However much or little you like."
            value={form.message}
            onChange={set('message')}
          />
        </div>

        <div className="rfd__field">
          <label htmlFor="reference">Receipt number</label>
          <input
            id="reference"
            maxLength={120}
            placeholder="NG-20260904-A1B2C3"
            value={form.reference}
            onChange={set('reference')}
          />
          <p className="rfd__hint">
            Optional. It’s at the top of your receipt email, and it points us
            straight at the right purchase if you’ve bought more than once.
          </p>
        </div>

        {error && <p className="rfd__error">{error}</p>}

        <button className="rfd__submit" type="submit" disabled={sending}>
          {sending ? 'Sending…' : 'Send the request'}
        </button>

        <p className="rfd__foot">
          Would rather just write to a person?{' '}
          <a href={`mailto:${SUPPORT}`}>{SUPPORT}</a> reaches the same place. The{' '}
          <a href="/terms/">terms</a> set out what can and can’t be refunded.
          Downloads are sold final sale, but that never covers a file that is
          faulty, wrong, or never arrived.
        </p>
      </form>
    </main>
  )
}
