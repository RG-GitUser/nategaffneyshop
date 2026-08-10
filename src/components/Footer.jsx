import { footer, profile } from '../content.js'
import { safeHref } from '../safeUrl.js'

export default function Footer() {
  return (
    <footer className="footer">
      <p className="footer__note">{footer.note}</p>
      <ul className="footer__links">
        {footer.links.map((l) => (
          <li key={l.label}>
            <a href={safeHref(l.href)}>{l.label}</a>
          </li>
        ))}
      </ul>
      <p className="footer__copy">
        © {new Date().getFullYear()} {profile.name}
      </p>
    </footer>
  )
}
