import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { confirmDialog } from '../confirm.jsx'

export default function AccountPanel({ notify, me }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [google, setGoogle] = useState(null)
  const [cal, setCal] = useState(null) // editable copy of the calendar options
  const [savingCal, setSavingCal] = useState(false)

  const loadGoogle = () =>
    api
      .googleStatus()
      .then((g) => {
        setGoogle(g)
        setCal({
          calendarId: g.calendarId,
          timeZone: g.timeZone,
          durationMinutes: g.durationMinutes,
        })
      })
      .catch(() => setGoogle(null))
  useEffect(() => {
    loadGoogle()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function saveCalendarSettings(e) {
    e.preventDefault()
    setSavingCal(true)
    try {
      await api.googleSaveSettings({
        calendarId: cal.calendarId.trim(),
        timeZone: cal.timeZone.trim(),
        durationMinutes: Number(cal.durationMinutes),
      })
      notify('Calendar settings saved. New events use them right away.')
      loadGoogle()
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setSavingCal(false)
    }
  }

  async function connectGoogle() {
    try {
      const { url } = await api.googleConnect()
      // Full redirect, not a popup — Google blocks its consent screen in
      // many popup/embedded contexts.
      window.location.href = url
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  async function disconnectGoogle() {
    const sure = await confirmDialog({
      title: 'Disconnect Google Calendar?',
      message: 'New bookings will stop getting Meet links and calendar invites.',
      confirmLabel: 'Disconnect',
      danger: true,
    })
    if (!sure) return
    try {
      await api.googleDisconnect()
      notify('Google Calendar disconnected.')
      loadGoogle()
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  async function submit(e) {
    e.preventDefault()
    if (next !== confirm) {
      notify('The two new passwords do not match.', 'error')
      return
    }
    if (next.length < 12) {
      notify('New password must be at least 12 characters.', 'error')
      return
    }
    setBusy(true)
    try {
      await api.changePassword(current, next)
      notify('Password changed.')
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="adm-panel-head">
        <div>
          <h2 className="adm-h2">Account</h2>
          <p className="adm-sub">Signed in as {me.email}.</p>
        </div>
      </div>

      <section className="adm-group" style={{ maxWidth: 480 }}>
        <h3 className="adm-h3">Change password</h3>
        <p className="adm-sub">
          Twelve characters minimum. A long phrase you can remember beats a short
          one full of symbols.
        </p>

        <form className="adm-form" onSubmit={submit}>
          <div className="adm-field">
            <label htmlFor="pw-current">Current password</label>
            <input
              id="pw-current"
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div className="adm-field">
            <label htmlFor="pw-new">New password</label>
            <input
              id="pw-new"
              type="password"
              autoComplete="new-password"
              required
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </div>
          <div className="adm-field">
            <label htmlFor="pw-confirm">Repeat new password</label>
            <input
              id="pw-confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <button className="btn btn--primary adm-btn-block" disabled={busy}>
            {busy ? 'Saving…' : 'Change password'}
          </button>
        </form>
      </section>

      {/* Only rendered once GOOGLE_CLIENT_ID / SECRET exist on the server —
          until then the section would just be setup instructions. */}
      {google?.configured && (
        <section className="adm-group" style={{ maxWidth: 480 }}>
          <h3 className="adm-h3">Google Calendar</h3>

          {google.connected ? (
            <>
              <p className="adm-sub">
                Connected{google.accountEmail ? (
                  <>
                    {' '}as <strong>{google.accountEmail}</strong>
                  </>
                ) : null}
                . Confirming a booking creates a calendar event, mints a Google
                Meet room, and emails the invite.
              </p>

              <form className="adm-form" onSubmit={saveCalendarSettings}>
                <div className="adm-grid">
                  <div className="adm-field">
                    <label htmlFor="g-cal">Calendar</label>
                    <input
                      id="g-cal"
                      value={cal?.calendarId ?? ''}
                      onChange={(e) => setCal({ ...cal, calendarId: e.target.value })}
                      placeholder="primary"
                    />
                  </div>
                  <div className="adm-field">
                    <label htmlFor="g-tz">Time zone</label>
                    <input
                      id="g-tz"
                      value={cal?.timeZone ?? ''}
                      onChange={(e) => setCal({ ...cal, timeZone: e.target.value })}
                      placeholder="America/Halifax"
                    />
                  </div>
                  <div className="adm-field">
                    <label htmlFor="g-dur">Session length (minutes)</label>
                    <input
                      id="g-dur"
                      type="number"
                      min={15}
                      max={240}
                      step={5}
                      value={cal?.durationMinutes ?? 45}
                      onChange={(e) => setCal({ ...cal, durationMinutes: e.target.value })}
                    />
                  </div>
                </div>
                <p className="adm-muted">
                  "primary" is the connected account's main calendar. To use another
                  calendar, paste its ID from Google Calendar → Settings → "Integrate
                  calendar".
                </p>
                <div className="adm-actions">
                  <button className="btn btn--primary adm-save" disabled={savingCal}>
                    {savingCal ? 'Saving…' : 'Save calendar settings'}
                  </button>
                  <button
                    type="button"
                    className="adm-mini adm-mini--danger"
                    onClick={disconnectGoogle}
                  >
                    Disconnect
                  </button>
                </div>
              </form>
            </>
          ) : (
            <>
              <p className="adm-sub">
                Connect once and every confirmed booking gets a Meet link and a
                calendar invite automatically.
              </p>
              <div className="adm-actions" style={{ marginTop: 18 }}>
                <button className="btn btn--primary adm-save" onClick={connectGoogle}>
                  Connect Google Calendar
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  )
}
