import { useEffect, useState } from 'react'
import { api } from '../api.js'
import ImageDrop from '../ImageDrop.jsx'
import { confirmDialog } from '../confirm.jsx'

const BLANK = {
  title: '',
  description: '',
  image: '',
  price: '',
  tag: '',
  amount: '', // dollars, converted to priceCents on save
  currency: 'cad',
  cta: 'Get in touch',
  href: '#book',
  accent: 'navy',
  order: 0,
  visible: true,
}

/** Stripe works in cents; the form works in dollars. */
const toCents = (dollars) => {
  const n = Number(String(dollars).replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null
}
const toDollars = (cents) => (cents ? (cents / 100).toFixed(2) : '')

/**
 * The service cards on the landing page ("Services" section). A service
 * with a charge amount opens Stripe Checkout when clicked, exactly like a
 * paid shop item; without one the card just follows its link (a URL or a
 * contact address; '#book' only jumps anywhere while the coaching
 * calendar section is on the landing page).
 */
export default function ServicesPanel({ notify }) {
  const [items, setItems] = useState([])
  const [draft, setDraft] = useState(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      setItems(await api.listServices())
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function save() {
    if (!draft.title.trim()) {
      notify('Give the service a title.', 'error')
      return
    }
    const payload = { ...draft }
    for (const k of ['price', 'tag']) {
      if (!payload[k]) payload[k] = null
    }
    payload.order = Number(payload.order) || 0

    // The dollars field is form-only; the server stores cents.
    payload.priceCents = toCents(draft.amount)
    delete payload.amount
    if (payload.priceCents && payload.priceCents < 50) {
      notify('Stripe’s minimum charge is 50 cents.', 'error')
      return
    }
    if (!payload.priceCents) payload.currency = null

    try {
      if (draft.id) await api.updateService(draft.id, payload)
      else await api.createService(payload)
      notify(draft.id ? 'Service updated.' : 'Service added.')
      setDraft(null)
      load()
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  async function remove(item) {
    const ok = await confirmDialog({
      title: `Delete "${item.title}"?`,
      message: 'The service is removed permanently. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    try {
      await api.deleteService(item.id)
      notify('Service deleted.')
      load()
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  async function toggleVisible(item) {
    try {
      await api.updateService(item.id, { visible: !item.visible })
      load()
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  /** One tap swaps the card with its neighbour; orders renumber to list
   *  positions so ties come apart the first time anything moves. */
  async function move(i, delta) {
    const j = i + delta
    if (j < 0 || j >= items.length) return
    const next = [...items]
    ;[next[i], next[j]] = [next[j], next[i]]
    try {
      await Promise.all(
        next
          .map((it, idx) => (it.order === idx ? null : api.updateService(it.id, { order: idx })))
          .filter(Boolean),
      )
      load()
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  return (
    <div>
      <div className="adm-panel-head">
        <div>
          <h2 className="adm-h2">Services</h2>
          <p className="adm-sub">
            The cards in the “Services” section on the public site. Order
            controls the sequence; hidden services stay off the page, and an
            empty list hides the whole section.
          </p>
        </div>
        <button className="btn btn--primary adm-save" onClick={() => setDraft({ ...BLANK })}>
          Add service
        </button>
      </div>

      {loading ? (
        <p className="adm-muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="adm-muted">
          No services yet. Add one and the “Services” section appears on the
          public site (you can position it from the Content tab).
        </p>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Title</th>
                <th>Price</th>
                <th>Checkout</th>
                <th>Link</th>
                <th>Visible</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={it.id}>
                  <td className="adm-nowrap">
                    <span className="adm-move">
                      <button
                        type="button"
                        className="adm-move__btn"
                        title="Move up"
                        aria-label={`Move ${it.title} up`}
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="adm-move__btn"
                        title="Move down"
                        aria-label={`Move ${it.title} down`}
                        disabled={i === items.length - 1}
                        onClick={() => move(i, 1)}
                      >
                        ↓
                      </button>
                    </span>
                  </td>
                  <td>
                    <strong>{it.title}</strong>
                    <br />
                    <span className="adm-muted">{it.description?.slice(0, 60)}</span>
                  </td>
                  <td className="adm-nowrap">{it.price || '—'}</td>
                  <td className="adm-nowrap">
                    {it.priceCents ? (
                      <span className="adm-pill adm-pill--confirmed">
                        {toDollars(it.priceCents)} {(it.currency || 'cad').toUpperCase()}
                      </span>
                    ) : (
                      <span className="adm-pill">link only</span>
                    )}
                  </td>
                  <td className="adm-note">{it.href}</td>
                  <td>
                    <button className="adm-mini" onClick={() => toggleVisible(it)}>
                      {it.visible ? 'Visible' : 'Hidden'}
                    </button>
                  </td>
                  <td className="adm-actions">
                    <button
                      className="adm-mini"
                      onClick={() => setDraft({ ...it, amount: toDollars(it.priceCents) })}
                    >
                      Edit
                    </button>
                    <button className="adm-mini adm-mini--danger" onClick={() => remove(it)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {draft && (
        <div className="adm-modal" role="dialog" aria-modal="true">
          <div className="adm-modal__card adm-modal__card--wide">
            <h3 className="adm-h3">{draft.id ? 'Edit service' : 'New service'}</h3>

            <div className="adm-grid">
              {[
                ['title', 'Title'],
                ['price', 'Price (e.g. $150 / session)'],
                ['tag', 'Tag (e.g. Most popular)'],
                ['cta', 'Button text'],
                ['href', 'Link URL (ignored when a charge amount is set)'],
                ['order', 'Order'],
              ].map(([key, label]) => (
                <div className="adm-field" key={key}>
                  <label htmlFor={`svc-${key}`}>{label}</label>
                  <input
                    id={`svc-${key}`}
                    type={key === 'order' ? 'number' : 'text'}
                    value={draft[key] ?? ''}
                    onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                  />
                </div>
              ))}

              <div className="adm-field">
                <label htmlFor="svc-accent">Accent</label>
                <select
                  id="svc-accent"
                  value={draft.accent}
                  onChange={(e) => setDraft({ ...draft, accent: e.target.value })}
                >
                  {['navy', 'red', 'umber', 'olive', 'amber'].map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>

              <div className="adm-field adm-field--wide">
                <label>Card image</label>
                <ImageDrop
                  slot="service"
                  value={draft.image || ''}
                  notify={notify}
                  onUploaded={(url) => setDraft({ ...draft, image: url })}
                  hint="Optional. Shown at the top of the card, cropped to 16:9 — and on the audit's own page."
                />
                {draft.image && (
                  <button
                    type="button"
                    className="adm-mini adm-mini--danger"
                    onClick={() => setDraft({ ...draft, image: '' })}
                  >
                    Remove image
                  </button>
                )}
              </div>

              <div className="adm-field adm-field--wide">
                <label htmlFor="svc-desc">Description</label>
                <textarea
                  id="svc-desc"
                  rows={6}
                  value={draft.description ?? ''}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
                <p className="adm-hint">
                  The card on the landing page shows just the first two lines —
                  the service’s own page shows everything written here. Style
                  your text as you type: <strong>**word**</strong> shows as{' '}
                  <strong>bold</strong>, <em>*word*</em> as <em>italics</em>,
                  and any line that starts with <strong>-&nbsp;</strong>{' '}
                  becomes a bullet point. Press Enter for a new paragraph.
                </p>
              </div>

              {/* Fill this in to sell the service through Stripe. */}
              <div className="adm-field">
                <label htmlFor="svc-amount">Charge amount</label>
                <input
                  id="svc-amount"
                  type="number"
                  step="0.01"
                  min="0.50"
                  placeholder="150.00"
                  value={draft.amount ?? ''}
                  onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                />
              </div>

              <div className="adm-field">
                <label htmlFor="svc-currency">Currency</label>
                <select
                  id="svc-currency"
                  value={draft.currency || 'cad'}
                  onChange={(e) => setDraft({ ...draft, currency: e.target.value })}
                >
                  <option value="cad">CAD</option>
                  <option value="usd">USD</option>
                </select>
              </div>

              <p className="adm-sub adm-field--wide">
                Set a <strong>charge amount</strong> and clicking the card opens
                Stripe Checkout. The customer pays right there. Leave it blank
                and the card just follows its link. The “Price” field above is
                only the text shown on the card.
              </p>
            </div>

            <div className="adm-modal__actions">
              <button className="adm-mini" onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button className="btn btn--primary adm-save" onClick={save}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
