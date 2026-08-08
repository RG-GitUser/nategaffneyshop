import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { confirmDialog } from '../confirm.jsx'

const money = (cents, currency = 'cad') =>
  new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format((cents ?? 0) / 100)

/** Date over time on two lines, so the column stays narrow. */
const whenParts = (unix) => {
  const d = new Date(unix * 1000)
  return [
    d.toLocaleDateString('en-CA'),
    d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' }),
  ]
}

/** Stripe's raw status ids read like shouting constants in a pill.
 *  'requires_payment_method' just means the payment never went through. */
const prettyStatus = (s) =>
  s === 'requires_payment_method' ? 'incomplete' : String(s || '').replace(/_/g, ' ')

export default function PaymentsPanel({ notify }) {
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refunding, setRefunding] = useState(null) // { id, amount, max, currency }

  const [unconfigured, setUnconfigured] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [list, stats] = await Promise.all([
        api.listPayments(25),
        api.paymentSummary().catch(() => null),
      ])
      setRows(list.data)
      setSummary(stats)
      setUnconfigured(false)
    } catch (err) {
      // 503 means no Stripe key on the server — that's a setup state, not
      // an error worth shouting about.
      if (err.status === 503) setUnconfigured(true)
      else notify(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function submitRefund() {
    const cents = Math.round(Number(refunding.amount) * 100)
    if (!Number.isFinite(cents) || cents <= 0 || cents > refunding.max) {
      notify('Enter an amount between 0 and the payment total.', 'error')
      return
    }
    const ok = await confirmDialog({
      title: `Refund ${money(cents, refunding.currency)}?`,
      message:
        `Payment ${refunding.id}.\n` +
        'This moves real money and cannot be undone from here.',
      confirmLabel: 'Refund',
      danger: true,
    })
    if (!ok) return

    try {
      await api.refund(refunding.id, { amount: cents })
      notify(`Refunded ${money(cents, refunding.currency)}.`)
      setRefunding(null)
      load()
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  return (
    <div>
      <div className="adm-panel-head">
        <div>
          <h2 className="adm-h2">Payments</h2>
          <p className="adm-sub">
            Live Stripe data. Card numbers are never sent to this page — only the
            brand and last four.
          </p>
        </div>
        <button className="adm-mini" onClick={load}>
          Refresh
        </button>
      </div>

      {summary && (
        <div className="adm-stats">
          <div className="adm-stat">
            <span className="adm-stat__label">Last {summary.windowDays} days</span>
            <span className="adm-stat__value">
              {money(summary.grossAmount, summary.currency)}
            </span>
          </div>
          <div className="adm-stat">
            <span className="adm-stat__label">Payments</span>
            <span className="adm-stat__value">{summary.count}</span>
          </div>
        </div>
      )}

      {unconfigured ? (
        <p className="adm-alert adm-alert--warn">
          Stripe isn’t connected yet. Add <code>STRIPE_SECRET_KEY</code> — and{' '}
          <code>STRIPE_ACCOUNT_ID</code> if you’re on Connect — to{' '}
          <code>server/.env</code> and restart the service. Everything else on
          this dashboard works without it.
        </p>
      ) : loading ? (
        <p className="adm-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="adm-muted">No payments yet.</p>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Customer</th>
                <th>For</th>
                <th>Card</th>
                <th>Amount</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const remaining = p.amount - (p.amountRefunded || 0)
                const [onDate, atTime] = whenParts(p.created)
                return (
                  <tr key={p.id}>
                    <td className="adm-nowrap">
                      {onDate}
                      <br />
                      <span className="adm-muted">{atTime}</span>
                    </td>
                    <td>
                      <strong>{p.customerName || '—'}</strong>
                      <br />
                      <span className="adm-muted">{p.customerEmail || '—'}</span>
                    </td>
                    <td className="adm-note adm-for">{p.label || '—'}</td>
                    <td className="adm-nowrap">
                      {p.cardBrand ? `${p.cardBrand} ···· ${p.cardLast4}` : '—'}
                    </td>
                    <td className="adm-nowrap">
                      {money(p.amount, p.currency)}
                      {p.amountRefunded > 0 && (
                        <>
                          <br />
                          <span className="adm-muted">
                            −{money(p.amountRefunded, p.currency)} refunded
                          </span>
                        </>
                      )}
                    </td>
                    <td>
                      <span className={`adm-pill adm-pill--${p.status}`}>
                        {prettyStatus(p.status)}
                      </span>
                    </td>
                    <td className="adm-actions">
                      {p.receiptUrl && (
                        <a
                          className="adm-mini"
                          href={p.receiptUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          Receipt
                        </a>
                      )}
                      {p.status === 'succeeded' && remaining > 0 && (
                        <button
                          className="adm-mini adm-mini--danger"
                          onClick={() =>
                            setRefunding({
                              id: p.id,
                              amount: (remaining / 100).toFixed(2),
                              max: remaining,
                              currency: p.currency,
                            })
                          }
                        >
                          Refund
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {refunding && (
        <div className="adm-modal" role="dialog" aria-modal="true">
          <div className="adm-modal__card">
            <h3 className="adm-h3">Refund payment</h3>
            <p className="adm-sub">{refunding.id}</p>
            <div className="adm-field">
              <label htmlFor="refund-amount">
                Amount (max {money(refunding.max, refunding.currency)})
              </label>
              <input
                id="refund-amount"
                type="number"
                step="0.01"
                min="0.01"
                max={(refunding.max / 100).toFixed(2)}
                value={refunding.amount}
                onChange={(e) => setRefunding({ ...refunding, amount: e.target.value })}
              />
            </div>
            <div className="adm-modal__actions">
              <button className="adm-mini" onClick={() => setRefunding(null)}>
                Cancel
              </button>
              <button className="adm-mini adm-mini--danger" onClick={submitRefund}>
                Refund
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
