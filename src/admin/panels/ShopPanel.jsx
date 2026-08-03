import { useEffect, useState } from 'react'
import { api } from '../api.js'

const BLANK = {
  kind: 'product',
  title: '',
  description: '',
  price: '',
  oldPrice: '',
  cta: 'Get it',
  href: '#',
  accent: 'navy',
  tag: '',
  rating: '',
  order: 0,
  visible: true,
}

export default function ShopPanel({ notify }) {
  const [items, setItems] = useState([])
  const [draft, setDraft] = useState(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      setItems(await api.listShop())
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
      notify('Give the item a title.', 'error')
      return
    }
    // Strip empty optional strings so they store as absent, not "".
    const payload = { ...draft }
    for (const k of ['price', 'oldPrice', 'tag', 'rating']) {
      if (!payload[k]) payload[k] = null
    }
    payload.order = Number(payload.order) || 0

    try {
      if (draft.id) await api.updateShopItem(draft.id, payload)
      else await api.createShopItem(payload)
      notify(draft.id ? 'Item updated.' : 'Item added.')
      setDraft(null)
      load()
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  async function remove(item) {
    if (!confirm(`Delete "${item.title}"? This cannot be undone.`)) return
    try {
      await api.deleteShopItem(item.id)
      notify('Item deleted.')
      load()
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  async function toggleVisible(item) {
    try {
      await api.updateShopItem(item.id, { visible: !item.visible })
      load()
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  return (
    <div>
      <div className="adm-panel-head">
        <div>
          <h2 className="adm-h2">Shop items</h2>
          <p className="adm-sub">
            The cards under “Where to start”. Order controls the sequence; hidden
            items stay off the public site.
          </p>
        </div>
        <button className="btn btn--primary adm-save" onClick={() => setDraft({ ...BLANK })}>
          Add item
        </button>
      </div>

      {loading ? (
        <p className="adm-muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="adm-muted">
          No items stored yet. Until you add some, the site shows the built-in
          defaults from content.js.
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
            <h3 className="adm-h3">{draft.id ? 'Edit item' : 'New item'}</h3>

            <div className="adm-grid">
              {[
                ['title', 'Title'],
                ['price', 'Price (e.g. $39)'],
                ['oldPrice', 'Was price'],
                ['cta', 'Button text'],
                ['href', 'Link URL'],
                ['tag', 'Tag (e.g. Most popular)'],
                ['rating', 'Rating (e.g. 5.0)'],
                ['order', 'Order'],
              ].map(([key, label]) => (
                <div className="adm-field" key={key}>
                  <label htmlFor={`shop-${key}`}>{label}</label>
                  <input
                    id={`shop-${key}`}
                    type={key === 'order' ? 'number' : 'text'}
                    value={draft[key] ?? ''}
                    onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                  />
                </div>
              ))}

              <div className="adm-field">
                <label htmlFor="shop-kind">Kind</label>
                <select
                  id="shop-kind"
                  value={draft.kind}
                  onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
                >
                  <option value="product">Product (shows a price)</option>
                  <option value="link">Link (no price)</option>
                </select>
              </div>

              <div className="adm-field">
                <label htmlFor="shop-accent">Accent</label>
                <select
                  id="shop-accent"
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
                <label htmlFor="shop-desc">Description</label>
                <textarea
                  id="shop-desc"
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
