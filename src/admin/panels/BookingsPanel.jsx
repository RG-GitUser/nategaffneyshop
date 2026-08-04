import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { StatusBar, VizToggle } from './charts.jsx'

const STATUSES = ['pending', 'confirmed', 'completed', 'cancelled']

const STATUS_COLORS = {
  pending: 'var(--st-pending-fill)',
  confirmed: 'var(--st-confirmed-fill)',
  completed: 'var(--st-completed-fill)',
  cancelled: 'var(--st-cancelled-fill)',
}

const EMPTY_DRAFT = {
  name: '',
  email: '',
  date: '',
  time: '',
  note: '',
  status: 'confirmed',
  createEvent: true,
  notifyCustomer: true,
}

export default function BookingsPanel({ notify }) {
  const [rows, setRows] = useState([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // { id, date, time }
  const [view, setView] = useState('active') // active | archived (completed)
  const [draft, setDraft] = useState(null) // manual-booking modal state
  const [creating, setCreating] = useState(false)
  const [googleOn, setGoogleOn] = useState(false)

  useEffect(() => {
    api.googleStatus().then((g) => setGoogleOn(Boolean(g.connected))).catch(() => {})
  }, [])

  async function load() {
    setLoading(true)
    try {
      setRows(await api.listBookings(filter))
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  // "Done" bookings live in their own Archived view instead of cluttering
  // the working list; clicking Done moves them there on the next load.
  const shown = rows.filter((b) =>
    view === 'archived' ? b.status === 'completed' : b.status !== 'completed',
  )

  async function setStatus(id, status) {
    try {
      await api.updateBooking(id, { status })
      notify(`Booking marked ${status}.`)
      load()
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  async function saveReschedule() {
    try {
      await api.updateBooking(editing.id, {
        date: editing.date,
        time: editing.time,
      })
      notify('Booking rescheduled.')
      setEditing(null)
      load()
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  async function remove(id) {
    if (!confirm('Delete this booking permanently? This cannot be undone.')) return
    try {
      await api.deleteBooking(id)
      notify('Booking deleted.')
      load()
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  return (
    <div>
      <div className="adm-panel-head">
        <div>
          <h2 className="adm-h2">Calendar</h2>
          <p className="adm-sub">
            Confirm, reschedule or cancel requests — or book someone in yourself.
          </p>
        </div>
        <div className="adm-inline">
          <button className="btn btn--primary adm-save" onClick={() => setDraft(EMPTY_DRAFT)}>
            Add booking
          </button>
          <VizToggle
            value={view}
            onChange={setView}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'archived', label: 'Archived' },
            ]}
          />
          {view === 'active' && (
            <select
              className="adm-select"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              {STATUSES.filter((s) => s !== 'completed').map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {draft && (
        <div className="adm-modal" onClick={(e) => e.target === e.currentTarget && setDraft(null)}>
          <div className="adm-modal__card adm-modal__card--wide">
            <h3 className="adm-h3">New booking</h3>
            <form
              className="adm-form"
              onSubmit={async (e) => {
                e.preventDefault()
                setCreating(true)
                try {
                  const result = await api.createBooking({
                    ...draft,
                    createEvent: googleOn && draft.createEvent,
                  })
                  for (const w of result.warnings || []) notify(w, 'error')
                  notify(
                    draft.status === 'confirmed'
                      ? 'Booking added and confirmed.'
                      : 'Booking added as pending.',
                  )
                  setDraft(null)
                  load()
                } catch (err) {
                  notify(err.message, 'error')
                } finally {
                  setCreating(false)
                }
              }}
            >
              <div className="adm-grid">
                <div className="adm-field">
                  <label htmlFor="nb-name">Name</label>
                  <input
                    id="nb-name"
                    required
                    maxLength={120}
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </div>
                <div className="adm-field">
                  <label htmlFor="nb-email">Email</label>
                  <input
                    id="nb-email"
                    type="email"
                    required
                    value={draft.email}
                    onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                  />
                </div>
                <div className="adm-field">
                  <label htmlFor="nb-date">Date</label>
                  <input
                    id="nb-date"
                    type="date"
                    required
                    value={draft.date}
                    onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                  />
                </div>
                <div className="adm-field">
                  <label htmlFor="nb-time">Time</label>
                  <input
                    id="nb-time"
                    required
                    placeholder="1:00 PM"
                    maxLength={20}
                    value={draft.time}
                    onChange={(e) => setDraft({ ...draft, time: e.target.value })}
                  />
                </div>
                <div className="adm-field">
                  <label htmlFor="nb-status">Status</label>
                  <select
                    id="nb-status"
                    value={draft.status}
                    onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                  >
                    <option value="confirmed">confirmed</option>
                    <option value="pending">pending</option>
                  </select>
                </div>
                <div className="adm-field adm-field--wide">
                  <label htmlFor="nb-note">Note</label>
                  <textarea
                    id="nb-note"
                    rows={2}
                    maxLength={2000}
                    value={draft.note}
                    onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                  />
                </div>
              </div>

              {googleOn && draft.status === 'confirmed' && (
                <label className="adm-check">
                  <input
                    type="checkbox"
                    checked={draft.createEvent}
                    onChange={(e) => setDraft({ ...draft, createEvent: e.target.checked })}
                  />
                  Create the calendar event + Google Meet link now
                </label>
              )}
              <label className="adm-check">
                <input
                  type="checkbox"
                  checked={draft.notifyCustomer}
                  onChange={(e) => setDraft({ ...draft, notifyCustomer: e.target.checked })}
                />
                Email the customer {draft.status === 'confirmed' ? 'their confirmation' : ''}
              </label>

              <div className="adm-modal__actions">
                <button type="button" className="adm-mini" onClick={() => setDraft(null)}>
                  Cancel
                </button>
                <button className="btn btn--primary adm-save" disabled={creating}>
                  {creating ? 'Adding…' : 'Add booking'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {!loading && view === 'active' && filter === '' && shown.length > 0 && (
        <div className="adm-statusbar-block">
          <StatusBar
            items={STATUSES.filter((s) => shown.some((b) => b.status === s)).map((s) => ({
              label: s,
              value: shown.filter((b) => b.status === s).length,
              color: STATUS_COLORS[s],
            }))}
          />
        </div>
      )}

      {loading ? (
        <p className="adm-muted">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="adm-muted">
          {view === 'archived'
            ? 'Nothing archived yet — mark a booking Done and it moves here.'
            : 'No bookings yet.'}
        </p>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Note</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((b) => (
                <tr key={b.id}>
                  <td>
                    {editing?.id === b.id ? (
                      <div className="adm-inline">
                        <input
                          type="date"
                          value={editing.date}
                          onChange={(e) =>
                            setEditing({ ...editing, date: e.target.value })
                          }
                        />
                        <input
                          type="text"
                          value={editing.time}
                          onChange={(e) =>
                            setEditing({ ...editing, time: e.target.value })
                          }
                        />
                        <button className="adm-mini" onClick={saveReschedule}>
                          Save
                        </button>
                        <button className="adm-mini" onClick={() => setEditing(null)}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        className="adm-linkish"
                        onClick={() =>
                          setEditing({ id: b.id, date: b.date, time: b.time })
                        }
                        title="Click to reschedule"
                      >
                        <strong>{b.date}</strong>
                        <span>{b.time}</span>
                      </button>
                    )}
                  </td>
                  <td>
                    <strong>{b.name}</strong>
                    <br />
                    <a href={`mailto:${b.email}`}>{b.email}</a>
                  </td>
                  <td className="adm-note">
                    {b.note || '—'}
                    <input
                      className="adm-meet"
                      type="url"
                      placeholder="Google Meet link…"
                      defaultValue={b.meetUrl || ''}
                      // Saved on blur so it doesn't fire a request per keystroke.
                      onBlur={async (e) => {
                        const meetUrl = e.target.value.trim()
                        if (meetUrl === (b.meetUrl || '')) return
                        try {
                          await api.updateBooking(b.id, { meetUrl })
                          notify(meetUrl ? 'Call link saved.' : 'Call link cleared.')
                          load()
                        } catch (err) {
                          notify(err.message, 'error')
                        }
                      }}
                    />
                  </td>
                  <td>
                    <span className={`adm-pill adm-pill--${b.status}`}>{b.status}</span>
                  </td>
                  <td className="adm-actions">
                    {b.status !== 'confirmed' && (
                      <button className="adm-mini" onClick={() => setStatus(b.id, 'confirmed')}>
                        Confirm
                      </button>
                    )}
                    {b.status !== 'cancelled' && (
                      <button className="adm-mini" onClick={() => setStatus(b.id, 'cancelled')}>
                        Cancel
                      </button>
                    )}
                    {b.status !== 'completed' && (
                      <button className="adm-mini" onClick={() => setStatus(b.id, 'completed')}>
                        Done
                      </button>
                    )}
                    <button className="adm-mini adm-mini--danger" onClick={() => remove(b.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
