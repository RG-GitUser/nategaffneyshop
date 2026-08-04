import { useEffect, useRef, useState } from 'react'
import { ArrowRight } from './Icons.jsx'
import { groupChat } from '../content.js'

const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

/** 'native' talks to our own server, 'circle' proxies Circle.so. Both
 *  expose the same endpoints, so only the prefix changes. */
const PREFIX = groupChat?.mode === 'circle' ? '/api/circle' : '/api/chat'

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${PREFIX}${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = await res.json().catch(() => null)
  if (!res.ok) throw new Error(payload?.error || 'Something went wrong')
  return payload
}

const POLL_MS = 6000

export default function GroupChat() {
  const [stage, setStage] = useState('loading') // loading | email | code | chat | link | off
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [method, setMethod] = useState('email') // email | phone
  const [canPhone, setCanPhone] = useState(false)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [messages, setMessages] = useState([])
  const [topics, setTopics] = useState([])
  const [popped, setPopped] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const listRef = useRef(null)

  useEffect(() => {
    if (!groupChat) return setStage('off')
    if (groupChat.mode === 'link') return setStage('link')

    call('/session')
      .then((s) => setStage(s.joined ? 'chat' : 'email'))
      // Server unreachable or the backend isn't configured — fall back to
      // a link if there is one, otherwise hide rather than show a dead box.
      .catch(() => setStage(groupChat.joinUrl ? 'link' : 'off'))

    // Phone sign-in is offered only when the server has SMS set up.
    call('/join-options')
      .then((o) => setCanPhone(Boolean(o.phone)))
      .catch(() => setCanPhone(false))
  }, [])

  // Poll while open. Cheap at this scale, and avoids holding a socket for
  // a page most visitors scroll straight past.
  useEffect(() => {
    if (stage !== 'chat') return
    let alive = true

    const load = async () => {
      try {
        const data = await call('/messages')
        if (alive) setMessages(data.messages)
      } catch {
        // Quiet on a failed poll — the next one usually recovers.
      }
    }

    load()
    const timer = setInterval(load, POLL_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [stage])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  // Discussion topics the admin pins from the dashboard. Circle mode has
  // no such endpoint — a failed fetch just means no strip.
  useEffect(() => {
    if (stage !== 'chat') return
    call('/topics')
      .then((d) => setTopics(Array.isArray(d.topics) ? d.topics : []))
      .catch(() => setTopics([]))
  }, [stage])

  // Escape docks the popped-out chat.
  useEffect(() => {
    if (!popped) return
    const onKey = (e) => e.key === 'Escape' && setPopped(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [popped])

  const identity = () => (method === 'phone' ? { phone } : { email })

  async function requestCode(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await call('/request-code', { method: 'POST', body: { ...identity(), name } })
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
      await call('/verify', { method: 'POST', body: { ...identity(), code } })
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
    setError('')
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

  if (!groupChat || stage === 'loading' || stage === 'off') return null

  const meet = groupChat.meetUrl ? (
    <a
      className="chat__meet"
      href={groupChat.meetUrl}
      target="_blank"
      rel="noreferrer noopener"
    >
      <span className="chat__meet-label mono">{groupChat.meetLabel}</span>
      <span className="chat__meet-note">{groupChat.meetNote}</span>
      <span className="chat__meet-cta mono">
        Join on Google Meet
        <ArrowRight width={14} height={14} />
      </span>
    </a>
  ) : null

  return (
    <section className="section chat" id="chat">
      <div className="section__head">
        <span className="eyebrow">{groupChat.eyebrow}</span>
        <h2 className="section__title">{groupChat.title}</h2>
      </div>

      {meet}

      <div className={`chat__card${popped ? ' chat__card--popped' : ''}`}>
        {stage === 'chat' && (
          <button
            type="button"
            className="chat__pop mono"
            onClick={() => setPopped(!popped)}
            aria-label={popped ? 'Dock the chat back into the page' : 'Pop the chat out'}
          >
            {popped ? 'Dock' : 'Pop out'}
          </button>
        )}
        {stage !== 'chat' && (
          <div className="chat__intro">
            <p className="chat__desc">{groupChat.description}</p>
          </div>
        )}

        {stage === 'link' && (
          <div className="chat__form">
            <a
              className="btn btn--primary chat__submit"
              href={groupChat.joinUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              {groupChat.joinCta}
              <ArrowRight width={16} height={16} />
            </a>
          </div>
        )}

        {stage === 'email' && (
          <form className="chat__form" onSubmit={requestCode}>
            {canPhone && (
              <div className="chat__method" role="group" aria-label="How to get your code">
                <button
                  type="button"
                  className={method === 'email' ? 'is-active' : ''}
                  onClick={() => setMethod('email')}
                >
                  Email
                </button>
                <button
                  type="button"
                  className={method === 'phone' ? 'is-active' : ''}
                  onClick={() => setMethod('phone')}
                >
                  Phone
                </button>
              </div>
            )}

            <div className="chat__fields">
              <div className="field">
                <label htmlFor="chat-name">Your name</label>
                <input
                  id="chat-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  maxLength={60}
                />
              </div>
              {method === 'phone' ? (
                <div className="field">
                  <label htmlFor="chat-phone">Phone</label>
                  <input
                    id="chat-phone"
                    type="tel"
                    required
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="+1 902 555 0134"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              ) : (
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
              )}
            </div>

            {error && <p className="chat__error">{error}</p>}

            <button className="btn btn--primary chat__submit" disabled={busy}>
              {busy ? 'Sending…' : groupChat.cta}
              <ArrowRight width={16} height={16} />
            </button>
            <p className="chat__fine mono">
              We {method === 'phone' ? 'text' : 'email'} a 6-digit code to check it's
              really you. No password.
            </p>
          </form>
        )}

        {stage === 'code' && (
          <form className="chat__form" onSubmit={verify}>
            <div className="field">
              <label htmlFor="chat-code">
                Code sent to {method === 'phone' ? phone : email}
              </label>
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
              Use a different {method === 'phone' ? 'number' : 'email'}
            </button>
          </form>
        )}

        {stage === 'chat' && (
          <div className="chat__room">
            {topics.length > 0 && (
              <div className="chat__topics">
                <span className="chat__topics-label mono">On the table</span>
                <ul>
                  {topics.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="chat__log" ref={listRef}>
              {messages.length === 0 ? (
                <p className="chat__empty">Nothing here yet. Say the first thing.</p>
              ) : (
                messages.map((m) => (
                  <article
                    className={`chat__msg${m.mine ? ' chat__msg--mine' : ''}`}
                    key={m.id}
                  >
                    {!m.mine && <p className="chat__msg-who mono">{m.authorName}</p>}
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
