import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { BreakdownBars, Donut, TrafficChart, VIZ, VizToggle, foldTop } from './charts.jsx'

const money = (cents, currency = 'cad') =>
  new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: (currency || 'cad').toUpperCase(),
  }).format((cents ?? 0) / 100)

const when = (iso) => new Date(iso).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })

/* Pad to a continuous run of calendar days so quiet days show as zero
   instead of silently disappearing from the time axis. Revenue arrives in
   cents and is converted to dollars for the chart. */
const padDays = (activity, n) => {
  const map = new Map(activity.map((d) => [d.day, d]))
  return Array.from({ length: n }, (_, i) => {
    const day = new Date(Date.now() - (n - 1 - i) * 86400000).toISOString().slice(0, 10)
    const row = map.get(day) || {}
    return {
      day,
      views: row.views || 0,
      visits: row.visits || 0,
      revenue: (row.revenue || 0) / 100,
      orders: row.orders || 0,
      messages: row.messages || 0,
      newMembers: row.newMembers || 0,
    }
  })
}

/* The chart's metric filter. Colors are fixed per metric so a metric never
   changes color between visits. Revenue plots alone — dollars can't share
   an axis with counts. */
const METRICS = {
  traffic: {
    label: 'Views & visits',
    series: [
      { key: 'views', label: 'Views', color: VIZ[0] },
      { key: 'visits', label: 'Visits', color: VIZ[1] },
    ],
  },
  views: { label: 'Page views', series: [{ key: 'views', label: 'Page views', color: VIZ[0] }] },
  visits: { label: 'Visits', series: [{ key: 'visits', label: 'Visits', color: VIZ[1] }] },
  revenue: {
    label: 'Revenue',
    money: true,
    series: [{ key: 'revenue', label: 'Revenue', color: VIZ[2] }],
  },
  orders: { label: 'Orders', series: [{ key: 'orders', label: 'Orders', color: VIZ[3] }] },
  newMembers: {
    label: 'New chat members',
    series: [{ key: 'newMembers', label: 'New chat members', color: VIZ[4] }],
  },
  messages: {
    label: 'Chat messages',
    series: [{ key: 'messages', label: 'Chat messages', color: VIZ[1] }],
  },
}

export default function AnalyticsPanel({ notify }) {
  const [data, setData] = useState(null)
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)
  const [trafficView, setTrafficView] = useState('bars')
  const [metric, setMetric] = useState('traffic')
  const [pagesView, setPagesView] = useState('share')
  const [salesView, setSalesView] = useState('share')

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

  const { traffic, sales, chat } = data
  const series = padDays(data.activity || traffic.byDay, Math.min(data.windowDays, 14))
  const chosen = METRICS[metric]
  const chartFmt = chosen.money
    ? (v) =>
        new Intl.NumberFormat('en-CA', {
          style: 'currency',
          currency: (sales.currency || 'cad').toUpperCase(),
          maximumFractionDigits: 0,
        }).format(v)
    : undefined

  const pageItems = foldTop(traffic.topPages.map((p) => ({ label: p.path, value: p.views })))
  const saleItems = foldTop(
    sales.byItem.map((i) => ({
      label: i.title,
      value: i.amount,
      sub: `${i.count}×`,
      currency: i.currency,
    })),
  )
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
          <span className="adm-stat__label">New chat members ({data.windowDays}d)</span>
          <span className="adm-stat__value">{chat.newMembers}</span>
        </div>
        <div className="adm-stat">
          <span className="adm-stat__label">Chat messages ({data.windowDays}d)</span>
          <span className="adm-stat__value">{chat.messagesWindow}</span>
        </div>
      </div>

      <section className="adm-group">
        <div className="adm-group-head">
          <h3 className="adm-h3">Activity by day</h3>
          <div className="adm-inline">
            <select
              className="adm-select"
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              aria-label="Which metric to chart"
            >
              {Object.entries(METRICS).map(([id, m]) => (
                <option key={id} value={id}>
                  {m.label}
                </option>
              ))}
            </select>
            <VizToggle
              value={trafficView}
              onChange={setTrafficView}
              options={[
                { value: 'bars', label: 'Bars' },
                { value: 'line', label: 'Line' },
              ]}
            />
          </div>
        </div>
        <TrafficChart data={series} mode={trafficView} series={chosen.series} fmt={chartFmt} />
      </section>

      <div className="adm-cols">
        <section className="adm-group">
          <div className="adm-group-head">
            <h3 className="adm-h3">Where views go</h3>
            {pageItems.length > 0 && (
              <VizToggle
                value={pagesView}
                onChange={setPagesView}
                options={[
                  { value: 'share', label: 'Share' },
                  { value: 'bars', label: 'Bars' },
                ]}
              />
            )}
          </div>
          {pageItems.length === 0 ? (
            <p className="adm-muted">No traffic yet.</p>
          ) : pagesView === 'share' ? (
            <Donut items={pageItems} centerLabel="views" />
          ) : (
            <BreakdownBars items={pageItems} />
          )}
        </section>

        <section className="adm-group">
          <div className="adm-group-head">
            <h3 className="adm-h3">Revenue by item</h3>
            {saleItems.length > 0 && (
              <VizToggle
                value={salesView}
                onChange={setSalesView}
                options={[
                  { value: 'share', label: 'Share' },
                  { value: 'bars', label: 'Bars' },
                ]}
              />
            )}
          </div>
          {saleItems.length === 0 ? (
            <p className="adm-muted">
              No recorded orders yet. Orders appear here once the Stripe webhook
              is connected and something sells.
            </p>
          ) : salesView === 'share' ? (
            <Donut
              items={saleItems}
              centerLabel="revenue"
              format={(v) => money(v, sales.currency)}
            />
          ) : (
            <BreakdownBars items={saleItems} format={(v) => money(v, sales.currency)} />
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

    </div>
  )
}
