import { useEffect, useState } from 'react'

const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const SUPPORT = 'support@nategaffney.store'

const longDate = (value) =>
  new Date(value).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

/**
 * Self-serve invoice.
 *
 * Reached from the "get an invoice" link in the receipt email — the token
 * in the URL is what proves the visitor received that receipt, so there is
 * nothing to log into. They fill in who to bill, and the finished invoice
 * renders on the page ready to print or save as PDF, with a copy emailed.
 *
 * Deliberately one screen: the person doing this is filing an expense
 * claim, not shopping, and every extra step is a reason to give up and
 * email Nate instead.
 */
export default function InvoicePage() {
  const token = new URLSearchParams(window.location.search).get('token') || ''

  const [state, setState] = useState('loading') // loading | form | done | error
  const [error, setError] = useState('')
  const [invoice, setInvoice] = useState(null)
  const [emailed, setEmailed] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    billToName: '',
    billToAddress: '',
    billToTaxNumber: '',
    reference: '',
  })

  useEffect(() => {
    if (!token) {
      setError('This link is missing its code. Open the link from your receipt email.')
      setState('error')
      return
    }
    fetch(`${API}/api/invoice?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => null)
        if (!r.ok) throw new Error(data?.error || 'We could not load this invoice.')
        return data
      })
      .then((data) => {
        setInvoice(data.invoice)
        // Already issued once — show it straight away, with the details
        // they gave last time loaded for correcting.
        if (data.issued) {
          setForm({
            billToName: data.invoice.billTo?.name || '',
            billToAddress: data.invoice.billTo?.address || '',
            billToTaxNumber: data.invoice.billTo?.taxNumber || '',
            reference: data.invoice.reference || '',
          })
          setState('done')
        } else {
          setForm((f) => ({ ...f, billToName: data.customerName || '' }))
          setState('form')
        }
      })
      .catch((err) => {
        setError(err.message)
        setState('error')
      })
  }, [token])

  async function submit(e) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${API}/api/invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...form, email: true }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'We could not issue the invoice.')
      setInvoice(data.invoice)
      setEmailed(Boolean(data.emailed))
      setState('done')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  if (state === 'loading') {
    return (
      <main className="inv">
        <p className="inv__status">Loading your invoice…</p>
      </main>
    )
  }

  if (state === 'error') {
    return (
      <main className="inv">
        <div className="inv__status">
          <p className="inv__error">{error}</p>
          <p>
            Email <a href={`mailto:${SUPPORT}`}>{SUPPORT}</a> and we’ll sort it out.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="inv">
      <a className="inv__back no-print" href="/">
        ← Nate Gaffney
      </a>

      {state === 'form' && (
        <>
          <header className="inv__head no-print">
            <h1 className="inv__title">Get an invoice</h1>
            <p className="inv__sub">
              For your business or an expense claim. Tell us who to bill and we’ll
              issue it now — you’ll see it here and get a copy by email.
            </p>
          </header>

          {/* Which purchase this is for. A link can be sent for any one of
              several purchases, so the page has to say which one landed —
              otherwise you are filling in billing details blind. */}
          {invoice && (
            <div className="inv__for no-print">
              <p className="inv__for-label">
                {invoice.lines.length > 1
                  ? `Invoice for ${invoice.lines.length} purchases`
                  : 'Invoice for'}
              </p>
              {invoice.lines.map((line, i) => (
                <p className="inv__for-item" key={`${line.item}-${i}`}>
                  {line.item}
                  <span className="inv__for-price">{line.price}</span>
                </p>
              ))}
              <p className="inv__for-meta">
                {invoice.lines.length > 1 ? `Total ${invoice.total}` : invoice.total} · paid{' '}
                {longDate(invoice.paidAt)}
              </p>
            </div>
          )}

          <form className="inv__form no-print" onSubmit={submit}>
            <div className="inv__field">
              <label htmlFor="billToName">Bill to *</label>
              <input
                id="billToName"
                required
                maxLength={160}
                placeholder="Your company, or your own name"
                value={form.billToName}
                onChange={set('billToName')}
              />
              <p className="inv__hint">
                If you’re claiming this back yourself, your own name is fine.
              </p>
            </div>

            <div className="inv__field">
              <label htmlFor="billToAddress">Billing address</label>
              <textarea
                id="billToAddress"
                rows={3}
                maxLength={500}
                placeholder={'Street\nCity, Province  Postal code\nCountry'}
                value={form.billToAddress}
                onChange={set('billToAddress')}
              />
            </div>

            <div className="inv__row">
              <div className="inv__field">
                <label htmlFor="billToTaxNumber">Your tax / VAT number</label>
                <input
                  id="billToTaxNumber"
                  maxLength={60}
                  placeholder="Optional"
                  value={form.billToTaxNumber}
                  onChange={set('billToTaxNumber')}
                />
              </div>
              <div className="inv__field">
                <label htmlFor="reference">PO / reference</label>
                <input
                  id="reference"
                  maxLength={80}
                  placeholder="Optional"
                  value={form.reference}
                  onChange={set('reference')}
                />
              </div>
            </div>

            {error && <p className="inv__error">{error}</p>}

            <button className="btn btn--primary" type="submit" disabled={saving}>
              {saving ? 'Issuing…' : 'Issue my invoice'}
            </button>
          </form>
        </>
      )}

      {state === 'done' && invoice && (
        <>
          <div className="inv__done no-print">
            <p className="inv__done-title">Invoice {invoice.number} is ready</p>
            <p className="inv__sub">
              {emailed
                ? 'A copy is on its way to your email.'
                : 'Print it or save it as a PDF below.'}
            </p>
            <div className="inv__actions">
              <button className="btn btn--primary" onClick={() => window.print()}>
                Print / save as PDF
              </button>
              <button className="btn" onClick={() => setState('form')}>
                Change the details
              </button>
            </div>
          </div>

          <InvoiceDoc invoice={invoice} />

          <p className="inv__foot no-print">
            Something wrong on this invoice, or any other concern, including a
            refund? Email <a href={`mailto:${SUPPORT}`}>{SUPPORT}</a> and we’ll
            put it right.
          </p>
        </>
      )}
    </main>
  )
}

/** The document itself — the only part that survives printing. */
function InvoiceDoc({ invoice }) {
  return (
    <article className="doc">
      <div className="doc__head">
        <div>
          <p className="doc__eyebrow">Invoice</p>
          <p className="doc__number">{invoice.number}</p>
        </div>
        <div className="doc__paid">Paid in full</div>
      </div>

      <div className="doc__parties">
        <div>
          <p className="doc__label">From</p>
          <p className="doc__strong">{invoice.seller.name}</p>
          {invoice.seller.address && <p className="doc__lines">{invoice.seller.address}</p>}
          {invoice.seller.email && <p className="doc__lines">{invoice.seller.email}</p>}
          {invoice.seller.taxNumber && (
            <p className="doc__lines">GST/HST No. {invoice.seller.taxNumber}</p>
          )}
        </div>
        <div>
          <p className="doc__label">Bill to</p>
          <p className="doc__strong">{invoice.billTo?.name || '—'}</p>
          {invoice.billTo?.address && <p className="doc__lines">{invoice.billTo.address}</p>}
          {invoice.billTo?.taxNumber && (
            <p className="doc__lines">Tax No. {invoice.billTo.taxNumber}</p>
          )}
        </div>
      </div>

      <div className="doc__meta">
        <span>
          <strong>Issued</strong> {longDate(invoice.issuedAt)}
        </span>
        <span>
          <strong>Paid on</strong> {longDate(invoice.paidAt)}
        </span>
        {invoice.reference && (
          <span>
            <strong>Reference</strong> {invoice.reference}
          </span>
        )}
      </div>

      <table className="doc__table">
        <thead>
          <tr>
            <th>Description</th>
            <th className="doc__num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((line, i) => (
            // Index in the key: the same item bought twice is two real
            // lines, and nothing else here is unique per line.
            <tr key={`${line.item}-${i}`}>
              <td>
                {line.item}
                {invoice.lines.length > 1 && (
                  <>
                    <br />
                    <span className="doc__line-date">paid {longDate(line.paidAt)}</span>
                  </>
                )}
              </td>
              <td className="doc__num">{line.price}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Total paid</td>
            <td className="doc__num">{invoice.total}</td>
          </tr>
        </tfoot>
      </table>

      {/* Only when there is a tax number to state. Without one the
          invoice says nothing about tax at all — a total with no tax line
          already reads as a total with no tax in it. */}
      {invoice.taxNote && <p className="doc__note">{invoice.taxNote}</p>}
      <p className="doc__note">
        Paid by card in full — nothing is outstanding on this invoice. Questions:{' '}
        {SUPPORT}
      </p>
    </article>
  )
}
