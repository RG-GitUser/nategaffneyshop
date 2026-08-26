/**
 * A container built in the admin dashboard ("Add container"). Text fields
 * render as paragraphs (blank lines split them); image fields render
 * full-width, with the field's label as alt text. Field labels on text
 * fields are for the admin's reference only.
 *
 * With "Link to page?" ticked in the dashboard (container.page), the
 * landing shows a catalog-style card instead, whose button opens the
 * container's content on its own page at /page/?c=<id>. The page itself
 * renders through this same component with `full` set.
 */
import OfferCard from './OfferCard.jsx'
import RichText from '../richtext.jsx'
import { safeImageSrc } from '../safeUrl.js'

export default function CustomSection({ container, full = false }) {
  if (!container) return null

  const fields = (container.fields || []).filter((f) => (f.value || '').trim())

  // Nothing written yet (or everything deleted) — stay off the page.
  if (!container.title && fields.length === 0) return null

  if (container.page && !full) {
    const firstText = fields.find((f) => f.type !== 'image')
    return (
      <section className="section">
        <div className="offers">
          <OfferCard
            offer={{
              title: container.title || 'Untitled',
              blurb: firstText ? firstText.value.split('\n')[0] : undefined,
              kind: 'link',
              // The dashboard's "Highlight line" — the accent slot the
              // product cards fill with a price. Undefined when blank, so
              // the card renders nothing rather than an empty row.
              meta: container.meta || undefined,
              cta: 'Take a look',
              href: `/page/?c=${encodeURIComponent(container.id)}`,
            }}
          />
        </div>
      </section>
    )
  }

  return (
    <section className="section rise">
      {container.title && (
        <div className="section__head">
          <h2 className="section__title">{container.title}</h2>
        </div>
      )}

      <div className={`custom-copy custom-copy--${container.accent || 'navy'}`}>
        {fields.map((f, i) =>
          f.type === 'image' ? (
            safeImageSrc(f.value) && (
              <img
                key={f.id || i}
                className="custom-copy__img"
                src={safeImageSrc(f.value)}
                alt={f.label || ''}
                loading="lazy"
              />
            )
          ) : (
            // One cell per field, so fields sit side by side on wide
            // screens instead of stacking into one long column.
            <div key={f.id || i} className="custom-copy__item">
              <RichText text={f.value} />
            </div>
          ),
        )}
      </div>
    </section>
  )
}
