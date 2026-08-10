import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { confirmDialog } from '../confirm.jsx'
import { VizToggle } from './charts.jsx'

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

const KIND_LABELS = { product: 'Product', service: 'Service', booking: 'Booking' }

export default function PaymentsPanel({ notify }) {
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refunding, setRefunding] = useState(null) // { id, amount, max, currency }
  const [invoiceUrl, setInvoiceUrl] = useState(null) // link handed back to a customer
  const [picking, setPicking] = useState(null) // { customer, purchases, chosen:Set }

  const [unconfigured, setUnconfigured] = useState(false)

  // Filters. `search` is what's typed; `q` is the debounced value that
  // actually goes to the server, so every keystroke isn't a Stripe scan.
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('')
  const [item, setItem] = useState('')
  /**
   * 'all' or 'returns'. A view rather than another option in the category
   * dropdown: money going back out is a different question from what was
   * bought, and the two are asked together — "which downloads got
   * refunded" needs both at once.
   */
  const [view, setView] = useState('all')
  const [refunded, setRefunded] = useState(0)
  const [items, setItems] = useState([])
  const [truncated, setTruncated] = useState(false)
  const [scanned, setScanned] = useState(0)

  // Paging. `pager` is what the server actually returned, so the footer
  // never claims a page count the data doesn't back up.
  const [page, setPage] = useState(1)
  const [pager, setPager] = useState({ page: 1, pages: 1, total: 0 })

  /**
   * Clicking Next means sitting at the bottom of the page with the cursor
   * on the button. Pages are not all the same height — a refunded row
   * carries an extra line — so a shorter page shrinks the document below
   * the current scroll offset, the browser clamps it, and the whole view
   * (button included) jumps upward.
   *
   * So the table keeps the tallest height it has reached for this result
   * set. Pages can grow it, never shrink it, and the button stays put.
   */
  const wrapRef = useRef(null)
  const [floor, setFloor] = useState(0)
  const filtered = Boolean(q || kind || item || view === 'returns')

  /**
   * Requests can land out of order — three quick Next clicks are three
   * in flight at once, and the slowest reply would otherwise be the one
   * left on screen, showing rows from a page nobody is on any more.
   * Only the newest request is allowed to write anything.
   */
  const reqRef = useRef(0)

  async function load() {
    const seq = ++reqRef.current
    setLoading(true)
    try {
      const list = await api.listPayments({
        limit: 25,
        page,
        q,
        kind,
        item,
        returns: view === 'returns',
      })
      if (seq !== reqRef.current) return
      setRows(list.data)
      setTruncated(Boolean(list.truncated))
      setScanned(list.scanned || 0)
      setRefunded(list.refunded || 0)
      // The server clamps the page it was asked for, so mirror what came
      // back rather than what was requested.
      setPager({ page: list.page || 1, pages: list.pages || 1, total: list.total || 0 })
      if (list.page && list.page !== page) setPage(list.page)
      setUnconfigured(false)
    } catch (err) {
      if (seq !== reqRef.current) return
      // 503 means no Stripe key on the server — that's a setup state, not
      // an error worth shouting about.
      if (err.status === 503) setUnconfigured(true)
      else notify(err.message, 'error')
    } finally {
      // A superseded request must not clear the spinner the newest one is
      // still relying on.
      if (seq === reqRef.current) setLoading(false)
    }
  }

  /**
   * The 30-day headline is the same whatever is filtered or paged, so it
   * loads once rather than riding along with every list request. It also
   * keeps its last good value on failure: blanking it would unmount the
   * stats row and drop everything below it up the page.
   */
  async function loadSummary() {
    const stats = await api.paymentSummary().catch(() => null)
    if (stats) setSummary(stats)
  }

  useEffect(() => {
    loadSummary()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, kind, item, view, page])

  // Before paint, so the reserved height is already in place and the page
  // never flickers shorter on its way to the new rows.
  useLayoutEffect(() => {
    const h = wrapRef.current?.offsetHeight
    if (h) setFloor((f) => (h > f ? h : f))
  }, [rows])

  // The item dropdown comes from the orders on record, not from the page
  // of payments on screen — otherwise you could only filter to things
  // already visible, which defeats the point.
  useEffect(() => {
    api
      .paymentFilters()
      .then((r) => setItems(r.items || []))
      .catch(() => setItems([]))
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim())
      resetView()
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  /**
   * A new filter is a different result set, so page 3 of the old one is
   * meaningless and the height reserved for it is the wrong shape.
   *
   * Done here rather than in an effect on [q, kind, item] so the reset
   * batches with the filter change into ONE render — as a separate effect
   * it fired after the first fetch had already gone out for the old page,
   * costing a wasted round trip on every keystroke.
   */
  const resetView = () => {
    setPage(1)
    setFloor(0)
  }

  // A kind and a specific item can contradict each other ("Bookings" +
  // a PDF title = always empty). Picking one clears the other.
  const chooseKind = (v) => {
    setKind(v)
    if (v) setItem('')
    resetView()
  }
  const chooseItem = (v) => {
    setItem(v)
    if (v) setKind('')
    resetView()
  }
  const chooseView = (v) => {
    setView(v)
    resetView()
  }
  const clearFilters = () => {
    setSearch('')
    setQ('')
    setKind('')
    setItem('')
    setView('all')
    resetView()
  }

  /** Every receipt already carries a single-purchase link — this is for
   *  the customer who deleted the email, bought before the feature
   *  existed, or needs several purchases on one invoice. */
  async function getInvoiceLink(paymentIntents) {
    try {
      const { url } = await api.invoiceLink(paymentIntents)
      setPicking(null)
      setInvoiceUrl(url)
    } catch (err) {
      notify(err.message, 'error')
    }
  }

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
        'This moves real money and cannot be undone from here.' +
        // Downloads are sold final-sale, so refunding one is a deliberate
        // exception — and it only kills the link, never the file itself.
        (refunding.digital
          ? '\n\nThis was a download, which the terms sell as final sale. ' +
            'Refunding kills the download link, but not any copy they have ' +
            'already saved.'
          : ''),
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
        <div className="adm-toolbar">
          {/* A view, not a category: it crosses the other filters rather
              than competing with them, so "which downloads got refunded"
              is one question you can actually ask. */}
          <VizToggle
            value={view}
            onChange={chooseView}
            options={[
              { value: 'all', label: 'All' },
              { value: 'returns', label: 'Returns' },
            ]}
          />
          <input
            className="adm-search"
            type="search"
            placeholder="Search name, email or item"
            aria-label="Search payments by customer name, email or item"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {/* Both selects are a fixed width: left to size themselves,
              they grow to fit whatever is chosen, which shoves the
              buttons sideways — and can rewrap the whole row — every time
              a filter changes. */}
          <select
            className="adm-select adm-select--steady"
            aria-label="Filter by what was bought"
            value={kind}
            onChange={(e) => chooseKind(e.target.value)}
          >
            <option value="">All</option>
            <option value="product">Products</option>
            <option value="service">Services</option>
            <option value="booking">Bookings</option>
          </select>
          <select
            className="adm-select adm-select--steady adm-select--wide"
            aria-label="Filter by a specific item"
            value={item}
            onChange={(e) => chooseItem(e.target.value)}
          >
            <option value="">All items</option>
            {items.map((it) => (
              <option key={it.title} value={it.title}>
                {it.title}
                {it.count > 1 ? ` (${it.count})` : ''}
              </option>
            ))}
          </select>
          {/* Stays mounted and keeps its space when there is nothing to
              clear — appearing and disappearing would move Refresh out
              from under the cursor. */}
          <button
            className="adm-mini"
            style={filtered ? undefined : { visibility: 'hidden' }}
            aria-hidden={!filtered}
            tabIndex={filtered ? undefined : -1}
            onClick={clearFilters}
          >
            Clear
          </button>
          <button
            className="adm-mini"
            onClick={() => {
              load()
              loadSummary()
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* In the Returns view the 30-day gross is beside the point, so the
          stats row answers the question actually being asked instead. */}
      {view === 'returns' ? (
        <div className="adm-stats">
          <div className="adm-stat adm-stat--returns">
            <span className="adm-stat__label">Returned</span>
            <span className="adm-stat__value">
              {money(refunded, rows[0]?.currency || summary?.currency)}
            </span>
          </div>
          <div className="adm-stat adm-stat--returns">
            <span className="adm-stat__label">Payments refunded</span>
            <span className="adm-stat__value">{pager.total}</span>
          </div>
        </div>
      ) : (
        summary && (
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
        )
      )}

      {unconfigured ? (
        <p className="adm-alert adm-alert--warn">
          Stripe isn’t connected yet. Add <code>STRIPE_SECRET_KEY</code> — and{' '}
          <code>STRIPE_ACCOUNT_ID</code> if you’re on Connect — to{' '}
          <code>server/.env</code> and restart the service. Everything else on
          this dashboard works without it.
        </p>
      ) : /* Only the very first load blanks the panel. Paging keeps the
             table on screen and dims it, so the pager doesn't vanish out
             from under the cursor between clicks. */
      loading && rows.length === 0 ? (
        <p className="adm-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="adm-muted">
          {view === 'returns' && !q && !kind && !item
            ? `No returns${scanned ? ` in the last ${scanned} payments` : ''}. Nothing has been refunded.`
            : filtered
              ? `Nothing matches${scanned ? ` in the last ${scanned} payments` : ''}.`
              : 'No payments yet.'}
        </p>
      ) : (
        <>
          <div
            ref={wrapRef}
            className={`adm-table-wrap${loading ? ' is-busy' : ''}`}
            style={floor ? { minHeight: floor } : undefined}
            aria-busy={loading}
          >
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
                    <td className="adm-note adm-for">
                      {p.label || '—'}
                      {p.kind && (
                        <>
                          <br />
                          <span className="adm-muted">{KIND_LABELS[p.kind]}</span>
                        </>
                      )}
                      {p.invoicedTo && (
                        <>
                          <br />
                          <span className="adm-muted">Invoiced to {p.invoicedTo}</span>
                        </>
                      )}
                    </td>
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
                      {/* Opens a picker of this customer's purchases. One
                          invoice can cover several of them, so this is a
                          checklist rather than a straight action. */}
                      {p.purchases?.length > 0 && (
                        <button
                          className="adm-mini"
                          title="Build an invoice from this customer's purchases"
                          onClick={() =>
                            setPicking({
                              customer: p.customerName || p.customerEmail || 'this customer',
                              purchases: p.purchases,
                              chosen: new Set([p.id]),
                            })
                          }
                        >
                          Invoice…
                        </button>
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
                              digital: p.digital,
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

          {/* Outside the table wrapper on purpose — that scrolls
              horizontally on a narrow screen, and the pager must not
              slide out of reach with it. */}
          <div className="adm-pager">
            <button
              className="adm-mini"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pager.page <= 1 || loading}
            >
              ← Previous
            </button>

            <span className="adm-pager__at">
              {pager.page} / {pager.pages}
            </span>

            <button
              className="adm-mini"
              onClick={() => setPage((p) => Math.min(pager.pages, p + 1))}
              disabled={pager.page >= pager.pages || loading}
            >
              Next →
            </button>
          </div>

          {/* Say where the scan stopped rather than letting a full last
              page imply there is nothing further back. */}
          {truncated && (
            <p className="adm-muted">
              Counted the most recent {scanned} payments — anything older than
              that isn’t included, so the page count is a floor.
            </p>
          )}
        </>
      )}

      {picking && (
        <div className="adm-modal" role="dialog" aria-modal="true">
          <div className="adm-modal__card">
            <h3 className="adm-h3">Invoice {picking.customer}</h3>
            <p className="adm-sub">
              Tick everything this invoice should cover. One invoice, one
              customer — the total is the sum of what you pick.
            </p>

            <ul className="adm-picklist">
              {picking.purchases.map((buy) => {
                const on = picking.chosen.has(buy.id)
                return (
                  <li key={buy.id}>
                    <label className="adm-check">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          setPicking((prev) => {
                            const chosen = new Set(prev.chosen)
                            if (on) chosen.delete(buy.id)
                            else chosen.add(buy.id)
                            return { ...prev, chosen }
                          })
                        }
                      />
                      <span className="adm-picklist__label">{buy.label || 'Purchase'}</span>
                      <span className="adm-picklist__amount">
                        {money(buy.amount, buy.currency)}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>

            <p className="adm-picklist__total">
              {picking.chosen.size} selected ·{' '}
              {money(
                picking.purchases
                  .filter((b) => picking.chosen.has(b.id))
                  .reduce((sum, b) => sum + b.amount, 0),
                picking.purchases[0]?.currency,
              )}
            </p>

            <div className="adm-modal__actions">
              <button className="adm-mini" onClick={() => setPicking(null)}>
                Cancel
              </button>
              <button
                className="adm-mini"
                disabled={picking.chosen.size === 0}
                onClick={() => getInvoiceLink([...picking.chosen])}
              >
                Get link
              </button>
            </div>
          </div>
        </div>
      )}

      {invoiceUrl && (
        <div className="adm-modal" role="dialog" aria-modal="true">
          <div className="adm-modal__card">
            <h3 className="adm-h3">Invoice link</h3>
            <p className="adm-sub">
              Send this to the customer. They fill in who to bill and the invoice
              is issued and emailed to them straight away.
            </p>
            <div className="adm-field">
              <label htmlFor="invoice-link">Link</label>
              <input
                id="invoice-link"
                readOnly
                value={invoiceUrl}
                onFocus={(e) => e.target.select()}
                // Focused on mount so it is one keystroke from copied even
                // where the clipboard API is blocked.
                ref={(el) => el?.select()}
              />
            </div>
            <div className="adm-modal__actions">
              <button className="adm-mini" onClick={() => setInvoiceUrl(null)}>
                Close
              </button>
              <button
                className="adm-mini"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(invoiceUrl)
                    notify('Link copied.')
                    setInvoiceUrl(null)
                  } catch {
                    notify('Copy blocked — select the link and copy it.', 'error')
                  }
                }}
              >
                Copy
              </button>
            </div>
          </div>
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
