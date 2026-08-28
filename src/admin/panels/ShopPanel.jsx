import { useEffect, useState } from 'react'
import { api } from '../api.js'
import ImageDrop from '../ImageDrop.jsx'
import PdfDrop from '../PdfDrop.jsx'
import { confirmDialog } from '../confirm.jsx'

const BLANK = {
  kind: 'product',
  title: '',
  description: '',
  image: '',
  price: '',
  oldPrice: '',
  amount: '', // dollars, converted to priceCents on save
  currency: 'cad',
  cta: 'Get it',
  href: '#',
  accent: 'navy',
  tag: '',
  rating: '',
  order: 0,
  visible: true,
  pdfFile: '',
  pdfName: '',
}

/** Stripe works in cents; the form works in dollars. */
const toCents = (dollars) => {
  const n = Number(String(dollars).replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null
}
const toDollars = (cents) => (cents ? (cents / 100).toFixed(2) : '')

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
    for (const k of ['price', 'oldPrice', 'tag', 'rating', 'image', 'pdfFile', 'pdfName']) {
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

    // A PDF item is a paywalled download — it needs the file and a charge,
    // or there is nothing to sell and nothing to gate it behind.
    if (payload.kind === 'pdf') {
      if (!payload.pdfFile) {
        notify('Upload the PDF first.', 'error')
        return
      }
      if (!payload.priceCents) {
        notify('Set a charge amount. The PDF is only sent after payment.', 'error')
        return
      }
    }

    if (!payload.priceCents) {
      payload.currency = null
      // The single most common mistake: filling the display "Price" but
      // not the Charge amount, then wondering why clicking doesn't open
      // checkout. Make saving that state a conscious choice.
      if (payload.kind === 'product') {
        const ok = await confirmDialog({
          title: 'Save without a charge amount?',
          message:
            'No Charge amount is set, so this card will NOT open checkout. ' +
            'It will just follow its link.',
          confirmLabel: 'Save anyway',
        })
        if (!ok) return
      }
    }

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
    const ok = await confirmDialog({
      title: `Delete "${item.title}"?`,
      message: 'The item is removed permanently. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
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

  /**
   * A direct Stripe link for this product, copied to the clipboard —
   * for DMing a customer without sending them through the site. Minted
   * server-side with the item's metadata so the download email and the
   * Payments tab work exactly like a site purchase.
   */
  async function copyPayLink(item) {
    try {
      const { url } = await api.shopPayLink(item.id)
      try {
        await navigator.clipboard.writeText(url)
        notify('Payment link copied — paste it straight into a DM or email.')
      } catch {
        notify(url) // clipboard blocked — show it to copy by hand
      }
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  /** The site link that opens this product's checkout popup directly —
   *  cover, full description and payment form in one. */
  async function copyPopupLink(item) {
    const url = `${window.location.origin}/?buy=${item.id}`
    try {
      await navigator.clipboard.writeText(url)
      notify('Popup link copied — it opens the site with this product’s checkout already open.')
    } catch {
      notify(url)
    }
  }

  /** One tap swaps the card with its neighbour. Every row's order is
   *  renumbered to its list position on the way, so ties (two items both
   *  at 0) come apart the first time anything moves. */
  async function move(i, delta) {
    const j = i + delta
    if (j < 0 || j >= items.length) return
    const next = [...items]
    ;[next[i], next[j]] = [next[j], next[i]]
    try {
      await Promise.all(
        next
          .map((it, idx) => (it.order === idx ? null : api.updateShopItem(it.id, { order: idx })))
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
          <h2 className="adm-h2">Products</h2>
          <p className="adm-sub">
            The cards under “Products”. Order controls the sequence; hidden
            items stay off the public site.
          </p>
        </div>
        <div className="adm-toolbar">
          <button
            className="adm-mini"
            onClick={() =>
              setDraft({ ...BLANK, kind: 'pdf', cta: 'Get the PDF', href: '#' })
            }
          >
            Add PDF content
          </button>
          <button className="btn btn--primary adm-save" onClick={() => setDraft({ ...BLANK })}>
            Add item
          </button>
        </div>
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
                    {it.kind === 'pdf' && <span className="adm-pill" style={{ marginLeft: 8 }}>PDF</span>}
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
                    {Boolean(it.priceCents) && (
                      <>
                        <button
                          className="adm-mini"
                          title="Copy a link that opens the site with this product’s checkout popup already open — cover, full description and payment together."
                          onClick={() => copyPopupLink(it)}
                        >
                          Copy popup link
                        </button>
                        <button
                          className="adm-mini"
                          title="Copy a bare Stripe-hosted payment page for this product. Delivery works exactly like a site purchase."
                          onClick={() => copyPayLink(it)}
                        >
                          Copy pay link
                        </button>
                      </>
                    )}
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
                  <option value="pdf">PDF download (paid)</option>
                </select>
              </div>

              <div className="adm-field">
                <label htmlFor="shop-accent">Accent</label>
                <select
                  id="shop-accent"
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

              {draft.kind === 'pdf' && (
                <div className="adm-field adm-field--wide">
                  <label>The PDF</label>
                  <PdfDrop
                    value={draft.pdfName || draft.pdfFile || ''}
                    notify={notify}
                    onUploaded={(filename, name) =>
                      setDraft({ ...draft, pdfFile: filename, pdfName: name })
                    }
                    hint="Kept private. Buyers get an emailed download link only after Stripe confirms their payment."
                  />
                </div>
              )}

              <div className="adm-field adm-field--wide">
                <label>Card image</label>
                <ImageDrop
                  slot="shop"
                  value={draft.image || ''}
                  notify={notify}
                  onUploaded={(url) => setDraft({ ...draft, image: url })}
                  hint="Optional. Shown at the top of the card, cropped to 16:9."
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
                <label htmlFor="shop-desc">Description</label>
                <textarea
                  id="shop-desc"
                  rows={3}
                  value={draft.description ?? ''}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </div>

              {/* This is the field that actually turns the card into a
                  purchase. Without it the card is just a link. */}
              <div className="adm-field">
                <label htmlFor="shop-amount">Charge amount</label>
                <input
                  id="shop-amount"
                  type="number"
                  step="0.01"
                  min="0.50"
                  placeholder="39.00"
                  value={draft.amount ?? ''}
                  onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                />
              </div>

              <div className="adm-field">
                <label htmlFor="shop-currency">Currency</label>
                <select
                  id="shop-currency"
                  value={draft.currency || 'cad'}
                  onChange={(e) => setDraft({ ...draft, currency: e.target.value })}
                >
                  <option value="cad">CAD</option>
                  <option value="usd">USD</option>
                </select>
              </div>

              <p className="adm-sub adm-field--wide">
                Set a <strong>charge amount</strong> and clicking the card opens
                Stripe Checkout. Leave it blank and the card just follows its link
                instead. The “Price” field above is the text shown on the card.
                This is the money that actually moves.
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
