import { useCallback, useEffect, useState } from 'react'
import { api } from './api.js'
import Login from './Login.jsx'
import ContentPanel from './panels/ContentPanel.jsx'
import ShopPanel from './panels/ShopPanel.jsx'
import BookingsPanel from './panels/BookingsPanel.jsx'
import PaymentsPanel from './panels/PaymentsPanel.jsx'
import MediaPanel from './panels/MediaPanel.jsx'
import AccountPanel from './panels/AccountPanel.jsx'
import ThemeToggle from '../components/ThemeToggle.jsx'

const TABS = [
  { id: 'bookings', label: 'Calendar', Panel: BookingsPanel },
  { id: 'payments', label: 'Payments', Panel: PaymentsPanel },
  { id: 'content', label: 'Content', Panel: ContentPanel },
  { id: 'shop', label: 'Shop', Panel: ShopPanel },
  { id: 'media', label: 'Images', Panel: MediaPanel },
  { id: 'account', label: 'Account', Panel: AccountPanel },
]

export default function AdminApp() {
  const [me, setMe] = useState(null)
  const [checking, setChecking] = useState(true)
  const [tab, setTab] = useState('bookings')
  const [toast, setToast] = useState(null)

  const notify = useCallback((message, kind = 'ok') => {
    setToast({ message, kind })
    setTimeout(() => setToast(null), kind === 'error' ? 7000 : 4000)
  }, [])

  // Ask the server whether the cookie is still valid. The cookie is
  // httpOnly, so this is the only way the app can know.
  useEffect(() => {
    api
      .me()
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setChecking(false))
  }, [])

  async function signOut() {
    try {
      await api.logout()
    } finally {
      setMe(null)
    }
  }

  if (checking) {
    return (
      <div className="adm-login">
        <p className="adm-muted">Checking session…</p>
      </div>
    )
  }

  if (!me) return <Login onSignedIn={setMe} />

  const Active = TABS.find((t) => t.id === tab)?.Panel ?? BookingsPanel

  return (
    <>
      <ThemeToggle />

      <div className="adm">
        <header className="adm-header">
          <div>
            <p className="eyebrow">Admin</p>
            <h1 className="adm-title">Dashboard</h1>
          </div>
          <div className="adm-header__right">
            <span className="adm-who mono">{me.email}</span>
            <a className="adm-mini" href="/">
              View site
            </a>
            <button className="adm-mini" onClick={signOut}>
              Sign out
            </button>
          </div>
        </header>

        <nav className="adm-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`adm-tab${tab === t.id ? ' is-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <main className="adm-main">
          <Active notify={notify} me={me} onSignedOut={() => setMe(null)} />
        </main>

        {toast && (
          <div className={`adm-toast adm-toast--${toast.kind}`} role="status">
            {toast.message}
          </div>
        )}
      </div>
    </>
  )
}
