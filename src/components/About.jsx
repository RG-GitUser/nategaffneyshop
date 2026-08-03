import { useState } from 'react'
import { about } from '../content.js'

export default function About() {
  const [imgFailed, setImgFailed] = useState(!about.image)

  return (
    <section className="section about rise">
      <div className="about__card">
        <div className="about__media">
          {imgFailed ? (
            <div className="about__placeholder" aria-hidden="true">
              <span>Your photo here</span>
            </div>
          ) : (
            <img
              src={about.image}
              alt=""
              loading="lazy"
              onError={() => setImgFailed(true)}
            />
          )}
        </div>

        <div className="about__text">
          <span className="eyebrow">{about.eyebrow}</span>
          <h2 className="about__heading">{about.heading}</h2>
          {about.paragraphs.map((p) => (
            <p key={p.slice(0, 24)}>{p}</p>
          ))}
          <p className="about__signature">— {about.signature}</p>
        </div>
      </div>
    </section>
  )
}
