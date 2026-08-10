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

        <p className="profile__tagline">{profile.tagline}</p>
        <p className="profile__blurb">{profile.blurb}</p>

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

        {profile.trust && <p className="profile__trust">{profile.trust}</p>}
      </div>
    </aside>
  )
}
