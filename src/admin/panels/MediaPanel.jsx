import { useState } from 'react'
import { api } from '../api.js'
import { profile } from '../../content.js'

const SLOTS = [
  { slot: 'profile', label: 'Profile photo', hint: 'Tall portrait. Shown in the left rail.' },
  { slot: 'about', label: 'About photo', hint: 'Optional. Sits beside the “Hey, I’m Nate” text.' },
  { slot: 'og', label: 'Share image', hint: '1200×630. Shown when the link is sent in a DM.' },
]

export default function MediaPanel({ notify }) {
  const [busy, setBusy] = useState('')
  const [uploaded, setUploaded] = useState({})

  async function handleFile(slot, file) {
    if (!file) return
    setBusy(slot)
    try {
      const { url } = await api.uploadImage(file, slot)
      setUploaded((u) => ({ ...u, [slot]: url }))
      notify(
        'Uploaded. Paste the URL into the matching Content field and save to use it.',
      )
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setBusy('')
    }
  }

  return (
    <div>
      <div className="adm-panel-head">
        <div>
          <h2 className="adm-h2">Images</h2>
          <p className="adm-sub">
            JPEG, PNG or WebP, up to 8MB. Files are checked by their actual bytes,
            not just the extension.
          </p>
        </div>
      </div>

      <p className="adm-alert">
        Current profile image: <code>{profile.avatar}</code>
      </p>

      <div className="adm-grid">
        {SLOTS.map(({ slot, label, hint }) => (
          <section className="adm-group adm-upload" key={slot}>
            <h3 className="adm-h3">{label}</h3>
            <p className="adm-sub">{hint}</p>

            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy === slot}
              onChange={(e) => handleFile(slot, e.target.files?.[0])}
            />

            {busy === slot && <p className="adm-muted">Uploading…</p>}

            {uploaded[slot] && (
              <>
                <img className="adm-thumb" src={uploaded[slot]} alt="" />
                <input className="adm-url" readOnly value={uploaded[slot]} />
              </>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
