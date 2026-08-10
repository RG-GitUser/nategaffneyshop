import { useState } from 'react'
import { safeImageSrc } from '../safeUrl.js'

/**
 * Shows the photo if it exists, falls back to initials on a warm gradient.
 * Means the page always looks finished, even before a headshot lands.
 *
 * Size and crop focus are controlled from CSS (--avatar-size and
 * --avatar-focus in components.css) so they can be tuned per breakpoint.
 * Pass `size` only if you need to override it for a one-off.
 */
export default function Avatar({ src, name, size }) {
  const safeSrc = safeImageSrc(src)
  const [failed, setFailed] = useState(!safeSrc)

  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')

  return (
    <div
      className="avatar"
      style={size ? { '--avatar-size': `${size}px` } : undefined}
    >
      {failed ? (
        <span className="avatar__initials" aria-hidden="true">
          {initials}
        </span>
      ) : (
        <img
          className="avatar__img"
          src={safeSrc}
          alt={name}
          onError={() => setFailed(true)}
        />
      )}
      {failed && <span className="sr-only">{name}</span>}
    </div>
  )
}
