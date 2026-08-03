import { useEffect, useState } from 'react'
import { api } from '../api.js'
import * as defaults from '../../content.js'

/**
 * Edits the text in each container on the public site.
 *
 * Only the fields worth editing are exposed, rather than a raw JSON blob —
 * a stray comma in hand-edited JSON would take the live site down.
 * Anything left blank falls back to the value bundled in content.js.
 */

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
      { key: 'href', label: 'YouTube URL' },
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

/** About stores paragraphs as an array; the textarea works in lines. */
function toForm(stored) {
  const out = {}
  for (const { group } of FIELDS) {
    out[group] = { ...(defaults[group] || {}), ...(stored[group] || {}) }
  }
  out.about.paragraphsText = (out.about.paragraphs || []).join('\n')
  return out
}

function toPayload(form) {
  const out = {}
  for (const { group } of FIELDS) out[group] = { ...form[group] }
  out.about.paragraphs = (out.about.paragraphsText || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  delete out.about.paragraphsText
  return out
}

export default function ContentPanel({ notify }) {
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)

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

  if (!form) return <p className="adm-muted">Loading…</p>

  return (
    <div>
      <div className="adm-panel-head">
        <div>
          <h2 className="adm-h2">Content</h2>
          <p className="adm-sub">
            The text in each container on the public site. Blank fields fall back
            to the built-in defaults.
          </p>
        </div>
        <button className="btn btn--primary adm-save" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      {FIELDS.map(({ group, label, fields }) => (
        <section className="adm-group" key={group}>
          <h3 className="adm-h3">{label}</h3>
          <div className="adm-grid">
            {fields.map((f) => (
              <div
                className={`adm-field${f.textarea ? ' adm-field--wide' : ''}`}
                key={f.key}
              >
                <label htmlFor={`${group}-${f.key}`}>{f.label}</label>
                {f.textarea ? (
                  <textarea
                    id={`${group}-${f.key}`}
                    rows={f.rows || 3}
                    value={form[group][f.key] ?? ''}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        [group]: { ...form[group], [f.key]: e.target.value },
                      })
                    }
                  />
                ) : (
                  <input
                    id={`${group}-${f.key}`}
                    type="text"
                    value={form[group][f.key] ?? ''}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        [group]: { ...form[group], [f.key]: e.target.value },
                      })
                    }
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
