import { testimonials } from '../content.js'

export default function Testimonials() {
  if (!testimonials?.length) return null

  return (
    <section className="section testimonials">
      <div className="section__head">
        <span className="eyebrow">Receipts</span>
        <h2 className="section__title">What they said after</h2>
      </div>

      {/* Swipeable on mobile, plain grid on desktop. */}
      <ul className="testimonials__track">
        {testimonials.map((t) => (
          <li className="quote" key={t.name}>
            <p className="quote__text">{t.quote}</p>
            <p className="quote__by">
              <strong>{t.name}</strong>
              <span>{t.role}</span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
