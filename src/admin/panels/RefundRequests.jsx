import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { REFUND_CATEGORIES, refundCategory } from '../../refundCategories.js'

const money = (cents, currency = 'cad') =>
  new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: String(currency || 'cad').toUpperCase(),
  }).format((cents ?? 0) / 100)

/**
 * "3 days ago" rather than a date.
 *
 * A refund request is a clock running, not a diary entry — the only thing
 * worth reading off it at a glance is how long somebody has been waiting.
 */
function ago(value) {
  const then = new Date(value).getTime()
  if (!Number.isFinite(then)) return ''
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} ${days === 1 ? 'day' : 'days'} ago`
  return new Date(value).toLocaleDateString('en-CA')
}

const TABS = [
  { id: 'open', label: 'Open' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'declined', label: 'Declined' },
]

function Chevron({ open }) {
  return (
    <svg
      className={`rq-chev${open ? ' is-open' : ''}`}
      width="12"
      height="12"
      viewBox="0 0 12 12"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3 4.5 L6 8 L9 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * The mix of reasons, as one bar.
 *
 * The point of collecting a category at all is the shape of the whole
 * pile, not any one request — five bands of "Never received it" says the
 * download emails are failing, which no amount of reading requests one at
 * a time makes obvious. Counts sit in the legend underneath; the bar
 * itself carries proportion only, which is all a 12px strip can honestly
 * hold.
 *
 * `compact` drops the legend and shrinks the strip, for the collapsed
 * header — the shape of the pile is the one thing worth keeping visible
 * when the queue itself is folded away.
 */
function CategoryBar({ counts, total, compact = false }) {
  if (!total) return null
  const bands = REFUND_CATEGORIES.map((c) => ({ ...c, count: counts[c.id] || 0 })).filter(
    (c) => c.count > 0,
  )

  return (
    <div className={`rq-mix${compact ? ' rq-mix--compact' : ''}`}>
      <div
        className="rq-mix__bar"
        role="img"
        aria-label={`Open requests by reason: ${bands
          .map((b) => `${b.label} ${b.count}`)
          .join(', ')}`}
      >
        {bands.map((b) => (
          <span
            key={b.id}
            className="rq-mix__band"
            style={{ width: `${(b.count / total) * 100}%`, background: b.color }}
            title={`${b.label}: ${b.count}`}
          />
        ))}
      </div>
      {!compact && (
        <ul className="rq-mix__legend">
          {bands.map((b) => (
            <li key={b.id}>
              <span className="rq-mix__swatch" style={{ background: b.color }} />
              {b.label}
              <b>{b.count}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * The refund request queue, above the payments table.
 *
 * Every request also lands in the support mailbox, as it always has. What
 * this adds is the reason as a value rather than a sentence — so the pile
 * can be counted — and a path from the request to the payment it is about,
 * which the mailbox cannot give you at all.
 *
 * Collapsible, because Payments is a tab people open to look at payments:
 * on most days there is nothing here, and a queue that permanently pushes
 * the table down the page earns its space on none of them. Folded away it
 * still shows the count and the mix, so nothing that matters is behind a
 * click — only the detail is.
 *
 * Refunding is not done here, and does not even start here: the button
 * hands the payment up to PaymentsPanel, which opens its receipt. That is
 * the screen with the reference, the date and the real total on it — the
 * things worth reading before agreeing that this is the purchase somebody
 * is actually writing about.
 */
export default function RefundRequests({ notify, onOpenReceipt, reloadKey }) {
  const [rows, setRows] = useState([])
  const [counts, setCounts] = useState({})
  const [open, setOpen] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [tab, setTab] = useState('open')
  const [totals, setTotals] = useState({ open: 0, resolved: 0, declined: 0 })
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(null)

  async function load() {
    setLoading(true)
    try {
      const res = await api.listRefundRequests(tab)
      setRows(res.data)
      setCounts(res.counts || {})
      setTotals(res.totals || { open: 0, resolved: 0, declined: 0 })
      setOpen(res.open || 0)
      setFailed(false)
    } catch {
      // The panel below this one is the actual job. A refund queue that
      // cannot load says so quietly and gets out of the way, rather than
      // throwing a toast over the payments table.
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  /**
   * Loaded whether the section is open or shut: the header's own count and
   * colour bar come out of this same request, so deferring it until the
   * first click would leave the collapsed state with nothing to show.
   */
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, reloadKey])

  async function settle(row, status) {
    setBusy(row.id)
    try {
      await api.updateRefundRequest(row.id, { status })
      notify(
        status === 'resolved'
          ? 'Marked resolved.'
          : status === 'declined'
            ? 'Marked declined.'
            : 'Reopened.',
      )
      load()
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setBusy(null)
    }
  }

  // Nothing has ever come in: say nothing at all. An empty "Refund
  // requests" heading on every visit is a permanent reminder of a thing
  // that is not happening.
  const everAny = totals.open + totals.resolved + totals.declined > 0
  if (failed || (!loading && !everAny && !expanded)) return null

  return (
    <section className={`rq${expanded ? ' is-open' : ''}`}>
      <div className="rq-head">
        <button
          type="button"
          className="rq-toggle"
          aria-expanded={expanded}
          aria-controls="rq-body"
          onClick={() => setExpanded((v) => !v)}
        >
          <Chevron open={expanded} />
          <span className="rq-toggle__title">Refund requests</span>
          {/* Nothing is claimed until the first load has answered. Saying
              "all clear" and then correcting it to "6 open" a moment later
              is worse than saying nothing for that moment. */}
          {loading && rows.length === 0 ? null : open > 0 ? (
            <span className="rq-count">{open} open</span>
          ) : (
            <span className="rq-count rq-count--clear">all clear</span>
          )}
        </button>

        {/* Folded away, the mix rides along in the header — the one thing
            worth seeing without opening anything. */}
        {!expanded && <CategoryBar counts={counts} total={open} compact />}
      </div>

      {expanded && (
        <div id="rq-body" className="rq-body">
          <div className="adm-panel-head">
            <p className="adm-sub">
              Sent from the form at <code>/refund/</code>. Every one also goes to
              the support mailbox. This is the same request, with the reason as
              something countable.
            </p>
            <div className="adm-toolbar">
              {/* Every request is in exactly one of these three, so the set
                  is complete and there is no "all" worth adding. Nothing is
                  ever deleted: resolving moves a request between tabs. */}
              <div className="rq-tabs" role="tablist" aria-label="Refund requests by status">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={tab === t.id}
                    className={tab === t.id ? 'is-active' : undefined}
                    onClick={() => setTab(t.id)}
                  >
                    {t.label}
                    <b>{totals[t.id]}</b>
                  </button>
                ))}
              </div>
              <button className="adm-mini" onClick={load}>
                Refresh
              </button>
            </div>
          </div>

          {/* The tally behind this counts OPEN requests, so it would be
              lying about whichever other tab it was shown under. */}
          {tab === 'open' && <CategoryBar counts={counts} total={open} />}

          {loading && rows.length === 0 ? (
            <p className="adm-muted">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="adm-muted">
              {tab === 'open'
                ? 'Nothing open. All caught up.'
                : tab === 'resolved'
                  ? 'Nothing resolved yet.'
                  : 'Nothing declined.'}
            </p>
          ) : (
            <ul className="rq-list">
              {rows.map((r) => {
                const cat = refundCategory(r.category)
                return (
                  <li
                    key={r.id}
                    className={`rq-card${r.status !== 'open' ? ' is-settled' : ''}`}
                    style={{ '--rq-accent': cat.color }}
                  >
                    <div className="rq-card__head">
                      <div className="rq-card__who">
                        <strong>{r.name || r.email}</strong>
                        {r.name && <span className="adm-muted">{r.email}</span>}
                      </div>
                      <span className="rq-tag">
                        <span className="rq-tag__dot" />
                        {r.categoryLabel || cat.label}
                      </span>
                    </div>

                    <p className="rq-card__when">
                      {ago(r.createdAt)}
                      {r.status !== 'open' && (
                        <span
                          className={`adm-pill adm-pill--${
                            r.status === 'resolved' ? 'confirmed' : 'cancelled'
                          }`}
                        >
                          {r.status}
                        </span>
                      )}
                    </p>

                    {/* Their own words, kept verbatim and kept whole. The
                        category is for counting; this is what actually tells
                        you what happened. */}
                    {r.message && <p className="rq-card__msg">{r.message}</p>}

                    <div className="rq-card__order">
                      {r.orderTitle ? (
                        <>
                          <span className="rq-card__item">{r.orderTitle}</span>
                          <span className="rq-card__amount">
                            {money(r.orderAmount, r.orderCurrency)}
                          </span>
                          {/* An unreferenced match is the newest of several
                              purchases — a guess. Say so, or the amount above
                              reads as fact and gets refunded as one. */}
                          {!r.matchedByReference && r.orderCount > 1 && (
                            <span className="rq-card__guess">
                              most recent of {r.orderCount}, check this is the
                              right one
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="rq-card__guess">
                          No paid order found for that address
                          {r.reference ? ` or reference “${r.reference}”` : ''}.
                        </span>
                      )}
                    </div>

                    <div className="adm-actions rq-card__actions">
                      {/* Opens the receipt for the matched purchase, which
                          is where refunding actually happens. The match is
                          often a guess, and this is the screen that lets
                          you check it against a reference and a total
                          before any money moves. */}
                      {r.paymentIntent && r.status === 'open' && (
                        <button
                          className="adm-mini adm-mini--danger"
                          disabled={busy === r.id}
                          onClick={() => onOpenReceipt(r)}
                        >
                          Refund…
                        </button>
                      )}
                      {r.status === 'open' ? (
                        <>
                          <button
                            className="adm-mini"
                            disabled={busy === r.id}
                            onClick={() => settle(r, 'resolved')}
                          >
                            Resolved
                          </button>
                          <button
                            className="adm-mini"
                            disabled={busy === r.id}
                            onClick={() => settle(r, 'declined')}
                          >
                            Decline
                          </button>
                        </>
                      ) : (
                        <button
                          className="adm-mini"
                          disabled={busy === r.id}
                          onClick={() => settle(r, 'open')}
                        >
                          Reopen
                        </button>
                      )}
                      <a className="adm-mini" href={`mailto:${r.email}`}>
                        Email them
                      </a>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
