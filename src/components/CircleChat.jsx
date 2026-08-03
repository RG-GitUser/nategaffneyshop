import { useEffect, useRef, useState } from 'react'
import { ArrowRight } from './Icons.jsx'
import { circleChat } from '../content.js'

const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

/** All calls carry the httpOnly session cookie; no Circle token ever
 *  touches the browser — the server proxies every chat request. */
async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}/api/circle${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = await res.json().catch(() => null)
  if (!res.ok) throw new Error(payload?.error || 'Something went wrong')
  return payload
}

const POLL_MS = 8000

export default function CircleChat() {
  const [stage, setStage] = useState('loading') // loading | email | code | chat | off
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const listRef = useRef(null)

  // Already joined from a previous visit? A 503 here means the server has
  // no Circle tokens configured, so the section hides itself rather than
  // rendering a box that can't work.
  // (The `circleChat` check lives inside the effect, not as an early
  // return — bailing before the hooks below would change the hook order.)
  useEffect(() => {
    if (!circleChat) {
      setStage('off')
      return
    }
    call('/session')
      .then((s) => setStage(s.joined ? 'chat' : 'email'))
      .catch(() => setStage('off'))
  }, [])

  // Poll while the chat is open. Cheap enough at this scale, and avoids
  // holding a websocket open for a page most people scroll straight past.
  useEffect(() => {
    if (stage !== 'chat') return
    let alive = true

    const load = async () => {
      try {
        const data = await call('/messages')
        if (alive) setMessages(data.messages)
      } catch {
        // Stay quiet on a failed poll — the next one usually recovers.
      }
    }

    load()
    const timer = setInterval(load, POLL_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [stage])

  // Keep the newest message in view.
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  async function requestCode(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await call('/request-code', { method: 'POST', body: { email, name } })
      setStage('code')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function verify(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await call('/verify', { method: 'POST', body: { email, code } })
      setStage('chat')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function send(e) {
    e.preventDefault()
    const body = draft.trim()
    if (!body) return
    setDraft('')
    try {
      await call('/messages', { method: 'POST', body: { body } })
      const data = await call('/messages')
      setMessages(data.messages)
    } catch (err) {
      setError(err.message)
      setDraft(body) // don't lose what they typed
    }
  }

  async function leave() {
    await call('/leave', { method: 'POST' }).catch(() => {})
    setStage('email')
    setMessages([])
    setCode('')
  }

  if (!circleChat || stage === 'loading' || stage === 'off') return null

  return (
    <section className="section chat" id="circle">
      <div className="section__head">
        <span className="eyebrow">{circleChat.eyebrow}</span>
        <h2 className="section__title">{circleChat.title}</h2>
      </div>

      <div className="chat__card">
        {stage !== 'chat' && (
          <div className="chat__intro">
            <p className="chat__desc">{circleChat.description}</p>
          </div>
        )}

        {stage === 'email' && (
          <form className="chat__form" onSubmit={requestCode}>
            <div className="chat__fields">
              <div className="field">
                <label htmlFor="chat-name">Your name</label>
                <input
                  id="chat-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </div>
              <div className="field">
                <label htmlFor="chat-email">Email</label>
                <input
                  id="chat-email"
                  type="email"
                  required
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            {error && <p className="chat__error">{error}</p>}

            <button className="btn btn--primary chat__submit" disabled={busy}>
              {busy ? 'Sending…' : circleChat.cta}
              <ArrowRight width={16} height={16} />
            </button>
            <p className="chat__fine mono">
              We email a 6-digit code to check it's really you. No password.
            </p>
          </form>
        )}

        {stage === 'code' && (
          <form className="chat__form" onSubmit={verify}>
            <div className="field">
              <label htmlFor="chat-code">Code sent to {email}</label>
              <input
                id="chat-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                className="chat__code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </div>

            {error && <p className="chat__error">{error}</p>}

            <button className="btn btn--primary chat__submit" disabled={busy}>
              {busy ? 'Checking…' : 'Join the chat'}
            </button>
            <button
              type="button"
              className="chat__linkbtn mono"
              onClick={() => {
                setStage('email')
                setError('')
              }}
            >
              Use a different email
            </button>
          </form>
        )}

        {stage === 'chat' && (
          <div className="chat__room">
            <div className="chat__log" ref={listRef}>
              {messages.length === 0 ? (
                <p className="chat__empty">
                  Nothing here yet. Say the first thing.
                </p>
              ) : (
                messages.map((m) => (
                  <article className="chat__msg" key={m.id}>
                    <p className="chat__msg-who mono">{m.authorName}</p>
                    <p className="chat__msg-body">{m.body}</p>
                  </article>
                ))
              )}
            </div>

            {error && <p className="chat__error">{error}</p>}

            <form className="chat__composer" onSubmit={send}>
              <label className="sr-only" htmlFor="chat-draft">
                Message
              </label>
              <input
                id="chat-draft"
                placeholder="Say something…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={2000}
              />
              <button className="btn btn--primary chat__send" disabled={!draft.trim()}>
                Send
              </button>
            </form>

            <button className="chat__linkbtn mono" onClick={leave}>
              Leave chat
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
