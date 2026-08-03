import { useEffect, useState } from 'react'
import { api } from '../api.js'

const STATUSES = ['pending', 'confirmed', 'completed', 'cancelled']

export default function BookingsPanel({ notify }) {
  const [rows, setRows] = useState([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // { id, date, time }

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
          <p className="adm-sub">Confirm, reschedule or cancel booking requests.</p>
        </div>
        <select
          className="adm-select"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="adm-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="adm-muted">No bookings yet.</p>
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
              {rows.map((b) => (
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
