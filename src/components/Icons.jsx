/** Inline SVGs so the page never waits on an icon font or a CDN. */

const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}

export function Instagram(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="3.6" />
      <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function Youtube(props) {
  return (
    <svg {...base} {...props}>
      <rect x="2.5" y="5" width="19" height="14" rx="4.2" />
      <path d="M10.5 9.2v5.6l4.6-2.8-4.6-2.8z" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function Tiktok(props) {
  return (
    <svg {...base} {...props}>
      <path d="M14.2 3.2v10.4a3.4 3.4 0 1 1-3.4-3.4" />
      <path d="M14.2 3.2c.5 2.4 2 3.8 4.4 4" />
    </svg>
  )
}

export function Mail(props) {
  return (
    <svg {...base} {...props}>
      <rect x="2.5" y="4.8" width="19" height="14.4" rx="3.2" />
      <path d="m4 8 6.9 4.8a2 2 0 0 0 2.2 0L20 8" />
    </svg>
  )
}

export function ArrowRight(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4.5 12h15M13 5.5 19.5 12 13 18.5" />
    </svg>
  )
}

export function Star(props) {
  return (
    <svg {...base} viewBox="0 0 24 24" fill="currentColor" stroke="none" {...props}>
      <path d="m12 3.2 2.6 5.6 6.1.8-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.6l6.1-.8L12 3.2z" />
    </svg>
  )
}

export function Chevron(props) {
  return (
    <svg {...base} {...props}>
      <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />
    </svg>
  )
}

export function Pin(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 21s7-5.6 7-10.4a7 7 0 1 0-14 0C5 15.4 12 21 12 21z" />
      <circle cx="12" cy="10.4" r="2.6" />
    </svg>
  )
}

export function Sun(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
    </svg>
  )
}

export function Moon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M20 13.5A8 8 0 1 1 10.5 4a6.4 6.4 0 0 0 9.5 9.5z" />
    </svg>
  )
}

export const socialIcons = {
  instagram: Instagram,
  youtube: Youtube,
  tiktok: Tiktok,
  mail: Mail,
}
