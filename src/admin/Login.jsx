import { useState } from 'react'
import { api } from './api.js'

export default function Login({ onSignedIn }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const me = await api.login(email, password)
      onSignedIn(me)
    } catch (err) {
      // The server returns the same message for a wrong password and an
      // unknown address, so this never confirms which accounts exist.
      setError(err.message || 'Those details did not work.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="adm-login">
      <div className="adm-login__card">
        <p className="eyebrow">Admin</p>
        <h1 className="adm-login__title">Sign in</h1>

        <form className="adm-form" onSubmit={handleSubmit}>
          <div className="adm-field">
            <label htmlFor="adm-email">Email</label>
            <input
              id="adm-email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="adm-field">
            <label htmlFor="adm-password">Password</label>
            <input
              id="adm-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <p className="adm-alert adm-alert--error">{error}</p>}

          <button className="btn btn--primary adm-btn-block" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="adm-login__note">
          Contact website administrator for any help.
        </p>
      </div>
    </div>
  )
}
