import { Chevron } from './Icons.jsx'
import { faqs } from '../content.js'

export default function Faq() {
  if (!faqs?.length) return null

  return (
    <section className="section faq">
      <div className="section__head">
        <span className="eyebrow">Before you buy</span>
        <h2 className="section__title">The stuff people ask</h2>
      </div>

      <div className="faq__list">
        {faqs.map((item) => (
          // <details> gives us accessible open/close for free — no state, no JS.
          <details className="faq__item" key={item.q} name="faq">
            <summary className="faq__q">
              {item.q}
              <Chevron className="faq__chevron" width={18} height={18} />
            </summary>
            <p className="faq__a">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
