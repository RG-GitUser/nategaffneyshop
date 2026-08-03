import { useEffect, useState } from 'react'
import { stickyCta } from '../content.js'

/**
 * Mobile-only bar that slides up once you've scrolled past the hero.
 * Hidden on desktop, where the sticky rail already keeps the CTA in view.
 */
export default function StickyBar() {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    function onScroll() {
      setShown(window.scrollY > 420)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!stickyCta) return null

  return (
    <div className={`stickybar${shown ? ' is-shown' : ''}`}>
      <div className="stickybar__text">
        <strong>{stickyCta.label}</strong>
        <span>{stickyCta.sublabel}</span>
      </div>
      <a className="btn btn--primary stickybar__btn" href={stickyCta.href}>
        {stickyCta.cta}
      </a>
    </div>
  )
}
