import { useState } from 'react'
import { about } from '../content.js'
import { safeImageSrc } from '../safeUrl.js'

export default function About() {
  const [imgFailed, setImgFailed] = useState(false)

  // Content deleted in the admin dashboard hides the section.
  if (!about.heading && !(about.paragraphs || []).length) return null

  // No image configured (or it 404'd) — drop the media column entirely
  // rather than leaving an empty placeholder panel behind.
  const image = safeImageSrc(about.image)
  const showMedia = Boolean(image) && !imgFailed

  return (
    <section className="section about rise">
      <div className={`about__card${showMedia ? '' : ' about__card--text-only'}`}>
        {showMedia && (
          <div className="about__media">
            <img
              src={image}
              alt=""
              loading="lazy"
              onError={() => setImgFailed(true)}
            />
          </div>
        )}

        <div className="about__text">
          <span className="eyebrow">{about.eyebrow}</span>
          <h2 className="about__heading">{about.heading}</h2>
          {about.paragraphs.map((p) => (
            <p key={p.slice(0, 24)}>{p}</p>
          ))}
          <p className="about__signature">{about.signature}</p>
        </div>
      </div>
    </section>
  )
}
