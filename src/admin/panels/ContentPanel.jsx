import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { confirmDialog } from '../confirm.jsx'
import * as defaults from '../../content.js'

/**
 * Edits the text in each container on the public site, and the order the
 * containers appear in. Containers can be dragged (or arrowed) into a new
 * order, and new custom containers can be added with their own fields.
 *
 * Only the fields worth editing are exposed, rather than a raw JSON blob —
 * a stray comma in hand-edited JSON would take the live site down.
 * Clearing a field deletes that text from the live site; deleting a whole
 * container's content hides its section entirely.
 */

/**
 * Every built-in reorderable section on the public page, in default order.
 * Sections without a `fields` entry in FIELDS are managed elsewhere but can
 * still be moved. Profile isn't here — it's the side rail, always first.
 * Custom containers are appended dynamically from the stored `custom` list.
 */
const SECTIONS_META = [
  { id: 'featuredVideo', label: 'Featured video' },
  { id: 'featured', label: 'Featured offer', note: 'Off by default — switch it on in content.js.' },
  { id: 'offers', label: 'The catalog', note: 'Cards are managed in the Shop tab.' },
  { id: 'services', label: 'Services', note: 'Cards are managed in the Services tab.' },
  { id: 'booking', label: 'Coaching / calendar' },
  { id: 'groupChat', label: 'Group chat', note: 'Managed in the Community tab.' },
  { id: 'about', label: 'About ("Hey, I’m Nate")' },
  { id: 'newsletter', label: 'Newsletter' },
  { id: 'testimonials', label: 'Testimonials', note: 'Hidden until quotes are added in content.js.' },
  { id: 'faqs', label: 'FAQ' },
]

const FIELDS = [
  {
    group: 'profile',
    label: 'Profile',
    fields: [
      { key: 'name', label: 'Name' },
      { key: 'handle', label: 'Handle' },
      { key: 'tagline', label: 'Tagline' },
      { key: 'blurb', label: 'Blurb', textarea: true },
      { key: 'location', label: 'Location' },
      { key: 'trust', label: 'Trust line' },
    ],
  },
  {
    group: 'featuredVideo',
    label: 'Featured video',
    fields: [
      { key: 'title', label: 'Title' },
      { key: 'subtitle', label: 'Subtitle' },
      { key: 'blurb', label: 'Blurb', textarea: true },
      { key: 'href', label: 'YouTube URL (blank = no video shown)' },
      { key: 'cta', label: 'Button text' },
    ],
  },
  {
    group: 'about',
    label: 'About ("Hey, I’m Nate")',
    fields: [
      { key: 'eyebrow', label: 'Eyebrow' },
      { key: 'heading', label: 'Heading' },
      { key: 'paragraphsText', label: 'Paragraphs (one per line)', textarea: true, rows: 8 },
      { key: 'signature', label: 'Signature' },
    ],
  },
  {
    group: 'newsletter',
    label: 'Newsletter',
    fields: [
      { key: 'name', label: 'Name' },
      { key: 'cadence', label: 'Cadence' },
      { key: 'description', label: 'Description', textarea: true },
      { key: 'bonus', label: 'Bonus line', textarea: true },
      { key: 'subscribers', label: 'Subscriber count' },
      { key: 'cta', label: 'Button text' },
    ],
  },
  {
    group: 'booking',
    label: 'Coaching / calendar',
    fields: [
      { key: 'title', label: 'Title' },
      { key: 'description', label: 'Description', textarea: true },
      { key: 'duration', label: 'Duration' },
      { key: 'price', label: 'Price' },
      { key: 'timezone', label: 'Timezone label' },
      { key: 'finePrint', label: 'Fine print', textarea: true },
    ],
  },
]

const ACCENTS = ['navy', 'umber', 'olive', 'amber']

const FIELDS_BY_GROUP = Object.fromEntries(FIELDS.map((f) => [f.group, f]))
const KNOWN_KEYS = new Set([
  'sections',
  'archived',
  'custom',
  'faqs',
  ...FIELDS.map((f) => f.group),
])

/** About stores paragraphs as an array; the textarea works in lines. */
function toForm(stored) {
  const out = {}
  for (const { group } of FIELDS) {
    out[group] = { ...(defaults[group] || {}), ...(stored[group] || {}) }
  }
  out.about.paragraphsText = (out.about.paragraphs || []).join('\n')

  out.faqs = (Array.isArray(stored.faqs) ? stored.faqs : defaults.faqs || []).map(
    (f) => ({ q: f.q || '', a: f.a || '' }),
  )

  out.custom = (Array.isArray(stored.custom) ? stored.custom : [])
    .filter((c) => c && c.id)
    .map((c) => ({
      id: c.id,
      title: c.title || '',
      accent: ACCENTS.includes(c.accent) ? c.accent : 'navy',
      fields: (c.fields || []).map((f, i) => ({
        id: f.id || `${c.id}-f${i}`,
        label: f.label || '',
        value: f.value || '',
      })),
    }))

  // Stored order first (unknown ids dropped), then anything new at the end
  // so a section added in a later deploy can't silently vanish. Archived
  // sections live in their own list and must not be re-appended here.
  const ids = [...SECTIONS_META.map((s) => s.id), ...out.custom.map((c) => c.id)]
  out.archived = (Array.isArray(stored.archived) ? stored.archived : []).filter(
    (id) => ids.includes(id),
  )
  const storedOrder = Array.isArray(stored.sections) ? stored.sections : []
  out.sections = [
    ...storedOrder.filter((id) => ids.includes(id) && !out.archived.includes(id)),
    ...ids.filter((id) => !storedOrder.includes(id) && !out.archived.includes(id)),
  ]

  // Saving overwrites the whole stored document, so any keys this panel
  // doesn't know about must ride along untouched.
  out._extra = {}
  for (const [k, v] of Object.entries(stored)) {
    if (!KNOWN_KEYS.has(k)) out._extra[k] = v
  }
  return out
}

function toPayload(form) {
  const out = { ...form._extra, sections: form.sections, archived: form.archived }
  for (const { group } of FIELDS) out[group] = { ...form[group] }
  out.about.paragraphs = (out.about.paragraphsText || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  delete out.about.paragraphsText

  out.faqs = form.faqs
    .map((f) => ({ q: f.q.trim(), a: f.a.trim() }))
    .filter((f) => f.q || f.a)

  out.custom = form.custom.map((c) => ({
    id: c.id,
    title: c.title.trim(),
    accent: c.accent,
    fields: c.fields
      .map((f) => ({ id: f.id, label: f.label.trim(), value: f.value }))
      .filter((f) => f.label || f.value.trim()),
  }))
  return out
}

export default function ContentPanel({ notify }) {
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [dragIndex, setDragIndex] = useState(null)

  useEffect(() => {
    api
      .getContent()
      .then((stored) => setForm(toForm(stored || {})))
      .catch((err) => {
        notify(`Could not load content: ${err.message}`, 'error')
        setForm(toForm({}))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function save() {
    setSaving(true)
    try {
      await api.saveContent(toPayload(form))
      notify('Content saved. Refresh the public site to see it.')
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  function setField(group, key, value) {
    setForm((f) => ({ ...f, [group]: { ...f[group], [key]: value } }))
  }

  function onDragStart(e, index) {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    // Firefox won't start a drag without data attached.
    e.dataTransfer.setData('text/plain', String(index))
    // Drag the whole container visually, not just the little handle.
    const card = e.currentTarget.closest('.adm-group')
    if (card) e.dataTransfer.setDragImage(card, 24, 24)
  }

  /** Reorder live while hovering, so the list previews the drop. */
  function onDragOver(e, index) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragIndex === null || dragIndex === index) return
    setForm((f) => {
      const next = [...f.sections]
      const [moved] = next.splice(dragIndex, 1)
      next.splice(index, 0, moved)
      return { ...f, sections: next }
    })
    setDragIndex(index)
  }

  function removeCustom(id) {
    setForm((f) => ({
      ...f,
      custom: f.custom.filter((c) => c.id !== id),
      sections: f.sections.filter((s) => s !== id),
      archived: f.archived.filter((s) => s !== id),
    }))
  }

  function clearGroupFields(id) {
    if (id === 'faqs') {
      setForm((f) => ({ ...f, faqs: [] }))
      return
    }
    const cleared = {}
    for (const fld of FIELDS_BY_GROUP[id].fields) cleared[fld.key] = ''
    setForm((f) => ({ ...f, [id]: { ...f[id], ...cleared } }))
  }

  /**
   * Every container carries the same Delete button; what it does depends
   * on what the container is. Custom ones are removed outright, ones with
   * fields here are cleared, and ones whose cards live in another tab are
   * archived instead — their data isn't ours to delete from this page.
   * Always name-verified: this is the destructive path.
   */
  async function deleteSection(id) {
    const meta = id === 'profile' ? { label: 'Profile' } : metaFor(id)
    if (!meta) return
    const isCustom = Boolean(meta.customContainer)
    const hasFields = Boolean(FIELDS_BY_GROUP[id]) || id === 'faqs'
    const ok = await confirmDialog({
      title: `Delete "${meta.label}"?`,
      message: isCustom
        ? 'The container and everything in it are removed for good once you save.'
        : hasFields
          ? 'Everything written in this container is permanently cleared once you save.'
          : 'The cards in this section are managed in another tab, so nothing is deleted here — the section moves to Archived and comes off the public page once you save.',
      confirmLabel: 'Delete',
      danger: true,
      verifyText: meta.label,
    })
    if (!ok) return
    if (isCustom) removeCustom(id)
    else if (hasFields) clearGroupFields(id)
    else archiveSection(id)
  }

  function archiveSection(id) {
    setForm((f) => ({
      ...f,
      sections: f.sections.filter((s) => s !== id),
      archived: [...f.archived, id],
    }))
  }

  function restoreSection(id) {
    setForm((f) => ({
      ...f,
      archived: f.archived.filter((s) => s !== id),
      sections: [...f.sections, id],
    }))
  }

  function addContainer() {
    const id = `custom-${Date.now().toString(36)}`
    setForm((f) => ({
      ...f,
      custom: [
        ...f.custom,
        {
          id,
          title: '',
          accent: 'navy',
          fields: [{ id: `${id}-f0`, label: '', value: '' }],
        },
      ],
      sections: [...f.sections, id],
    }))
  }

  function setCustom(id, patch) {
    setForm((f) => ({
      ...f,
      custom: f.custom.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }))
  }

  function addField(container) {
    setCustom(container.id, {
      fields: [
        ...container.fields,
        { id: `${container.id}-f${Date.now().toString(36)}`, label: '', value: '' },
      ],
    })
  }

  /**
   * Deleting from the archive: custom containers are removed entirely;
   * built-in sections have their content cleared but stay archived (the
   * section itself is part of the site and can always be restored empty).
   */
  async function deleteArchived(id) {
    const meta = metaFor(id)
    if (!meta) return
    const isCustom = Boolean(meta.customContainer)
    const ok = await confirmDialog({
      title: `Delete "${meta.label}"?`,
      message: isCustom
        ? 'The container and everything in it are removed for good once you save.'
        : 'Everything written in this section is permanently cleared once you save. The section itself stays archived and can be restored empty later.',
      confirmLabel: 'Delete',
      danger: true,
      verifyText: meta.label,
    })
    if (!ok) return
    if (isCustom) removeCustom(id)
    else clearGroupFields(id)
  }

  /** Label + note for any section id, built-in or custom. */
  function metaFor(id) {
    const customContainer = form.custom.find((c) => c.id === id)
    if (customContainer) {
      return { id, label: customContainer.title || 'Untitled container', customContainer }
    }
    return SECTIONS_META.find((s) => s.id === id)
  }

  if (!form) return <p className="adm-muted">Loading…</p>

  const renderFields = (group) => (
    <div className="adm-grid">
      {FIELDS_BY_GROUP[group].fields.map((f) => (
        <div
          className={`adm-field${f.textarea ? ' adm-field--wide' : ''}`}
          key={f.key}
        >
          <div className="adm-field-head">
            <label htmlFor={`${group}-${f.key}`}>{f.label}</label>
            {Boolean(form[group][f.key]) && (
              <button
                type="button"
                className="adm-clear"
                title="Delete this field"
                aria-label={`Delete ${f.label}`}
                onClick={() => setField(group, f.key, '')}
              >
                ✕
              </button>
            )}
          </div>
          {f.textarea ? (
            <textarea
              id={`${group}-${f.key}`}
              rows={f.rows || 3}
              value={form[group][f.key] ?? ''}
              onChange={(e) => setField(group, f.key, e.target.value)}
            />
          ) : (
            <input
              id={`${group}-${f.key}`}
              type="text"
              value={form[group][f.key] ?? ''}
              onChange={(e) => setField(group, f.key, e.target.value)}
            />
          )}
        </div>
      ))}
    </div>
  )

  const renderFaqEditor = () => (
    <div className="adm-rows">
      {form.faqs.map((row, j) => (
        <div className="adm-row-item" key={j}>
          <div className="adm-row-head">
            <input
              type="text"
              placeholder="Question"
              value={row.q}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  faqs: f.faqs.map((r, k) => (k === j ? { ...r, q: e.target.value } : r)),
                }))
              }
            />
            <button
              type="button"
              className="adm-mini adm-mini--danger"
              onClick={() =>
                setForm((f) => ({ ...f, faqs: f.faqs.filter((_, k) => k !== j) }))
              }
            >
              Remove
            </button>
          </div>
          <textarea
            rows={2}
            placeholder="Answer"
            value={row.a}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                faqs: f.faqs.map((r, k) => (k === j ? { ...r, a: e.target.value } : r)),
              }))
            }
          />
        </div>
      ))}
      <div>
        <button
          type="button"
          className="adm-mini"
          onClick={() =>
            setForm((f) => ({ ...f, faqs: [...f.faqs, { q: '', a: '' }] }))
          }
        >
          Add question
        </button>
      </div>
    </div>
  )

  const renderCustomEditor = (container) => (
    <div className="adm-rows">
      <div className="adm-field">
        <label htmlFor={`${container.id}-title`}>
          Container title (the heading shown on the site)
        </label>
        <input
          id={`${container.id}-title`}
          className="adm-title-input"
          type="text"
          placeholder="e.g. Press kit"
          value={container.title}
          onChange={(e) => setCustom(container.id, { title: e.target.value })}
        />
      </div>

      <div className="adm-field">
        <label>Accent (the card’s color edge on the site)</label>
        <div className="adm-swatches">
          {ACCENTS.map((a) => (
            <button
              key={a}
              type="button"
              title={a}
              aria-label={`Accent ${a}`}
              aria-pressed={container.accent === a}
              className={`adm-swatch adm-swatch--${a}${
                container.accent === a ? ' is-active' : ''
              }`}
              onClick={() => setCustom(container.id, { accent: a })}
            />
          ))}
        </div>
      </div>

      {container.fields.map((f) => (
        <div className="adm-row-item" key={f.id}>
          <div className="adm-row-head">
            <input
              type="text"
              placeholder="Field label (for your reference)"
              value={f.label}
              onChange={(e) =>
                setCustom(container.id, {
                  fields: container.fields.map((x) =>
                    x.id === f.id ? { ...x, label: e.target.value } : x,
                  ),
                })
              }
            />
            <button
              type="button"
              className="adm-mini adm-mini--danger"
              onClick={() =>
                setCustom(container.id, {
                  fields: container.fields.filter((x) => x.id !== f.id),
                })
              }
            >
              Remove
            </button>
          </div>
          <textarea
            rows={3}
            placeholder="Text shown on the site (blank lines split paragraphs)"
            value={f.value}
            onChange={(e) =>
              setCustom(container.id, {
                fields: container.fields.map((x) =>
                  x.id === f.id ? { ...x, value: e.target.value } : x,
                ),
              })
            }
          />
        </div>
      ))}

      <div>
        <button type="button" className="adm-mini" onClick={() => addField(container)}>
          Add field
        </button>
      </div>
    </div>
  )

  return (
    <div>
      <div className="adm-panel-head">
        <div>
          <h2 className="adm-h2">Content</h2>
          <p className="adm-sub">
            The text in each container on the public site, top to bottom in
            the order below. Drag a container by its ⠿ handle to rearrange,
            and save as you go — every container has its own Save button.
            Deleted text stays deleted — a fully emptied container hides its
            section.
          </p>
        </div>
        <div className="adm-toolbar">
          <button className="adm-mini" onClick={addContainer}>
            Add container
          </button>
          <button className="btn btn--primary adm-save" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      {/* The side rail — always first on the page, so no move buttons. */}
      <section className="adm-group">
        <div className="adm-group-head">
          <div>
            <h3 className="adm-h3">Profile</h3>
            <p className="adm-muted">The side rail — always shown first.</p>
          </div>
          <div className="adm-group-tools">
            <button
              className="adm-mini adm-mini--danger"
              onClick={() => deleteSection('profile')}
            >
              Delete
            </button>
            <button className="adm-mini adm-mini--save" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
        {renderFields('profile')}
      </section>

      {form.sections.map((id, i) => {
        const customContainer = form.custom.find((c) => c.id === id)
        const meta =
          SECTIONS_META.find((s) => s.id === id) ||
          (customContainer && {
            id,
            label: customContainer.title || 'Untitled container',
          })
        if (!meta) return null
        const editable = Boolean(FIELDS_BY_GROUP[id])
        const isFaqs = id === 'faqs'
        const slim = !editable && !isFaqs && !customContainer
        return (
          <section
            className={`adm-group${slim ? ' adm-group--slim' : ''}${
              i === dragIndex ? ' adm-group--dragging' : ''
            }`}
            key={id}
            style={
              customContainer
                ? { borderLeftColor: `var(--${customContainer.accent || 'navy'})` }
                : undefined
            }
            onDragOver={(e) => onDragOver(e, i)}
            onDrop={(e) => {
              e.preventDefault()
              setDragIndex(null)
            }}
          >
            <div className="adm-group-head">
              <div className="adm-group-title">
                <button
                  type="button"
                  className="adm-drag"
                  draggable
                  onDragStart={(e) => onDragStart(e, i)}
                  onDragEnd={() => setDragIndex(null)}
                  title="Drag to reorder"
                  aria-label={`Drag to move ${meta.label}`}
                >
                  ⠿
                </button>
                <div>
                  <h3 className="adm-h3">
                    <span className="adm-order mono">{i + 1}</span>
                    {meta.label}
                  </h3>
                  {meta.note && <p className="adm-muted">{meta.note}</p>}
                  {customContainer && (
                    <p className="adm-muted">Custom container — yours to fill.</p>
                  )}
                </div>
              </div>
              <div className="adm-group-tools">
                <button
                  className="adm-mini"
                  title="Take it off the page but keep everything in it"
                  onClick={() => archiveSection(id)}
                >
                  Archive
                </button>
                <button
                  className="adm-mini adm-mini--danger"
                  onClick={() => deleteSection(id)}
                >
                  Delete
                </button>
                <button className="adm-mini adm-mini--save" onClick={save} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
            {editable && renderFields(id)}
            {isFaqs && renderFaqEditor()}
            {customContainer && renderCustomEditor(customContainer)}
          </section>
        )
      })}

      {form.archived.length > 0 && (
        <>
          <div className="adm-archived-head">
            <h3 className="adm-h3">Archived</h3>
            <p className="adm-muted">
              Off the public site, content kept. Restore a container and it
              reappears at the bottom of the page, ready to drag into place.
              Remember to save.
            </p>
          </div>
          {form.archived.map((id) => {
            const meta = metaFor(id)
            if (!meta) return null
            return (
              <section className="adm-group adm-group--slim adm-group--archived" key={id}>
                <div className="adm-group-head">
                  <div>
                    <h3 className="adm-h3">{meta.label}</h3>
                    {meta.note && <p className="adm-muted">{meta.note}</p>}
                  </div>
                  <div className="adm-group-tools">
                    <button className="adm-mini" onClick={() => restoreSection(id)}>
                      Restore
                    </button>
                    {(meta.customContainer || FIELDS_BY_GROUP[id] || id === 'faqs') && (
                      <button
                        className="adm-mini adm-mini--danger"
                        onClick={() => deleteArchived(id)}
                      >
                        Delete
                      </button>
                    )}
                    <button
                      className="adm-mini adm-mini--save"
                      onClick={save}
                      disabled={saving}
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              </section>
            )
          })}
        </>
      )}
    </div>
  )
}
