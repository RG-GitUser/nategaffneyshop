import { ArrowRight } from '../components/Icons.jsx'
import { profile, footer } from '../content.js'

/**
 * Shared layout for the Privacy and Terms pages.
 *
 * The content files use a little inline HTML (<strong>, <a>, <br />) so the
 * legal copy can carry emphasis and links without turning every clause into
 * JSX. That's rendered with dangerouslySetInnerHTML, which is safe here
 * because the source is our own authored files — never user input. Don't
 * pass anything user-supplied through this component.
 */

/** Highlights anything still in [square brackets] so unfilled placeholders
 *  are obvious on the page instead of quietly going live. There are no
 *  legitimate square brackets in the legal copy, so matching all of them
 *  is safe — and the highlighting vanishes once they're all replaced. */
function flagPlaceholders(html) {
  return html.replace(/\[[^\]]+\]/g, (m) => `<mark class="legal__todo">${m}</mark>`)
}

function Html({ as: Tag = 'p', html, ...rest }) {
  return <Tag dangerouslySetInnerHTML={{ __html: flagPlaceholders(html) }} {...rest} />
}

export default function LegalPage({ doc }) {
  return (
    <>
      <div className="legal">
        <div className="legal__inner">
          <a className="legal__back" href="/">
            <ArrowRight
              width={16}
              height={16}
              style={{ transform: 'rotate(180deg)' }}
            />
            Back to {profile.name}
          </a>

          <header className="legal__head">
            <h1 className="legal__title">{doc.title}</h1>
            <p className="legal__updated mono">Last updated {doc.updated}</p>
          </header>

          <div className="legal__intro">
            {doc.intro.map((p) => (
              <Html key={p.slice(0, 30)} html={p} />
            ))}
          </div>

          {doc.sections.map((s) => (
            <section className="legal__section" key={s.heading}>
              <h2>{s.heading}</h2>

              {s.paragraphs?.map((p) => (
                <Html key={p.slice(0, 30)} html={p} />
              ))}

              {s.listTitle && <p className="legal__list-title">{s.listTitle}</p>}

              {s.list && (
                <ul>
                  {s.list.map((li) => (
                    <Html as="li" key={li.slice(0, 30)} html={li} />
                  ))}
                </ul>
              )}

              {s.after?.map((p) => (
                <Html key={p.slice(0, 30)} html={p} />
              ))}
            </section>
          ))}

          <footer className="legal__foot">
            <ul className="footer__links">
              <li>
                <a href="/">Home</a>
              </li>
              {footer.links.map((l) => (
                <li key={l.label}>
                  <a href={l.href}>{l.label}</a>
                </li>
              ))}
            </ul>
            <p className="footer__copy">
              © {new Date().getFullYear()} {profile.name}
            </p>
          </footer>
        </div>
      </div>
    </>
  )
}
