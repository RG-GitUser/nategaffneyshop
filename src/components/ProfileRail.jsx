import Avatar from './Avatar.jsx'
import { socialIcons, Pin } from './Icons.jsx'
import { profile, socials } from '../content.js'
import { safeHref } from '../safeUrl.js'

export default function ProfileRail() {
  return (
    <aside className="rail rise">
      <div className="profile">
        <Avatar src={profile.avatar} name={profile.name} />

        <h1 className="profile__name">{profile.name}</h1>
        <p className="profile__handle">{profile.handle}</p>

        {/* Tagline, blurb and the trust line moved into the About Me
            container — the rail keeps just the identity essentials. */}

        {profile.location && (
          <p className="profile__location">
            <Pin width={14} height={14} />
            {profile.location}
          </p>
        )}

        <ul className="socials">
          {socials.map((s) => {
            const Icon = socialIcons[s.icon]
            const href = safeHref(s.href)
            return (
              <li key={s.label}>
                <a
                  className="socials__link"
                  href={href}
                  target={href.startsWith('http') ? '_blank' : undefined}
                  rel="noreferrer"
                  aria-label={s.label}
                >
                  {Icon && <Icon />}
                </a>
              </li>
            )
          })}
        </ul>
      </div>
    </aside>
  )
}
