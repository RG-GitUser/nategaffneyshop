import { useEffect, useState } from 'react'
import { api } from '../api.js'
import ImageDrop from '../ImageDrop.jsx'
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
  { id: 'offers', label: 'Products', note: 'Cards are managed in the Products tab.' },
  { id: 'services', label: 'Services', note: 'Cards are managed in the Services tab.' },
  {
    id: 'coachingCard',
    label: 'Coaching',
    group: 'booking',
    note: 'The 1:1 coaching container. Its button opens the calendar page at /coaching/, which uses this same copy.',
  },
  {
    id: 'aboutMe',
    label: 'About Me',
    group: 'about',
    note: 'The About Me container links to the /about/ page. These fields fill that page.',
  },
]

/** A section can edit a data group with a different id than its own
 *  (the coaching card edits `booking`, the About Me card edits `about`). */
const groupOf = (id) => SECTIONS_META.find((s) => s.id === id)?.group || id

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
      {
        key: 'avatar',
        label: 'Profile photo',
        image: true,
        hint: 'Tall portrait, shown in the left rail.',
      },
    ],
  },
  {
    group: 'about',
    label: 'About page',
    fields: [
      { key: 'eyebrow', label: 'Eyebrow' },
      { key: 'heading', label: 'Heading' },
      { key: 'paragraphsText', label: 'Paragraphs (one per line)', textarea: true, rows: 8 },
      { key: 'signature', label: 'Signature' },
      {
        key: 'image',
        label: 'Photo',
        image: true,
        hint: 'Optional. Sits beside the text. Without one the card stays text-only.',
      },
    ],
  },
  {
    group: 'booking',
    label: 'Coaching',
    fields: [
      { key: 'title', label: 'Title' },
      {
        key: 'description',
        label: 'Description',
        textarea: true,
        rows: 8,
        hint: (
          <>
            Style your text as you type: <strong>**word**</strong> shows as{' '}
            <strong>bold</strong>, <em>*word*</em> as <em>italics</em>, and any
            line that starts with <strong>-&nbsp;</strong> becomes a bullet
            point. Press Enter for a new paragraph.
          </>
        ),
      },
      /* No duration or price editors here: the booking page shows the
         REAL settings (session length from the Account tab, the charge
         amount from the Calendar tab), and text fields that looked
         editable but were silently overridden only caused confusion.
         The stored fallback text rides along untouched via toPayload. */
      { key: 'timezone', label: 'Timezone label' },
      { key: 'finePrint', label: 'Fine print', textarea: true },
    ],
  },
]

const ACCENTS = ['navy', 'umber', 'olive', 'amber']

const FIELDS_BY_GROUP = Object.fromEntries(FIELDS.map((f) => [f.group, f]))
/* Keys this panel edits. Anything else stored (retired sections like the
   newsletter or FAQ copy) rides along untouched in _extra — removed from
   the dashboard, never deleted from the data. */
const KNOWN_KEYS = new Set([
  'sections',
  'archived',
  'custom',
  ...FIELDS.map((f) => f.group),
])

/** About stores paragraphs as an array; the textarea works in lines. */
function toForm(stored) {
  const out = {}
  for (const { group } of FIELDS) {
    out[group] = { ...(defaults[group] || {}), ...(stored[group] || {}) }
  }
  out.about.paragraphsText = (out.about.paragraphs || []).join('\n')

  out.custom = (Array.isArray(stored.custom) ? stored.custom : [])
    .filter((c) => c && c.id)
    .map((c) => ({
      id: c.id,
      title: c.title || '',
      accent: ACCENTS.includes(c.accent) ? c.accent : 'navy',
      page: Boolean(c.page),
      meta: c.meta || '',
      fields: (c.fields || []).map((f, i) => ({
        id: f.id || `${c.id}-f${i}`,
        label: f.label || '',
        value: f.value || '',
        type: f.type === 'image' ? 'image' : 'text',
      })),
    }))

  // Stored order first (unknown ids dropped), then anything new at the end
  // so a section added in a later deploy can't silently vanish. Archived
  // sections live in their own list and must not be re-appended here.
  const ids = [...SECTIONS_META.map((s) => s.id), ...out.custom.map((c) => c.id)]
  const storedArchived = Array.isArray(stored.archived) ? stored.archived : []
  out.archived = storedArchived.filter((id) => ids.includes(id))
  /* Archived ids this panel has no row for — the retired sections, whose
     copy already rides along in _extra. Dropping them from the list on
     save would leave the copy stored but no longer marked archived, so
     the day one of them returns to SECTIONS_META it would come back as a
     LIVE section instead of a hidden one. Held aside, written back
     untouched in toStored, never shown. */
  out._archivedHidden = storedArchived.filter((id) => !ids.includes(id))
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
  const out = {
    ...form._extra,
    sections: form.sections,
    archived: [...form.archived, ...(form._archivedHidden || [])],
  }
  for (const { group } of FIELDS) out[group] = { ...form[group] }
  out.about.paragraphs = (out.about.paragraphsText || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  delete out.about.paragraphsText

  out.custom = form.custom.map((c) => ({
    id: c.id,
    title: c.title.trim(),
    accent: c.accent,
    page: Boolean(c.page),
    meta: (c.meta || '').trim(),
    fields: c.fields
      .map((f) => ({ id: f.id, label: f.label.trim(), value: f.value, type: f.type }))
      .filter((f) => f.label || f.value.trim()),
  }))
  return out
}

export default function ContentPanel({ notify }) {
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [dragIndex, setDragIndex] = useState(null)
  const [loadError, setLoadError] = useState('')
  // The real session length and price, shown next to the Coaching copy so
  // it's obvious where those live. Purely informational — editing them
  // happens in the Account and Calendar tabs.
  const [bookingLive, setBookingLive] = useState(null)

  /**
   * A failed load must NOT fall back to an editable form seeded with the
   * built-in defaults. Saving that form would overwrite the real stored
   * content — custom containers, FAQ edits, image URLs, the section
   * order — with defaults, and none of it is recoverable. So a failure
   * shows an error with a Retry instead of anything editable.
   */
  function load() {
    setLoadError('')
    api
      .getContent()
      .then((stored) => {
        // A 2xx with a body we can't read (a proxy or maintenance page)
        // arrives as null, which would seed the form from defaults and
        // let a Save overwrite the real content. Only a real object is
        // safe to edit; the server sends {} on a genuine first run.
        if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
          throw new Error('The server sent an unreadable response.')
        }
        setForm(toForm(stored))
      })
      .catch((err) => {
        setForm(null)
        setLoadError(err.message)
      })
  }

  useEffect(() => {
    load()
    api
      .bookingPrice()
      .then(setBookingLive)
      .catch(() => setBookingLive(null))
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
    const group = groupOf(id)
    const cleared = {}
    for (const fld of FIELDS_BY_GROUP[group].fields) cleared[fld.key] = ''
    setForm((f) => ({ ...f, [group]: { ...f[group], ...cleared } }))
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
    const hasFields = Boolean(FIELDS_BY_GROUP[groupOf(id)])
    const ok = await confirmDialog({
      title: `Delete "${meta.label}"?`,
      message: isCustom
        ? 'The container and everything in it are removed for good once you save.'
        : hasFields
          ? 'Everything written in this container is permanently cleared once you save.'
          : 'The cards in this section are managed in another tab, so nothing is deleted here. The section moves to Archived and comes off the public page once you save.',
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
          meta: '',
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

  function addField(container, type = 'text') {
    setCustom(container.id, {
      fields: [
        ...container.fields,
        {
          id: `${container.id}-f${Date.now().toString(36)}`,
          label: '',
          value: '',
          type,
        },
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

  if (loadError) {
    return (
      <div>
        <h2 className="adm-h2">Content</h2>
        <p className="adm-sub">
          Your content could not be loaded, so it isn’t safe to edit right now.
          Saving would overwrite what’s stored. Nothing has changed.
        </p>
        <p className="adm-muted">({loadError})</p>
        <div className="adm-actions" style={{ marginTop: 16 }}>
          <button className="btn btn--primary adm-save" onClick={load}>
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (!form) return <p className="adm-muted">Loading…</p>

  const renderFields = (group) => (
    <>
      {/* The badge on the booking page reads the real settings, so the
          Coaching copy section says where they live and what they are
          right now — instead of offering lookalike text fields that
          would be silently overridden. */}
      {group === 'booking' && (
        <p className="adm-hint">
          The session length and price on the booking page
          {bookingLive?.durationMinutes || bookingLive?.priceCents ? (
            <>
              {' '}
              (currently{' '}
              <strong>
                {bookingLive.durationMinutes
                  ? `${bookingLive.durationMinutes} min`
                  : '—'}
                {bookingLive.priceCents
                  ? ` · $${(bookingLive.priceCents / 100).toFixed(0)}`
                  : ''}
              </strong>
              )
            </>
          ) : null}{' '}
          are set elsewhere: the length under <strong>Account → Session
          length</strong>, and the price in the <strong>Calendar</strong> tab —
          that’s the amount customers are actually charged.
        </p>
      )}
      <div className="adm-grid">
      {FIELDS_BY_GROUP[group].fields.map((f) => (
        <div
          className={`adm-field${f.textarea || f.image ? ' adm-field--wide' : ''}`}
          key={f.key}
        >
          <div className="adm-field-head">
            <label htmlFor={`${group}-${f.key}`}>{f.label}</label>
            {Boolean(form[group][f.key]) && (
              <button
                type="button"
                className="adm-clear"
                title={f.image ? 'Delete this image' : 'Delete this field'}
                aria-label={`Delete ${f.label}`}
                onClick={() => setField(group, f.key, '')}
              >
                ✕
              </button>
            )}
          </div>
          {f.image ? (
            <ImageDrop
              slot={`${group}-${f.key}`}
              value={form[group][f.key] || ''}
              notify={notify}
              onUploaded={(url) => setField(group, f.key, url)}
              hint={f.hint}
            />
          ) : f.textarea ? (
            <>
              <textarea
                id={`${group}-${f.key}`}
                rows={f.rows || 3}
                value={form[group][f.key] ?? ''}
                onChange={(e) => setField(group, f.key, e.target.value)}
              />
              {f.hint && <p className="adm-hint">{f.hint}</p>}
            </>
          ) : (
            <>
              <input
                id={`${group}-${f.key}`}
                type="text"
                value={form[group][f.key] ?? ''}
                onChange={(e) => setField(group, f.key, e.target.value)}
              />
              {f.hint && <p className="adm-hint">{f.hint}</p>}
            </>
          )}
        </div>
      ))}
      </div>
    </>
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
        <label className="adm-check">
          <input
            type="checkbox"
            checked={Boolean(container.page)}
            onChange={(e) => setCustom(container.id, { page: e.target.checked })}
          />
          Link to page? The landing shows this as a card with a button, and
          the content opens on its own page titled with the name above.
        </label>
      </div>

      <div className="adm-field">
        <label htmlFor={`${container.id}-meta`}>
          Highlight line (the coloured line where a price would go)
        </label>
        <input
          id={`${container.id}-meta`}
          type="text"
          placeholder="e.g. 1 min read, Free, New for 2026"
          value={container.meta}
          onChange={(e) => setCustom(container.id, { meta: e.target.value })}
        />
        <p className="adm-muted">
          Sits between the blurb and the button, in the same colour the
          product cards use for their prices. It shows once “Link to page?”
          is ticked above, since that is what turns this container into a
          card. Left blank, the card simply has no coloured line.
        </p>
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
              placeholder={
                f.type === 'image'
                  ? 'Image description (used as alt text)'
                  : 'Field label (for your reference)'
              }
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
          {f.type === 'image' ? (
            <ImageDrop
              slot="custom"
              value={f.value || ''}
              notify={notify}
              /* Patch through the updater rather than the render-time
                 `container` — an upload takes seconds, and anything typed
                 meanwhile would be reverted by a stale snapshot. */
              onUploaded={(url) =>
                setForm((prev) => ({
                  ...prev,
                  custom: prev.custom.map((c) =>
                    c.id === container.id
                      ? {
                          ...c,
                          fields: c.fields.map((x) =>
                            x.id === f.id ? { ...x, value: url } : x,
                          ),
                        }
                      : c,
                  ),
                }))
              }
              hint="Shown full-width inside the container."
            />
          ) : (
            <>
              <textarea
                rows={3}
                placeholder="Text shown on the site"
                value={f.value}
                onChange={(e) =>
                  setCustom(container.id, {
                    fields: container.fields.map((x) =>
                      x.id === f.id ? { ...x, value: e.target.value } : x,
                    ),
                  })
                }
              />
              <p className="adm-hint">
                Style your text as you type: <strong>**word**</strong> shows as{' '}
                <strong>bold</strong>, <em>*word*</em> as <em>italics</em>, and
                any line that starts with <strong>-&nbsp;</strong> becomes a
                bullet point. Press Enter for a new paragraph.
              </p>
            </>
          )}
        </div>
      ))}

      <div className="adm-inline">
        <button type="button" className="adm-mini" onClick={() => addField(container)}>
          Add field
        </button>
        <button
          type="button"
          className="adm-mini"
          onClick={() => addField(container, 'image')}
        >
          Add image
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
            and save as you go. Every container has its own Save button.
            Deleted text stays deleted. A fully emptied container hides its
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
            <p className="adm-muted">The side rail. Always shown first.</p>
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
        if (!meta || meta.hidden) return null
        const editable = Boolean(FIELDS_BY_GROUP[groupOf(id)])
        const slim = !editable && !customContainer
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
                    <p className="adm-muted">Custom container. Yours to fill.</p>
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
            {editable && renderFields(groupOf(id))}
            {customContainer && renderCustomEditor(customContainer)}
          </section>
        )
      })}

      {form.archived.length > 0 && (
        <>
          <div className="adm-archived-head">
            <h3 className="adm-h3">Archived</h3>
            <p className="adm-muted">
              Everything here is hidden from your site, but nothing is
              deleted. It’s all kept safe. Press Restore and the container
              comes back at the bottom of the page, ready to drag into place
              (don’t forget to Save). Some rows have no Delete button: their
              cards live in another tab, like Products or Services. Archiving
              just hides the section. To delete those cards, do it from
              their own tab.
            </p>
          </div>
          {form.archived.map((id) => {
            const meta = metaFor(id)
            if (!meta || meta.hidden) return null
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
