import { useCallback, useEffect, useState } from 'react'
import { supabase, isConfigured } from './supabase.js'
import Login from './Login.jsx'
import ContentPanel from './panels/ContentPanel.jsx'
import ShopPanel from './panels/ShopPanel.jsx'
import BookingsPanel from './panels/BookingsPanel.jsx'
import PaymentsPanel from './panels/PaymentsPanel.jsx'
import MediaPanel from './panels/MediaPanel.jsx'
import ThemeToggle from '../components/ThemeToggle.jsx'

const TABS = [
  { id: 'bookings', label: 'Calendar', Panel: BookingsPanel },
  { id: 'payments', label: 'Payments', Panel: PaymentsPanel },
  { id: 'content', label: 'Content', Panel: ContentPanel },
  { id: 'shop', label: 'Shop', Panel: ShopPanel },
  { id: 'media', label: 'Images', Panel: MediaPanel },
]

export default function AdminApp() {
  const [session, setSession] = useState(null)
  const [checking, setChecking] = useState(true)
  const [tab, setTab] = useState('bookings')
  const [toast, setToast] = useState(null)

  const notify = useCallback((message, kind = 'ok') => {
    setToast({ message, kind })
    setTimeout(() => setToast(null), kind === 'error' ? 7000 : 4000)
  }, [])

  useEffect(() => {
    if (!isConfigured) {
      setChecking(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setChecking(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (checking) {
    return (
      <div className="adm-login">
        <p className="adm-muted">Checking session…</p>
      </div>
    )
  }

  if (!session) return <Login />

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
            <span className="adm-who mono">{session.user.email}</span>
            <a className="adm-mini" href="/">
              View site
            </a>
            <button className="adm-mini" onClick={() => supabase.auth.signOut()}>
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
          <Active notify={notify} />
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
