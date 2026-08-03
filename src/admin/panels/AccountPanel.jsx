import { useState } from 'react'
import { api } from '../api.js'

export default function AccountPanel({ notify, me }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (next !== confirm) {
      notify('The two new passwords do not match.', 'error')
      return
    }
    if (next.length < 12) {
      notify('New password must be at least 12 characters.', 'error')
      return
    }
    setBusy(true)
    try {
      await api.changePassword(current, next)
      notify('Password changed.')
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="adm-panel-head">
        <div>
          <h2 className="adm-h2">Account</h2>
          <p className="adm-sub">Signed in as {me.email}.</p>
        </div>
      </div>

      <section className="adm-group" style={{ maxWidth: 480 }}>
        <h3 className="adm-h3">Change password</h3>
        <p className="adm-sub">
          Twelve characters minimum. A long phrase you can remember beats a short
          one full of symbols.
        </p>

        <form className="adm-form" onSubmit={submit}>
          <div className="adm-field">
            <label htmlFor="pw-current">Current password</label>
            <input
              id="pw-current"
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div className="adm-field">
            <label htmlFor="pw-new">New password</label>
            <input
              id="pw-new"
              type="password"
              autoComplete="new-password"
              required
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </div>
          <div className="adm-field">
            <label htmlFor="pw-confirm">Repeat new password</label>
            <input
              id="pw-confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <button className="btn btn--primary adm-btn-block" disabled={busy}>
            {busy ? 'Saving…' : 'Change password'}
          </button>
        </form>
      </section>

      <section className="adm-group" style={{ maxWidth: 480 }}>
        <h3 className="adm-h3">Locked out?</h3>
        <p className="adm-sub">
          There is no password reset email — on purpose, since that would be
          another way in. Reset it on the server instead:
        </p>
        <pre className="adm-pre">
          cd server{'\n'}npm run create-admin -- {me.email} "new passphrase"
        </pre>
      </section>
    </div>
  )
}
