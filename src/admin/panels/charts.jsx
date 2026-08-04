/**
 * Small chart kit for the Analytics panel. Plain SVG, no library.
 *
 * Colors come from the --viz-* tokens in admin.css — a colorblind-validated
 * categorical palette, separate from the brand accents, checked against both
 * admin surfaces. Series keep a fixed slot (views is always --viz-1) so a
 * color never changes meaning between renders or views.
 */
import { useEffect, useMemo, useRef, useState } from 'react'

export const VIZ = [
  'var(--viz-1)',
  'var(--viz-2)',
  'var(--viz-3)',
  'var(--viz-4)',
  'var(--viz-5)',
]
export const VIZ_OTHER = 'var(--viz-other)'

/** Fold everything past the top N into a single "Other" row. */
export function foldTop(items, n = 5) {
  if (items.length <= n + 1) {
    return items.map((it, i) => ({ ...it, color: VIZ[i % VIZ.length] }))
  }
  const top = items.slice(0, n).map((it, i) => ({ ...it, color: VIZ[i] }))
  const rest = items.slice(n).reduce((s, it) => s + it.value, 0)
  return [...top, { label: 'Other', value: rest, color: VIZ_OTHER }]
}

/* Track the rendered width so SVG text stays at true pixel size instead of
   scaling with the card. */
function useMeasuredWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Read the initial size directly — ResizeObserver's first callback is
    // tied to frame rendering, which can be delayed in background tabs.
    setWidth(el.offsetWidth)
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

/* Clean axis maximum: 4 ticks of a 1/2/5×10ⁿ step. */
function niceScale(max) {
  const raw = Math.max(max, 4) / 4
  const pow = 10 ** Math.floor(Math.log10(raw))
  const m = raw / pow
  const step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * pow
  return { max: step * 4, step }
}

/* Bar with a rounded cap and a square baseline. */
function barPath(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h)
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`
}

const fmtDay = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })

/**
 * Daily time chart for one or two series. mode: 'bars' | 'line'.
 * series: [{ key, label, color }] — two at most, sharing one axis, so
 * never mix a money series with a count series.
 * fmt formats values for ticks and the tooltip (e.g. currency).
 */
export function TrafficChart({ data, mode, series, fmt }) {
  const format = fmt || ((v) => v.toLocaleString())
  const [wrapRef, width] = useMeasuredWidth()
  const [hover, setHover] = useState(null)

  const H = 220
  const pad = { t: 12, r: 8, b: 26, l: 44 }
  const W = Math.max(width, 280)
  const innerW = W - pad.l - pad.r
  const innerH = H - pad.t - pad.b

  const yTop = useMemo(
    () => niceScale(Math.max(1, ...data.flatMap((d) => series.map((s) => d[s.key] || 0)))),
    [data, series],
  )
  const y = (v) => pad.t + innerH - (v / yTop.max) * innerH
  const slot = innerW / data.length
  const xMid = (i) => pad.l + slot * i + slot / 2

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const fx = e.clientX - rect.left
    const i = Math.floor((fx - pad.l) / slot)
    setHover(i >= 0 && i < data.length ? i : null)
  }

  const ticks = [0, 1, 2, 3, 4].map((n) => n * yTop.step)
  const barW = Math.min(12, slot * 0.3)
  const hovered = hover != null ? data[hover] : null

  return (
    <div>
      {series.length > 1 && (
        <div className="adm-viz-legend" aria-hidden="true">
          {series.map((s) => (
            <span className="adm-viz-key" key={s.key}>
              <i className="adm-viz-swatch" style={{ background: s.color }} /> {s.label}
            </span>
          ))}
        </div>
      )}

      <div className="adm-viz-wrap" ref={wrapRef}>
        {width > 0 && (
          <svg
            width={W}
            height={H}
            role="img"
            aria-label={`Daily views and visits, ${data.length} days`}
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={pad.l}
                  x2={W - pad.r}
                  y1={y(t)}
                  y2={y(t)}
                  className={t === 0 ? 'adm-viz-axis' : 'adm-viz-grid'}
                />
                <text x={pad.l - 8} y={y(t) + 3.5} textAnchor="end" className="adm-viz-tick">
                  {format(t)}
                </text>
              </g>
            ))}

            {hover != null && (
              <rect
                x={pad.l + slot * hover}
                y={pad.t}
                width={slot}
                height={innerH}
                className="adm-viz-band"
              />
            )}

            {mode === 'bars'
              ? data.map((d, i) => {
                  const cx = xMid(i)
                  const w = series.length === 1 ? Math.min(18, slot * 0.5) : barW
                  return (
                    <g key={d.day}>
                      {series.map((s, si) => {
                        const v = d[s.key] || 0
                        if (v <= 0) return null
                        const x =
                          series.length === 1 ? cx - w / 2 : cx + (si === 0 ? -w - 1 : 1)
                        return (
                          <path
                            key={s.key}
                            d={barPath(x, y(v), w, y(0) - y(v), 4)}
                            fill={s.color}
                          />
                        )
                      })}
                    </g>
                  )
                })
              : series.map((s) => (
                  <g key={s.key}>
                    <polyline
                      points={data.map((d, i) => `${xMid(i)},${y(d[s.key] || 0)}`).join(' ')}
                      fill="none"
                      stroke={s.color}
                      strokeWidth="2"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                    {hover != null && (
                      <circle
                        cx={xMid(hover)}
                        cy={y(data[hover][s.key] || 0)}
                        r="4"
                        fill={s.color}
                        className="adm-viz-dot"
                      />
                    )}
                  </g>
                ))}

            {mode === 'line' && hover != null && (
              <line
                x1={xMid(hover)}
                x2={xMid(hover)}
                y1={pad.t}
                y2={pad.t + innerH}
                className="adm-viz-crosshair"
              />
            )}

            {data.map((d, i) => {
              const every = Math.ceil(data.length / Math.max(1, Math.floor(innerW / 44)))
              if (i % every !== 0) return null
              return (
                <text key={d.day} x={xMid(i)} y={H - 8} textAnchor="middle" className="adm-viz-tick">
                  {d.day.slice(8)}
                </text>
              )
            })}
          </svg>
        )}

        {hovered && (
          <div
            className="adm-viz-tip"
            style={{
              left: `${(xMid(hover) / W) * 100}%`,
              transform: `translateX(${hover > data.length / 2 ? 'calc(-100% - 10px)' : '10px'})`,
            }}
          >
            <strong>{fmtDay(hovered.day)}</strong>
            {series.map((s) => (
              <span key={s.key}>
                <i className="adm-viz-swatch" style={{ background: s.color }} /> {s.label}{' '}
                <b>{format(hovered[s.key] || 0)}</b>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Donut + list. items need {label, value, color}; format renders a value. */
export function Donut({ items, format, centerLabel }) {
  const total = items.reduce((s, it) => s + it.value, 0)
  const R = 52
  const SW = 20
  const C = 2 * Math.PI * R
  const gap = items.length > 1 ? 2.5 : 0

  let acc = 0
  const segs = items.map((it) => {
    const len = (it.value / total) * C
    const seg = { ...it, len: Math.max(len - gap, 0.5), offset: -acc }
    acc += len
    return seg
  })

  return (
    <div className="adm-donut-row">
      <svg
        width="132"
        height="132"
        viewBox="0 0 132 132"
        role="img"
        aria-label={`${centerLabel} breakdown`}
      >
        <g transform="rotate(-90 66 66)">
          {segs.map((s) => (
            <circle
              key={s.label}
              cx="66"
              cy="66"
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth={SW}
              strokeDasharray={`${s.len} ${C - s.len}`}
              strokeDashoffset={s.offset}
            />
          ))}
        </g>
        <text x="66" y="63" textAnchor="middle" className="adm-donut__total">
          {format ? format(total) : total.toLocaleString()}
        </text>
        <text x="66" y="79" textAnchor="middle" className="adm-donut__label">
          {centerLabel}
        </text>
      </svg>
      <BreakdownList items={items} format={format} total={total} />
    </div>
  )
}

/** The table-view twin: swatch, label, value, share. */
export function BreakdownList({ items, format, total }) {
  return (
    <ul className="adm-viz-list">
      {items.map((it) => (
        <li key={it.label}>
          <i className="adm-viz-swatch" style={{ background: it.color }} />
          <span className="adm-viz-list__label" title={it.label}>
            {it.label}
            {it.sub ? <em>{it.sub}</em> : null}
          </span>
          <span className="adm-viz-list__value">{format ? format(it.value) : it.value.toLocaleString()}</span>
          <span className="adm-viz-list__pct">{total ? `${Math.round((it.value / total) * 100)}%` : ''}</span>
        </li>
      ))}
    </ul>
  )
}

/** Horizontal-bar view of the same breakdown. */
export function BreakdownBars({ items, format }) {
  const max = Math.max(1, ...items.map((it) => it.value))
  return (
    <ul className="adm-viz-list adm-viz-list--bars">
      {items.map((it) => (
        <li key={it.label}>
          <span className="adm-viz-list__label" title={it.label}>
            {it.label}
            {it.sub ? <em>{it.sub}</em> : null}
          </span>
          <span className="adm-hbar">
            <span
              className="adm-hbar__fill"
              style={{ width: `${(it.value / max) * 100}%`, background: it.color }}
            />
          </span>
          <span className="adm-viz-list__value">{format ? format(it.value) : it.value.toLocaleString()}</span>
        </li>
      ))}
    </ul>
  )
}

/** One stacked bar for status counts (bookings). */
export function StatusBar({ items }) {
  const total = items.reduce((s, it) => s + it.value, 0)
  if (!total) return null
  return (
    <div>
      <div className="adm-statusbar" role="img" aria-label="Bookings by status">
        {items.map((it) => (
          <span
            key={it.label}
            style={{ flexGrow: it.value, background: it.color }}
            title={`${it.label}: ${it.value}`}
          />
        ))}
      </div>
      <div className="adm-viz-legend">
        {items.map((it) => (
          <span className="adm-viz-key" key={it.label}>
            <i className="adm-viz-swatch" style={{ background: it.color }} />
            {it.label} <b>{it.value}</b>
          </span>
        ))}
      </div>
    </div>
  )
}

/** Tiny segmented control for switching chart views. */
export function VizToggle({ value, onChange, options }) {
  return (
    <div className="adm-viz-toggle" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={value === o.value ? 'is-active' : ''}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
