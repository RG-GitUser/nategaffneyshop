import { useEffect } from 'react'
import CustomSection from '../components/CustomSection.jsx'
import Footer from '../components/Footer.jsx'
import { ArrowRight } from '../components/Icons.jsx'
import { profile, custom } from '../content.js'

/**
 * The generic page behind a custom container's "Link to page?" tickbox:
 * /page/?c=<container id>. One static entry serves every such container —
 * the id in the query picks which one renders, and the tab takes the
 * container's own title.
 */
export default function ContainerPage() {
  const id = new URLSearchParams(window.location.search).get('c')
  const container = custom.find((c) => c.id === id)

  useEffect(() => {
    if (container?.title) document.title = `${container.title} | ${profile.name}`
  }, [container])

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
            {container ? (
              <CustomSection container={container} full />
            ) : (
              <section className="section">
                <div className="section__head">
                  <h2 className="section__title">Nothing here</h2>
                </div>
                <p>
                  This page is empty or has been removed. Head back to the
                  main page to see what is live.
                </p>
              </section>
            )}
          </main>

          <Footer />
        </div>
      </div>
    </>
  )
}
