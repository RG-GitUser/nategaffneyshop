import { Fragment, useEffect, useState } from 'react'
import { api } from '../api.js'
import { StatusBar, VizToggle } from './charts.jsx'
import { confirmDialog } from '../confirm.jsx'

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
  type: 'session',
  status: 'confirmed',
  createEvent: true,
  notifyCustomer: true,
}

/** The two things people can book: the full session, and the short
 *  follow-up call offered by direct link (/followup/) to past clients. */
const PRICE_KINDS = [
  { type: 'session', label: 'Session', plural: 'Sessions' },
  { type: 'followup', label: 'Follow-up', plural: 'Follow-up calls' },
]

export default function BookingsPanel({ notify }) {
  const [rows, setRows] = useState([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // { id, date, time }
  const [view, setView] = useState('active') // active | archived (completed)
  const [draft, setDraft] = useState(null) // manual-booking modal state
  const [creating, setCreating] = useState(false)
  const [googleOn, setGoogleOn] = useState(false)
  // Dollars strings by booking type; '' = payments off for that type.
  const [prices, setPrices] = useState({ session: '', followup: '' })
  const [savingPrice, setSavingPrice] = useState('') // type being saved
  /**
   * The session length lives with the calendar settings (it also sizes
   * the Google event), but it's edited here beside the price — one
   * place for "what a session costs and how long it runs". Saving posts
   * the calendar settings back with only the length changed, so the
   * calendar id and timezone ride along untouched.
   */
  const [calSettings, setCalSettings] = useState(null)
  const [sessionLen, setSessionLen] = useState('')
  const [savingLen, setSavingLen] = useState(false)

  useEffect(() => {
    api
      .googleStatus()
      .then((g) => {
        setGoogleOn(Boolean(g.connected))
        setCalSettings({ calendarId: g.calendarId, timeZone: g.timeZone })
        setSessionLen(g.durationMinutes ? String(g.durationMinutes) : '')
      })
      .catch(() => {})
    for (const { type } of PRICE_KINDS) {
      api
        .bookingPrice(type)
        .then((p) =>
          setPrices((prev) => ({
            ...prev,
            [type]: p.priceCents ? (p.priceCents / 100).toFixed(2) : '',
          })),
        )
        .catch(() => {})
    }
  }, [])

  async function savePrice(type) {
    const raw = prices[type]
    const n = Number(raw)
    const priceCents = raw.trim() === '' ? null : Math.round(n * 100)
    if (priceCents !== null && (!Number.isFinite(n) || priceCents < 50)) {
      notify('Enter a price of at least $0.50, or leave blank to turn payments off.', 'error')
      return
    }
    setSavingPrice(type)
    try {
      await api.saveBookingPrice({ priceCents, currency: 'cad', type })
      const { plural } = PRICE_KINDS.find((k) => k.type === type)
      notify(
        priceCents
          ? `${plural} now cost $${(priceCents / 100).toFixed(2)} at booking.`
          : `${plural} are free again. Payments are off.`,
      )
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setSavingPrice('')
    }
  }

  async function saveSessionLen() {
    const minutes = Number(sessionLen)
    if (!Number.isInteger(minutes) || minutes < 15 || minutes > 240) {
      notify('Session length must be between 15 and 240 minutes.', 'error')
      return
    }
    setSavingLen(true)
    try {
      await api.googleSaveSettings({
        calendarId: (calSettings?.calendarId || 'primary').trim(),
        timeZone: (calSettings?.timeZone || 'America/Halifax').trim(),
        durationMinutes: minutes,
      })
      notify(
        `Sessions now run ${minutes} minutes — on the booking page and on calendar invites.`,
      )
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setSavingLen(false)
    }
  }

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

  /** Cancelling a PAID booking asks what to refund — the 24-hour rule is
   *  Nate's guideline, not the machine's; he picks per case. */
  async function cancelBooking(b) {
    if (!b.paid || !b.paymentIntent) {
      setStatus(b.id, 'cancelled')
      return
    }
    const amount = b.paidAmount || 0
    const money = (c) => `$${(c / 100).toFixed(2)}`
    const choice = await confirmDialog({
      title: `Cancel ${b.name}'s session?`,
      message:
        `They paid ${money(amount)}. Policy: a day's notice → full refund; ` +
        `less → half is kept. Your call:`,
      cancelLabel: 'Keep booking',
      choices: [
        { value: 'none', label: 'No refund', danger: true },
        { value: 'half', label: `Refund ${money(Math.round(amount / 2))}` },
        { value: 'full', label: `Refund ${money(amount)}` },
      ],
    })
    if (!choice) return
    try {
      await api.updateBooking(b.id, { status: 'cancelled' })
      if (choice !== 'none') {
        const cents = choice === 'full' ? amount : Math.round(amount / 2)
        await api.refund(b.paymentIntent, { amount: cents })
        notify(`Cancelled and refunded ${money(cents)}.`)
      } else {
        notify('Cancelled. No refund issued.')
      }
      load()
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  async function setStatus(id, status) {
    try {
      const result = await api.updateBooking(id, { status })
      notify(`Booking marked ${status}.`)
      // Surface partial failures (calendar sync, payment link) — the
      // update went through, but Nate needs to know what didn't.
      for (const w of result.warnings || []) notify(w, 'error')
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
    const ok = await confirmDialog({
      title: 'Delete this booking?',
      message: 'It is removed permanently. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
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
            Confirm, reschedule or cancel requests, or book someone in yourself.
          </p>
        </div>
        <div className="adm-toolbar">
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
          {/* Stays mounted in both views — unmounting it made the whole
              toolbar reflow and the buttons jump when switching. */}
          <select
            className="adm-select"
            style={view === 'active' ? undefined : { visibility: 'hidden' }}
            aria-hidden={view !== 'active'}
            tabIndex={view === 'active' ? undefined : -1}
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
          {PRICE_KINDS.map(({ type, label }) => (
            <Fragment key={type}>
              <div
                className="adm-inline"
                title={`${label} price. When set, confirming a booking emails the customer a payment link. Blank = free.`}
              >
                <span className="adm-who">{label} $</span>
                <input
                  className="adm-search"
                  style={{ width: 90 }}
                  type="number"
                  min="0.50"
                  step="0.01"
                  placeholder="off"
                  value={prices[type]}
                  onChange={(e) => setPrices({ ...prices, [type]: e.target.value })}
                />
                <button
                  className="adm-mini"
                  onClick={() => savePrice(type)}
                  disabled={savingPrice === type}
                >
                  {savingPrice === type ? 'Saving…' : 'Set'}
                </button>
              </div>
              {type === 'session' && (
                <div
                  className="adm-inline"
                  title="How long a session runs — shown on the booking page and used for the length of the calendar invite."
                >
                  <span className="adm-who">Length</span>
                  <input
                    className="adm-search"
                    style={{ width: 70 }}
                    type="number"
                    min="15"
                    max="240"
                    step="5"
                    placeholder="45"
                    value={sessionLen}
                    onChange={(e) => setSessionLen(e.target.value)}
                  />
                  <span className="adm-who">min</span>
                  <button
                    className="adm-mini"
                    onClick={saveSessionLen}
                    disabled={savingLen}
                  >
                    {savingLen ? 'Saving…' : 'Set'}
                  </button>
                </div>
              )}
            </Fragment>
          ))}
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
                  <label htmlFor="nb-type">Kind</label>
                  <select
                    id="nb-type"
                    value={draft.type}
                    onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                  >
                    <option value="session">session</option>
                    <option value="followup">follow-up call</option>
                  </select>
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
            ? 'Nothing archived yet. Mark a booking Done and it moves here.'
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
                    {b.type === 'followup' && (
                      <>
                        {' '}
                        <span className="adm-pill">follow-up</span>
                      </>
                    )}
                    {b.paid && (
                      <>
                        {' '}
                        <span className="adm-pill adm-pill--confirmed">paid</span>
                      </>
                    )}
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
                    {/* "paid" lives beside the customer's name; here only
                        the still-owing state needs calling out. */}
                    {!b.paid && b.payUrl && b.status === 'confirmed' && (
                      <>
                        {' '}
                        <span className="adm-pill adm-pill--pending">unpaid</span>
                      </>
                    )}
                  </td>
                  <td className="adm-actions">
                    {b.status !== 'confirmed' && (
                      <button className="adm-mini" onClick={() => setStatus(b.id, 'confirmed')}>
                        Confirm
                      </button>
                    )}
                    {b.status !== 'cancelled' && (
                      <button className="adm-mini" onClick={() => cancelBooking(b)}>
                        Cancel
                      </button>
                    )}
                    {!b.paid && b.payUrl && (
                      <button
                        className="adm-mini"
                        title="Copy the payment link (it's also in their confirmation email)"
                        onClick={() => {
                          navigator.clipboard
                            .writeText(b.payUrl)
                            .then(() => notify('Payment link copied.'))
                            .catch(() => notify(b.payUrl))
                        }}
                      >
                        Pay link
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
