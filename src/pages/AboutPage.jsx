import Avatar from '../components/Avatar.jsx'
import Footer from '../components/Footer.jsx'
import { ArrowRight, Pin } from '../components/Icons.jsx'
import { profile, about } from '../content.js'

/**
 * The about page at /about/, linked from the About Me card on the
 * landing page. Everything the rail used to say under the name —
 * tagline, blurb, location, trust line — in the same container style
 * as the catalog cards.
 */
export default function AboutPage() {
  return (
    <>
      <div className="page">
        <div className="shell">
          <header className="coaching-head rise">
            <a className="coaching-back" href="/">
              <ArrowRight
                width={16}
                height={16}
                style={{ transform: 'rotate(180deg)' }}
              />
              Back to {profile.name}
            </a>
          </header>

          <main className="stack">
            <section className="section">
              <div className="offers">
                <div className="offer rise about-me">
                  <div className="offer__body">
                    <Avatar src={profile.avatar} name={profile.name} />
                    <h1 className="offer__title">About Me</h1>
                    <p className="about-me__handle">{profile.handle}</p>
                    <p className="about-me__tagline">{profile.tagline}</p>
                    <p className="about-me__blurb">{profile.blurb}</p>
                    {profile.location && (
                      <p className="about-me__location">
                        <Pin width={14} height={14} />
                        {profile.location}
                      </p>
                    )}

                    {/* The longer story, shown only here, never on the
                        landing page. */}
                    {about?.paragraphs?.length > 0 && (
                      <div className="about-me__story">
                        {about.heading && <h2>{about.heading}</h2>}
                        {about.paragraphs.map((p) => (
                          <p key={p.slice(0, 32)}>{p}</p>
                        ))}
                        {about.signature && (
                          <p className="about-me__signature">{about.signature}</p>
                        )}
                      </div>
                    )}

                    {profile.trust && (
                      <p className="about-me__trust">{profile.trust}</p>
                    )}
                  </div>
                </div>
              </div>
            </section>
            <Footer />
          </main>
        </div>
      </div>
    </>
  )
}
