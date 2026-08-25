import OfferCard from './OfferCard.jsx'

/**
 * The About Me card on the landing page: same container and button as
 * the catalog cards, linking out to the full /about/ page where the
 * profile copy (tagline, blurb, location, trust line) now lives.
 */
export default function AboutMe() {
  return (
    <section className="section">
      <div className="offers">
        <OfferCard
          offer={{
            title: 'About Me',
            blurb: "Who I am, where I'm from, and why I make things.",
            kind: 'link',
            cta: 'Get to know me',
            href: '/about/',
          }}
          index={2}
        />
      </div>
    </section>
  )
}
