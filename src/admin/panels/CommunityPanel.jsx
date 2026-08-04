import { useEffect, useState } from 'react'
import { api } from '../api.js'

const when = (iso) =>
  iso ? new Date(iso).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' }) : '—'

export default function CommunityPanel({ notify }) {
  const [members, setMembers] = useState(null)
  const [memberQuery, setMemberQuery] = useState('')
  const [history, setHistory] = useState(null)
  const [topics, setTopics] = useState(null)
  const [stats, setStats] = useState(null)
  const [savingTopics, setSavingTopics] = useState(false)
  const [google, setGoogle] = useState(null)

  function loadMembers() {
    api.chatMembers().then(setMembers).catch((err) => notify(err.message, 'error'))
  }
  function loadHistory() {
    api.chatHistory().then(setHistory).catch((err) => notify(err.message, 'error'))
  }

  useEffect(() => {
    loadMembers()
    loadHistory()
    api.chatSettings().then((s) => setTopics(s.topics)).catch((err) => notify(err.message, 'error'))
    api.metricsSummary(30).then((d) => setStats(d.chat)).catch(() => setStats(null))
    api.googleStatus().then(setGoogle).catch(() => setGoogle(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function setBan(member, ban) {
    const verb = ban ? 'Ban' : 'Unban'
    if (ban && !window.confirm(`Ban ${member.email}? They are signed out immediately and can no longer join or post.`)) return
    try {
      await (ban ? api.chatBanMember(member.email) : api.chatUnbanMember(member.email))
      notify(`${verb}ned ${member.email}.`)
      loadMembers()
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  async function removeMessage(id) {
    if (!window.confirm('Remove this message from the chat? The record is kept here.')) return
    try {
      await api.chatRemoveMessage(id)
      notify('Message removed.')
      loadHistory()
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  async function saveTopics() {
    setSavingTopics(true)
    try {
      const clean = topics.map((t) => t.trim()).filter(Boolean)
      await api.saveChatSettings({ topics: clean })
      setTopics(clean)
      notify('Discussion topics saved. The chat shows them right away.')
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setSavingTopics(false)
    }
  }

  return (
    <div>
      <div className="adm-panel-head">
        <div>
          <h2 className="adm-h2">Community</h2>
          <p className="adm-sub">
            Members, moderation and settings for the group chat.
          </p>
        </div>
      </div>

      <div className="adm-stats">
        <div className="adm-stat">
          <span className="adm-stat__label">Members, all time</span>
          <span className="adm-stat__value">{stats ? stats.members : '—'}</span>
        </div>
        <div className="adm-stat">
          <span className="adm-stat__label">Signed-in sessions, now</span>
          <span className="adm-stat__value">{stats ? stats.activeSessions : '—'}</span>
        </div>
        <div className="adm-stat">
          <span className="adm-stat__label">Messages, all time</span>
          <span className="adm-stat__value">{stats ? stats.messagesTotal : '—'}</span>
        </div>
      </div>

      <section className="adm-group">
        <div className="adm-group-head">
          <h3 className="adm-h3">Members</h3>
          {members && members.length > 0 && (
            <input
              className="adm-search"
              type="search"
              placeholder="Filter by name, email or phone…"
              value={memberQuery}
              onChange={(e) => setMemberQuery(e.target.value)}
            />
          )}
        </div>
        {!members ? (
          <p className="adm-muted">Loading…</p>
        ) : members.length === 0 ? (
          <p className="adm-muted">Nobody has joined the chat yet.</p>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Joined</th>
                  <th>Last seen</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {members
                  .filter((m) => {
                    const q = memberQuery.trim().toLowerCase()
                    if (!q) return true
                    return [m.name, m.email, m.phone]
                      .filter(Boolean)
                      .some((v) => v.toLowerCase().includes(q))
                  })
                  .map((m) => (
                  <tr key={m.email}>
                    <td>
                      <strong>{m.name}</strong>
                      <br />
                      <span className="adm-muted">{m.phone || m.email}</span>
                    </td>
                    <td className="adm-nowrap">{when(m.joinedAt)}</td>
                    <td className="adm-nowrap">{when(m.lastSeenAt)}</td>
                    <td>
                      {m.banned ? (
                        <span className="adm-pill adm-pill--cancelled">banned</span>
                      ) : m.sessions > 0 ? (
                        <span className="adm-pill adm-pill--confirmed">signed in</span>
                      ) : (
                        <span className="adm-pill">member</span>
                      )}
                    </td>
                    <td>
                      <div className="adm-actions">
                        {m.banned ? (
                          <button className="adm-mini" onClick={() => setBan(m, false)}>
                            Unban
                          </button>
                        ) : (
                          <button className="adm-mini adm-mini--danger" onClick={() => setBan(m, true)}>
                            Ban
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="adm-group">
        <h3 className="adm-h3">Discussion topics</h3>
        <p className="adm-sub">
          Pinned conversation starters, shown to members at the top of the chat.
          Up to 12; keep them short.
        </p>
        {!topics ? (
          <p className="adm-muted">Loading…</p>
        ) : (
          <div className="adm-form">
            {topics.map((t, i) => (
              <div className="adm-inline" key={i}>
                <input
                  value={t}
                  maxLength={120}
                  placeholder="e.g. What are you cutting this week?"
                  style={{ flex: 1 }}
                  onChange={(e) =>
                    setTopics(topics.map((x, j) => (j === i ? e.target.value : x)))
                  }
                />
                <button
                  type="button"
                  className="adm-mini adm-mini--danger"
                  onClick={() => setTopics(topics.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </div>
            ))}
            <div className="adm-actions">
              {topics.length < 12 && (
                <button type="button" className="adm-mini" onClick={() => setTopics([...topics, ''])}>
                  Add topic
                </button>
              )}
              <button
                type="button"
                className="btn btn--primary adm-save"
                disabled={savingTopics}
                onClick={saveTopics}
              >
                {savingTopics ? 'Saving…' : 'Save topics'}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="adm-group">
        <h3 className="adm-h3">Chat history</h3>
        <p className="adm-sub">
          The most recent 200 messages, including removed ones. Removing a
          message hides it from the chat but keeps the record here.
        </p>
        {!history ? (
          <p className="adm-muted">Loading…</p>
        ) : history.length === 0 ? (
          <p className="adm-muted">No messages yet.</p>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Message</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {history.map((m) => (
                  <tr key={m.id}>
                    <td className="adm-nowrap">{when(m.sentAt)}</td>
                    <td>
                      <strong>{m.authorName}</strong>
                      <br />
                      <span className="adm-muted">{m.email}</span>
                    </td>
                    <td className="adm-note">
                      {m.deleted ? <s>{m.body}</s> : m.body}
                      {m.deleted && (
                        <>
                          {' '}
                          <span className="adm-pill adm-pill--cancelled">removed</span>
                        </>
                      )}
                    </td>
                    <td>
                      {!m.deleted && (
                        <button
                          className="adm-mini adm-mini--danger"
                          onClick={() => removeMessage(m.id)}
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="adm-group">
        <h3 className="adm-h3">Call history</h3>
        <p className="adm-sub">
          {google?.configured
            ? 'Google is connected on the server. Community calls over Google Meet are the next step — once calls are hosted from here, each one will be listed with its date and attendees.'
            : 'Community calls will run on Google Meet. Once the Google console project is set up and connected on the server, calls hosted from here will be listed with their dates and attendees.'}
        </p>
      </section>
    </div>
  )
}
