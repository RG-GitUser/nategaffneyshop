import { useEffect, useMemo, useRef, useState } from 'react'
import { Chevron, ArrowRight } from './Icons.jsx'
import { booking } from '../content.js'

/**
 * ── Swapping in a real scheduling provider ────────────────────────────
 * This calendar collects a booking *request*; it can't read Nate's real
 * availability. If he'd rather have live slots, payment and auto-confirm,
 * replace this whole component's <div className="booking__picker"> block
 * with a Cal.com or Calendly embed and keep the surrounding section markup.
 * ──────────────────────────────────────────────────────────────────────
 */

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/** Local YYYY-MM-DD. Deliberately not toISOString(), which shifts to UTC
 *  and can hand back yesterday's date for anyone west of Greenwich. */
function dateKey(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

/** Leading blanks so day 1 lands under the right weekday, then the days. */
function monthCells(year, month) {
  const cells = []
  const lead = new Date(year, month, 1).getDay()
  for (let i = 0; i < lead; i++) cells.push(null)
  const total = new Date(year, month + 1, 0).getDate()
  for (let d = 1; d <= total; d++) cells.push(new Date(year, month, d))
  return cells
}

/** '9:00 AM' → hours/minutes on a 24-hour clock. */
function parseSlot(slot) {
  const m = String(slot).trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([AP])\.?M\.?$/i)
  if (!m) return null
  let hour = Number(m[1]) % 12
  if (m[3].toUpperCase() === 'P') hour += 12
  return { hour, minute: Number(m[2] || 0) }
}

/** What tz's wall clock reads at instant t, re-encoded as a UTC epoch. */
function wallClockAt(t, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(t))
  const get = (type) => Number(parts.find((p) => p.type === type)?.value)
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'))
}

/**
 * The real moment at which `date` reads hour:minute on tz's wall clock.
 * Guess the instant as if the wall time were UTC, measure how far tz's
 * clock actually is from the target, and shift; a second pass absorbs a
 * DST boundary the first shift may have crossed.
 */
function zonedInstant(date, hour, minute, tz) {
  const target = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute)
  let t = target - (wallClockAt(target, tz) - target)
  t -= wallClockAt(t, tz) - target
  return new Date(t)
}

/**
 * One calendar, two kinds of booking. The default renders the full
 * coaching session; `type="followup"` (the unlisted /followup/ page)
 * books the short paid check-in instead — same slots, same request→
 * confirm→pay flow, its own price and copy. `copy` overrides display
 * fields only (title, description, duration, price, …); the calendar
 * mechanics always come from `booking` in content.js.
 */
export default function BookingCalendar({ type = 'session', copy = null }) {
  const today = useMemo(() => startOfDay(new Date()), [])
  const earliest = useMemo(
    () => addDays(today, booking?.leadTimeDays ?? 0),
    [today],
  )
  const latest = useMemo(
    () => addDays(today, booking?.horizonDays ?? 60),
    [today],
  )

  const [cursor, setCursor] = useState(
    () => new Date(earliest.getFullYear(), earliest.getMonth(), 1),
  )
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [form, setForm] = useState({ name: '', email: '', note: '' })
  const [done, setDone] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [price, setPrice] = useState(null) // { enabled, priceCents, currency }
  const sectionRef = useRef(null)

  useEffect(() => {
    const API_ = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
    const query = type === 'session' ? '' : `?type=${type}`
    fetch(`${API_}/api/bookings/price${query}`)
      .then((r) => r.json())
      .then(setPrice)
      .catch(() => setPrice(null))
  }, [type])

  /**
   * Slot times are written on Nate's clock (booking.timezoneName); the
   * visitor sees them on their own. What's SUBMITTED is always the
   * original slot string — the server, the dashboard, and every email
   * speak Nate's time — so the confirmation spells out both. A browser
   * that can't convert just sees the original times with the fallback
   * timezone label, exactly as before.
   */
  const viewerZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || null
    } catch {
      return null
    }
  }, [])
  const localized = Boolean(
    booking?.timezoneName && viewerZone && viewerZone !== booking.timezoneName,
  )
  const viewerZoneLabel = useMemo(() => {
    if (!localized) return null
    try {
      const part = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
        .formatToParts(new Date())
        .find((p) => p.type === 'timeZoneName')
      return part?.value || viewerZone
    } catch {
      return viewerZone
    }
  }, [localized, viewerZone])

  function slotLabel(slot, date) {
    if (!localized || !date) return slot
    const hm = parseSlot(slot)
    if (!hm) return slot
    try {
      const instant = zonedInstant(date, hm.hour, hm.minute, booking.timezoneName)
      const label = instant.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      })
      // 4:00 PM Atlantic is already tomorrow in Auckland — say so.
      const sameDay = instant.toLocaleDateString('en-CA') === dateKey(date)
      return sameDay ? label : `${label} +1 day`
    } catch {
      return slot
    }
  }

  // Display copy: page-specific overrides win, everything else falls
  // through to the shared booking section's fields.
  const c = copy ? { ...booking, ...copy } : booking

  // Content deleted in the admin dashboard also hides the section.
  if (!booking || (!c.title && !c.description)) return null

  const blackouts = booking.blackouts || []

  function isOpen(date) {
    if (!date) return false
    if (date < earliest || date > latest) return false
    if (!booking.availableDays.includes(date.getDay())) return false
    return !blackouts.includes(dateKey(date))
  }

  const cells = monthCells(cursor.getFullYear(), cursor.getMonth())

  // Don't let people page into months that can't hold a bookable day.
  const canGoBack =
    cursor > new Date(earliest.getFullYear(), earliest.getMonth(), 1)
  const canGoForward =
    cursor < new Date(latest.getFullYear(), latest.getMonth(), 1)

  function shiftMonth(delta) {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1))
  }

  function pickDate(date) {
    setSelectedDate(date)
    setSelectedSlot(null) // a slot from the old day is meaningless now
  }

  const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSending(true)
    try {
      const res = await fetch(`${API}/api/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: dateKey(selectedDate),
          time: selectedSlot,
          name: form.name,
          email: form.email,
          note: form.note,
          type,
        }),
      })
      const payload = await res.json().catch(() => null)

      if (!res.ok) {
        // 409 means someone else grabbed the slot between load and submit.
        setError(payload?.error || 'Could not send that request. Please try again.')
        return
      }

      setDone(true)

      /**
       * The confirmation is far shorter than the calendar it replaces, so
       * the section collapses by several hundred pixels the moment this
       * renders. Everything below slides up past the viewport and it reads
       * as the page jumping — with the confirmation itself now scrolled
       * off the top, unseen.
       *
       * Pull the section back into view once the new layout has been
       * painted. Two frames: the first commits the DOM change, the second
       * runs after layout has settled at its new height.
       */
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
          sectionRef.current?.scrollIntoView({
            behavior: reduced ? 'auto' : 'smooth',
            block: 'start',
          })
        }),
      )
    } catch {
      setError('Could not reach the server. Please try again in a moment.')
    } finally {
      setSending(false)
    }
  }

  const prettyDate = selectedDate
    ? selectedDate.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })
    : null

  return (
    <section className="section booking" id="book" ref={sectionRef}>
      <div className="section__head">
        <span className="eyebrow">{c.eyebrow}</span>
        <h2 className="section__title">{c.title}</h2>
      </div>

      <div className="booking__card">
        <div className="booking__intro">
          <p className="booking__desc">{c.description}</p>
          <ul className="booking__facts mono">
            <li>{price?.durationMinutes ? `${price.durationMinutes} min` : c.duration}</li>
            <li>
              {price?.priceCents ? `$${(price.priceCents / 100).toFixed(0)}` : c.price}
            </li>
            <li>{localized ? `Your time (${viewerZoneLabel})` : c.timezone}</li>
          </ul>
        </div>

        {done ? (
          <div className="booking__done" role="status">
            <p className="booking__done-title">Request sent</p>
            <p className="booking__done-when">
              {prettyDate} at {slotLabel(selectedSlot, selectedDate)}
            </p>
            {/* Emails speak Nate's time, so leave both on the receipt. */}
            {localized && (
              <p className="booking__fine mono">
                {selectedSlot} {booking.timezone} on Nate’s calendar. Emails
                will use that time.
              </p>
            )}
            <p className="booking__done-note">
              {price?.enabled
                ? "When Nate confirms, you'll get an email with a secure payment link. The spot is locked in once it's paid."
                : c.finePrint}
            </p>
          </div>
        ) : (
          <div className="booking__picker">
            {/* ── step 1: pick a day ── */}
            <div className="cal">
              <div className="cal__head">
                <button
                  type="button"
                  className="cal__nav"
                  onClick={() => shiftMonth(-1)}
                  disabled={!canGoBack}
                  aria-label="Previous month"
                >
                  <Chevron width={16} height={16} style={{ transform: 'rotate(90deg)' }} />
                </button>

                <p className="cal__month" aria-live="polite">
                  {cursor.toLocaleDateString('en-US', {
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>

                <button
                  type="button"
                  className="cal__nav"
                  onClick={() => shiftMonth(1)}
                  disabled={!canGoForward}
                  aria-label="Next month"
                >
                  <Chevron width={16} height={16} style={{ transform: 'rotate(-90deg)' }} />
                </button>
              </div>

              <div className="cal__weekdays mono" aria-hidden="true">
                {WEEKDAYS.map((d, i) => (
                  <span key={i}>{d}</span>
                ))}
              </div>

              <div className="cal__grid">
                {cells.map((date, i) => {
                  if (!date) return <span key={`blank-${i}`} className="cal__blank" />

                  const open = isOpen(date)
                  const selected =
                    selectedDate && dateKey(selectedDate) === dateKey(date)

                  return (
                    <button
                      key={dateKey(date)}
                      type="button"
                      className={`cal__day${selected ? ' is-selected' : ''}`}
                      disabled={!open}
                      aria-pressed={selected || false}
                      aria-label={date.toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                      })}
                      onClick={() => pickDate(date)}
                    >
                      {date.getDate()}
                    </button>
                  )
                })}
              </div>

              <p className="cal__legend mono">Open for booking</p>
            </div>

            {/* ── step 2: pick a time ── */}
            {selectedDate && (
              <div className="slots">
                <p className="slots__label mono">{prettyDate}</p>
                <div className="slots__grid">
                  {booking.slots.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      className={`slot${selectedSlot === slot ? ' is-selected' : ''}`}
                      aria-pressed={selectedSlot === slot}
                      onClick={() => setSelectedSlot(slot)}
                    >
                      {slotLabel(slot, selectedDate)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── step 3: who's coming ── */}
            {selectedDate && selectedSlot && (
              <form className="booking__form" onSubmit={handleSubmit}>

                <div className="booking__fields">
                  <div className="field">
                    <label htmlFor="bk-name">Name</label>
                    <input
                      id="bk-name"
                      name="name"
                      required
                      autoComplete="name"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="bk-email">Email</label>
                    <input
                      id="bk-email"
                      name="email"
                      type="email"
                      required
                      autoComplete="email"
                      inputMode="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                    />
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="bk-note">What do you want to get out of it?</label>
                  <textarea
                    id="bk-note"
                    name="note"
                    rows={3}
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                  />
                </div>

                {error && (
                  <p className="booking__error" role="alert">
                    {error}
                  </p>
                )}

                <button
                  className="btn btn--primary booking__submit"
                  type="submit"
                  disabled={sending}
                >
                  {sending ? (
                    'Sending…'
                  ) : (
                    <>
                      Request {prettyDate?.replace(/,.*/, '')} at{' '}
                      {slotLabel(selectedSlot, selectedDate)}
                      <ArrowRight width={17} height={17} />
                    </>
                  )}
                </button>

                {price?.enabled && (
                  <p className="booking__fine mono">
                    ${(price.priceCents / 100).toFixed(0)}, paid by secure link once
                    Nate confirms. Cancel a day ahead for a full refund. With less
                    notice, half is kept.
                  </p>
                )}
                <p className="booking__fine mono">{c.finePrint}</p>
              </form>
            )}
          </div>
        )}
      </div>

    </section>
  )
}
