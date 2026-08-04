import { useEffect, useState } from 'react'
import { api } from '../api.js'

const money = (cents, currency = 'cad') =>
  new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: (currency || 'cad').toUpperCase(),
  }).format((cents ?? 0) / 100)

const when = (iso) => new Date(iso).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })

export default function AnalyticsPanel({ notify }) {
  const [data, setData] = useState(null)
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api
      .metricsSummary(days)
      .then(setData)
      .catch((err) => notify(err.message, 'error'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days])

  if (loading && !data) return <p className="adm-muted">Loading…</p>
  if (!data) return <p className="adm-muted">No data yet.</p>

  const { traffic, sales, chat, bookings } = data
  const maxDay = Math.max(1, ...traffic.byDay.map((d) => d.views))
  // last 14 day-slots, padded so the chart always has a stable shape
  const series = traffic.byDay.slice(-14)

  return (
    <div>
      <div className="adm-panel-head">
        <div>
          <h2 className="adm-h2">Analytics</h2>
          <p className="adm-sub">
            Traffic is counted first-party with no cookies and no IPs stored.
            Sales come from paid orders recorded by the Stripe webhook.
          </p>
        </div>
        <select className="adm-select" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      <div className="adm-stats">
        <div className="adm-stat">
          <span className="adm-stat__label">Page views ({data.windowDays}d)</span>
          <span className="adm-stat__value">{traffic.totalViews}</span>
        </div>
        <div className="adm-stat">
          <span className="adm-stat__label">Visits ({data.windowDays}d)</span>
          <span className="adm-stat__value">{traffic.totalVisits}</span>
        </div>
        <div className="adm-stat">
          <span className="adm-stat__label">Revenue ({data.windowDays}d)</span>
          <span className="adm-stat__value">{money(sales.totalAmount, sales.currency)}</span>
        </div>
        <div className="adm-stat">
          <span className="adm-stat__label">Orders ({data.windowDays}d)</span>
          <span className="adm-stat__value">{sales.totalOrders}</span>
        </div>
        <div className="adm-stat">
          <span className="adm-stat__label">Chat members</span>
          <span className="adm-stat__value">{chat.members}</span>
        </div>
        <div className="adm-stat">
          <span className="adm-stat__label">Chat messages (7d)</span>
          <span className="adm-stat__value">{chat.messages7d}</span>
        </div>
      </div>

      <section className="adm-group">
        <h3 className="adm-h3">Views by day</h3>
        {series.length === 0 ? (
          <p className="adm-muted">Nothing counted yet — views appear as people open the site.</p>
        ) : (
          <div className="adm-bars" role="img" aria-label="Daily page views">
            {series.map((d) => (
              <div className="adm-bar-col" key={d.day} title={`${d.day}: ${d.views} views, ${d.visits} visits`}>
                <div className="adm-bar" style={{ height: `${Math.max(4, (d.views / maxDay) * 100)}%` }} />
                <span className="adm-bar__label">{d.day.slice(8)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="adm-cols">
        <section className="adm-group">
          <h3 className="adm-h3">Top pages</h3>
          {traffic.topPages.length === 0 ? (
            <p className="adm-muted">No traffic yet.</p>
          ) : (
            <table className="adm-table adm-table--tight">
              <tbody>
                {traffic.topPages.map((p) => (
                  <tr key={p.path}>
                    <td>{p.path}</td>
                    <td className="adm-nowrap">{p.views}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="adm-group">
          <h3 className="adm-h3">Who's buying what</h3>
          {sales.byItem.length === 0 ? (
            <p className="adm-muted">
              No recorded orders yet. Orders appear here once the Stripe webhook
              is connected and something sells.
            </p>
          ) : (
            <table className="adm-table adm-table--tight">
              <tbody>
                {sales.byItem.map((i) => (
                  <tr key={i.title}>
                    <td>{i.title}</td>
                    <td className="adm-nowrap">{i.count}×</td>
                    <td className="adm-nowrap">{money(i.amount, i.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {sales.recent.length > 0 && (
        <section className="adm-group">
          <h3 className="adm-h3">Recent orders</h3>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr><th>When</th><th>Item</th><th>Buyer</th><th>Amount</th></tr>
              </thead>
              <tbody>
                {sales.recent.map((o) => (
                  <tr key={o.id}>
                    <td className="adm-nowrap">{when(o.createdAt)}</td>
                    <td>{o.title || '—'}</td>
                    <td>
                      <strong>{o.name || '—'}</strong>
                      <br />
                      <span className="adm-muted">{o.email || '—'}</span>
                    </td>
                    <td className="adm-nowrap">{money(o.amount, o.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="adm-group">
        <h3 className="adm-h3">Community & bookings</h3>
        <div className="adm-stats">
          <div className="adm-stat">
            <span className="adm-stat__label">Chat members</span>
            <span className="adm-stat__value">{chat.members}</span>
          </div>
          <div className="adm-stat">
            <span className="adm-stat__label">Signed-in sessions</span>
            <span className="adm-stat__value">{chat.activeSessions}</span>
          </div>
          <div className="adm-stat">
            <span className="adm-stat__label">Messages, all time</span>
            <span className="adm-stat__value">{chat.messagesTotal}</span>
          </div>
          {['pending', 'confirmed', 'completed', 'cancelled'].map((s) =>
            bookings[s] ? (
              <div className="adm-stat" key={s}>
                <span className="adm-stat__label">Bookings {s}</span>
                <span className="adm-stat__value">{bookings[s]}</span>
              </div>
            ) : null,
          )}
        </div>
      </section>
    </div>
  )
}
