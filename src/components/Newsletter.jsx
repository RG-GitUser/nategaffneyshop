import { useState } from 'react'
import { newsletter } from '../content.js'

export default function Newsletter() {
  const [email, setEmail] = useState('')
  const [done, setDone] = useState(false)

  // Content deleted in the admin dashboard also hides the section.
  if (!newsletter || (!newsletter.name && !newsletter.description)) return null

  function handleSubmit(e) {
    // No provider wired up yet? Confirm on the page rather than firing the
    // form at nowhere and looking broken.
    if (!newsletter.action) {
      e.preventDefault()
      setDone(true)
    }
  }

  return (
    <section className="section newsletter rise" id="newsletter">
      <div className="newsletter__inner">
        <div className="newsletter__main">
          <span className="eyebrow">{newsletter.eyebrow}</span>

          <h2 className="newsletter__title">{newsletter.name}</h2>

          <p className="newsletter__meta mono">
            {newsletter.cadence}
            {newsletter.subscribers && (
              <>
                <span className="newsletter__dot" aria-hidden="true" />
                {newsletter.subscribers}
              </>
            )}
          </p>

          <p className="newsletter__desc">{newsletter.description}</p>

          {newsletter.bullets?.length > 0 && (
            <ul className="newsletter__bullets">
              {newsletter.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}

          {done ? (
            <p className="newsletter__done" role="status">
              You’re in. Check your inbox — the first prompt is on its way.
            </p>
          ) : (
            <>
              <form
                className="newsletter__form"
                action={newsletter.action || undefined}
                method={newsletter.action ? 'post' : undefined}
                onSubmit={handleSubmit}
              >
                <label className="sr-only" htmlFor="newsletter-email">
                  Email address
                </label>
                <input
                  id="newsletter-email"
                  className="newsletter__input"
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  placeholder={newsletter.placeholder}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <button className="btn btn--primary newsletter__btn" type="submit">
                  {newsletter.cta}
                </button>
              </form>

              {newsletter.bonus && (
                <p className="newsletter__bonus">
                  <span className="newsletter__bonus-tag mono">Free bonus</span>
                  {newsletter.bonus}
                </p>
              )}
            </>
          )}

          <p className="newsletter__fine mono">{newsletter.finePrint}</p>
        </div>

        {newsletter.recentIssues?.length > 0 && (
          <div className="newsletter__issues">
            <p className="newsletter__issues-label mono">Recent issues</p>
            <ul>
              {newsletter.recentIssues.map((issue) => (
                <li key={issue.no}>
                  <span className="mono">{issue.no}</span>
                  <p>{issue.title}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}
