import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { confirmDialog } from '../confirm.jsx'

const BLANK = {
  title: '',
  description: '',
  price: '',
  tag: '',
  cta: 'Get in touch',
  href: '#book',
  accent: 'navy',
  order: 0,
  visible: true,
}

/**
 * The service cards on the landing page ("Services" section). Cards are
 * display + link only — the price is text, and the link usually points at
 * #book (the coaching calendar) or a contact address. Paid checkout stays
 * in the Shop tab.
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
      message: 'The service is removed permanently — this cannot be undone.',
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
                <th>Link</th>
                <th>Visible</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td>{it.order}</td>
                  <td>
                    <strong>{it.title}</strong>
                    <br />
                    <span className="adm-muted">{it.description?.slice(0, 60)}</span>
                  </td>
                  <td className="adm-nowrap">{it.price || '—'}</td>
                  <td className="adm-note">{it.href}</td>
                  <td>
                    <button className="adm-mini" onClick={() => toggleVisible(it)}>
                      {it.visible ? 'Visible' : 'Hidden'}
                    </button>
                  </td>
                  <td className="adm-actions">
                    <button className="adm-mini" onClick={() => setDraft({ ...it })}>
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
                ['href', 'Link URL (#book jumps to the calendar)'],
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
                  {['navy', 'umber', 'olive', 'amber'].map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>

              <div className="adm-field adm-field--wide">
                <label htmlFor="svc-desc">Description</label>
                <textarea
                  id="svc-desc"
                  rows={3}
                  value={draft.description ?? ''}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </div>
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
