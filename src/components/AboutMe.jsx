import OfferCard from './OfferCard.jsx'
import { profile, about } from '../content.js'

/** Comfortable silent-reading pace for prose. Rounds up, never below a
 *  minute — "0 min read" helps nobody. */
const WPM = 200

function readMinutes(...parts) {
  const words = parts
    .filter(Boolean)
    .join(' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
  return Math.max(1, Math.round(words / WPM))
}

/**
 * The About Me card on the landing page: same container and button as
 * the catalog cards, linking out to the full /about/ page where the
 * profile copy (tagline, blurb, location, trust line) now lives.
 *
 * The read time counts the copy AboutPage actually renders, so editing
 * the story in the dashboard moves the number with it. It has to be
 * counted here in the render rather than at module scope — loadContent()
 * merges the API's copy into these same objects in place, and that
 * finishes after this module is imported but before anything renders.
 */
export default function AboutMe() {
  const minutes = readMinutes(
    profile.tagline,
    profile.blurb,
    about?.heading,
    ...(about?.paragraphs || []),
    about?.signature,
    profile.trust,
  )

  return (
    <section className="section">
      <div className="offers">
        <OfferCard
          offer={{
            title: 'About Me',
            blurb: "Who I am, where I'm from, and why I make things.",
            kind: 'link',
            meta: `${minutes} min read`,
            cta: 'Get to know me',
            href: '/about/',
          }}
          index={2}
        />
      </div>
    </section>
  )
}
