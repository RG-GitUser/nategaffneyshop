import { useState } from 'react'
import { supabase, isConfigured } from './supabase.js'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      // Deliberately generic — don't reveal whether the address exists.
      if (error) setError('Those details did not work.')
    } catch {
      setError('Could not reach the login service.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="adm-login">
      <div className="adm-login__card">
        <p className="eyebrow">Admin</p>
        <h1 className="adm-login__title">Sign in</h1>

        {!isConfigured ? (
          <p className="adm-alert adm-alert--warn">
            Supabase is not configured. Set <code>VITE_SUPABASE_URL</code> and{' '}
            <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env</code>, then restart
            the dev server.
          </p>
        ) : (
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
        )}

        <p className="adm-login__note">
          Accounts are created in Supabase by hand. There is no public signup, and
          an account only works if its address is on the server allowlist.
        </p>
      </div>
    </div>
  )
}
