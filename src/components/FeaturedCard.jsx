import { ArrowRight } from './Icons.jsx'
import { featured } from '../content.js'

export default function FeaturedCard() {
  if (!featured) return null

  return (
    <section className="featured rise" style={{ animationDelay: '80ms' }}>
      <div className="featured__inner">
        {featured.badge && <span className="featured__badge">{featured.badge}</span>}

        <h2 className="featured__title">{featured.title}</h2>
        {featured.subtitle && <p className="featured__subtitle">{featured.subtitle}</p>}
        <p className="featured__desc">{featured.description}</p>

        {featured.bullets?.length > 0 && (
          <ul className="featured__bullets">
            {featured.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        )}

        <div className="featured__foot">
          <div className="price">
            <span className="price__now">{featured.price}</span>
            {featured.oldPrice && <span className="price__was">{featured.oldPrice}</span>}
          </div>

          <a className="btn btn--primary featured__cta" href={featured.href}>
            {featured.cta}
            <ArrowRight width={18} height={18} />
          </a>
        </div>

        {featured.spotsLeft != null && (
          <p className="featured__spots">
            <span className="pulse" aria-hidden="true" />
            Only {featured.spotsLeft} spots left
          </p>
        )}

        {featured.note && <p className="featured__note">{featured.note}</p>}
      </div>
    </section>
  )
}
