import { useState } from 'react'
import { ArrowRight } from './Icons.jsx'
import { featuredVideo } from '../content.js'

export default function FeaturedVideo() {
  const [failed, setFailed] = useState(!featuredVideo?.thumbnail)

  if (!featuredVideo) return null

  return (
    <section className="film rise">
      <a
        className="film__card"
        href={featuredVideo.href}
        target="_blank"
        rel="noreferrer noopener"
      >
        <div className="film__media">
          {failed ? (
            <div className="film__fallback" aria-hidden="true" />
          ) : (
            <img
              src={featuredVideo.thumbnail}
              alt=""
              loading="eager"
              onError={() => setFailed(true)}
            />
          )}

        </div>

        <div className="film__body">
          {featuredVideo.eyebrow && (
            <span className="eyebrow">{featuredVideo.eyebrow}</span>
          )}

          <h2 className="film__title">{featuredVideo.title}</h2>
          {featuredVideo.subtitle && (
            <p className="film__subtitle mono">{featuredVideo.subtitle}</p>
          )}

          {featuredVideo.blurb && <p className="film__blurb">{featuredVideo.blurb}</p>}

          <span className="film__cta">
            {featuredVideo.cta}
            <ArrowRight width={16} height={16} />
          </span>
        </div>
      </a>
    </section>
  )
}
