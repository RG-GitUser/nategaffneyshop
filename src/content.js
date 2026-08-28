/**
 * ─────────────────────────────────────────────────────────────
 *  EDIT EVERYTHING HERE.
 *  This is the only file Nate should ever need to touch to change
 *  copy, prices, links, or which offers show up. No JSX required.
 * ─────────────────────────────────────────────────────────────
 */

/**
 * The order of the main sections on the page, top to bottom.
 * Rearrange in the admin dashboard (Content tab) or here. Unknown ids are
 * ignored; any section missing from this list renders at the end, so
 * nothing can disappear by accident.
 */
export const sections = ['offers', 'services', 'coachingCard', 'aboutMe']

/**
 * Custom containers added from the admin dashboard (Content tab →
 * "Add container"). Each is { id, title, fields: [{ id, label, value }] }
 * and renders as its own section, positioned by the `sections` order.
 */
export const custom = []

/**
 * Archived section ids: kept with all their content but left off the
 * public page until restored from the dashboard. Nothing here is
 * deleted — the copy further down this file is untouched and every one
 * of these comes back the moment its id moves into `sections` above.
 *
 * Everything but the two things for sale is parked here for now, so the
 * page is the portrait, the workbook, and the audit.
 *
 * 'booking' is the one that was already archived and should stay that
 * way: the coaching calendar lives on its own page at /coaching/, shared
 * as a direct link, and works from there whether or not it's on the
 * landing page.
 */
export const archived = [
  'featuredVideo',
  'about',
  'newsletter',
  'testimonials',
  'faqs',
  'booking',
]

/**
 * Service cards, managed entirely from the admin Services tab. Shaped
 * like offers: { title, description, price, tag, cta, href, accent }.
 * Empty list hides the section.
 *
 * The live dashboard is the source of truth — /api/services replaces
 * this list wholesale on load. It's written out here so the audit still
 * renders if the API is ever unreachable.
 *
 * `href: '#book'` points at the coaching calendar, which is archived (see
 * `archived` above), so the card is a display price rather than a jump —
 * same as it behaves in production.
 */
export const services = [
  {
    title: 'Content Audit',
    description:
      "A deep dive into your Instagram, delivered as a video walkthrough of what's working, what isn't, and what to do next. The Workbook is included.",
    blurb: "A video walkthrough of what's working on your Instagram and what to do next.",
    price: '$750 / Audit',
    cta: 'Book',
    // The card links to the audit's own page; Services.jsx enforces this
    // even when the dashboard-stored card still says '#book'.
    href: '/audit/',
    accent: 'navy',
  },
]

/**
 * The audit's own page at /audit/. The card above stays terse; the page
 * runs the service's FULL description from the dashboard Services tab,
 * plus everything here. Title, price and the charge amount come from
 * the service entry too — `intro` below is only a fallback for when the
 * stored card has no description at all.
 */
export const auditPage = {
  eyebrow: 'Work with me',
  intro: [
    'The Content Audit is a deep dive into your Instagram page. I study your content the way a new visitor would — what you’re posting, how it’s landing, and how it all reads to someone finding you for the first time.',
    'You get it back as a video walkthrough: me, on your page, showing you what’s working, what isn’t, and exactly what to do next.',
  ],
  listTitle: 'What you get',
  list: [
    'A recorded video walkthrough of your page, yours to keep',
    'What’s working, and what’s quietly holding you back',
    'A concrete plan for what to post next, and why',
    'The Essential Creator’s Workbook, included',
  ],
  finePrint: 'After you book, I’ll email you to line everything up.',
}

export const profile = {
  name: 'Nate Gaffney',
  handle: '@nategaffney',
  // Short + human. This is the first thing someone reads after tapping your bio link.
  tagline: 'Wolastoqey filmmaker.',
  blurb:
    'Obsessed with turning inner life into art. Director, writer, journaler, creative director. Never just one thing.',
  // Web-sized copy (720×1280, ~100KB). The 3.8MB original is kept alongside
  // it as profilepicture-source.jpg for the OG image / print use.
  // If the file goes missing the page falls back to initials — nothing breaks.
  avatar: '/images/profilepicture.jpg',
  location: 'Wabanaki territory',
  // Social proof line under the name. Set to null to hide it.
  trust: 'Co-owner of Wabanaki Media · Indigenous storytelling & media production',
}

export const socials = [
  { label: 'Instagram', href: 'https://www.instagram.com/nategaffney/', icon: 'instagram' },
  { label: 'YouTube', href: 'https://www.youtube.com/@nategaffney', icon: 'youtube' },
  { label: 'TikTok', href: 'https://www.tiktok.com/@nategaffney', icon: 'tiktok' },
  { label: 'Email', href: 'mailto:support@nategaffney.store', icon: 'mail' },
]

/**
 * Featured video at the top of the page. Set to null to remove it.
 *
 * The thumbnail is stored locally rather than hotlinked from YouTube, so the
 * page doesn't depend on a third-party request to render. To swap in a new
 * video, download its thumbnail to public/images/ and update both fields:
 *   https://i.ytimg.com/vi/<VIDEO_ID>/maxresdefault.jpg
 */
export const featuredVideo = {
  // Set eyebrow to null to drop the small label above the title.
  eyebrow: null,
  title: 'Why Create?',
  subtitle: 'Canon R5 Short Film',
  blurb:
    'Please enjoy this stream of consciousness montage video focusing on why I think creating things is worth it.',
  thumbnail: '/images/video-54s5a4VuIY4.jpg',
  href: 'https://www.youtube.com/watch?v=54s5a4VuIY4',
  cta: 'Watch on YouTube',
}

/**
 * Everything else, in the order you want it shown.
 * Cards are auto-numbered 01, 02, 03 in the order below.
 * kind: 'product' (has a price) | 'link' (just goes somewhere)
 * accent: 'navy' | 'red' | 'umber' | 'olive' | 'amber'
 */
export const offers = [
  {
    kind: 'pdf',
    title: "Essential Creator's Workbook",
    description:
      'A PDF that replaces guessing what to post with a repeatable weekly system: your pillars, an ideas bank, and checklists for filming, editing and publishing.',
    // One line for the card itself; the fuller description above stays
    // for anywhere with room for it.
    blurb: 'A repeatable weekly posting system, in one PDF.',
    // Stored in the dashboard as a bare "25"; written with the symbol
    // here because the card prints this string verbatim.
    price: '$25',
    cta: 'Get the PDF',
    href: '#',
    accent: 'navy',
    tag: 'Perfect place to start',
  },
]

/**
 * Coaching calendar. Always shown on its own page at /coaching/; only on
 * the landing page when restored from the archive (see `archived` above).
 * Set to null to remove it everywhere.
 *
 * IMPORTANT: this collects a booking *request*. It can't see Nate's real
 * calendar, so it can't prevent two people picking the same slot. Either
 * confirm requests by hand, or point `action` at a real backend. To swap in
 * Cal.com / Calendly instead, see the note in BookingCalendar.jsx.
 */
export const booking = {
  eyebrow: 'Book a session',
  title: '1:1 Coaching',
  // The one-liner on the landing page's coaching card (the fuller
  // description below lives on the booking page itself).
  blurb: 'Forty-five minutes on whatever is actually in your way.',
  description:
    'Forty-five minutes on whatever’s actually in your way: a rough cut, pricing, burnout, the work you keep not making. Pick a time that works and tell me what you want to get out of it.',
  duration: '45 min',
  price: '$150',
  // Fallback label, shown only when a browser can't convert timezones.
  timezone: 'Atlantic Time (AT)',
  // The IANA zone the slot times below are written in. Visitors see every
  // time converted from this zone to their own clock.
  timezoneName: 'America/Halifax',
  // Weekdays open for booking. 0 = Sunday … 6 = Saturday.
  availableDays: [1, 2, 3, 4],
  // Slots offered on any available day, on Nate's clock (timezoneName).
  slots: ['8:00 AM', '9:00 AM', '10:30 AM', '1:00 PM', '2:30 PM', '4:00 PM'],
  // No same-day bookings — needs this many days of notice.
  leadTimeDays: 2,
  // How far ahead the calendar opens up.
  horizonDays: 60,
  // Specific days off, as 'YYYY-MM-DD'.
  blackouts: [],
  // Handled by the API server now — BookingCalendar posts to /api/bookings,
  // which stores the request and shows up in the admin Calendar tab.
  action: null,
  finePrint:
    'You’ll get an email to confirm the time and handle payment. Reschedule or cancel free up to 24 hours before.',
}

/**
 * The follow-up call — a short paid check-in for people Nate has already
 * coached. Lives only at /followup/, handed out as a direct link; it is
 * never linked from the landing page. Only the COPY lives here — the
 * calendar mechanics (slots, days, blackouts, timezone) are shared with
 * `booking` above, and the price/length come from the API
 * (/api/bookings/price?type=followup — $50 / 15 min until changed in the
 * admin Calendar tab).
 */
export const followup = {
  eyebrow: 'Follow-up',
  title: 'Follow-up call',
  description:
    'A quick 15-minute check-in for people I’ve already worked with: where you’ve landed since the session, what’s stuck, and what to do next. Pick a time and I’ll confirm by email.',
  duration: '15 min',
  price: '$50',
  finePrint:
    'You’ll get an email to confirm the time and handle payment. Reschedule or cancel free up to 24 hours before.',
}

/**
 * The newsletter — the main email capture on the page.
 * The 7-Day Story Starter rides along as the signup bonus so there's only
 * one form competing for attention. Set to null to remove the section.
 */
export const newsletter = {
  eyebrow: 'The newsletter',
  name: 'Stay in the Loop',
  cadence: 'Sunday mornings',
  description:
    'What I’m making, what’s working, and what flopped that week. Written the same way I’d text it to a friend who’s also figuring this out.',
  bullets: [
    'One idea you can use on your next shoot',
    'A breakdown of something that performed, and why',
    'The honest numbers, including the bad ones',
  ],
  bonus:
    'Join and I’ll send you The 7-Day Story Starter: one prompt a day until you’ve got something worth filming.',
  cta: 'Subscribe',
  placeholder: 'you@email.com',
  // Where the email goes. Point this at your ConvertKit / Beehiiv / Substack
  // form action URL. Leave as null and it shows a confirmation instead.
  action: null,
  // Set to a real figure to show a subscriber count, or leave null to hide it.
  subscribers: null,
  finePrint: 'One email a week. Unsubscribe anytime.',
  // Optional right-hand rail of recent issues. Empty = hidden, and the
  // signup form takes the full width. Add rows as { no, title } to bring
  // it back once there are real issues to show.
  recentIssues: [],
}

export const about = {
  eyebrow: 'Hey, I’m Nate',
  heading: 'You were never just one thing.',
  paragraphs: [
    'I’m a Wolastoqey filmmaker obsessed with turning inner life into art.',
    'But I’m also a director, a writer, a journaler, a creative director, and I’ve never been able to fit into just one box. For a long time I thought that was a problem.',
    'It’s not. It’s the whole point.',
    'Everything here is for creators who are made of many parts and tired of pretending otherwise. We talk about filmmaking, journaling, and the deeper work of building a creative life that actually looks like you.',
    'Welcome to the Nicheless Nomad.',
  ],
  // Set to an image path to show a photo beside the text, or null for
  // text only. The card lays itself out either way.
  image: null,
  signature: 'Nate',
}

/**
 * Empty, so the whole section stays off the page.
 * Add real ones as { quote, name, role } and it reappears on its own —
 * only ever put words in here that someone actually said.
 */
export const testimonials = []

export const faqs = [
  {
    q: 'Is this for total beginners?',
    a: 'Yes. The guide and the preset pack assume you know basically nothing. The cohort is better if you’ve already posted a few things and want to get serious.',
  },
  {
    q: 'What gear do I need?',
    a: 'A phone. Genuinely. Every framework here works on a phone, and most of my early stuff was shot on one.',
  },
  {
    q: 'Do I get the files forever?',
    a: 'Forever. Guides, presets, and cohort recordings are all yours to keep, including any updates I make later.',
  },
  {
    q: 'What if it’s not for me?',
    a: 'Email me within 14 days and I’ll refund you, no questions and no awkwardness. I’d rather you spend the money on something that helps.',
  },
]

export const footer = {
  note: 'Made on Wabanaki territory.',
  links: [
    { label: 'Privacy', href: '/privacy/' },
    { label: 'Terms', href: '/terms/' },
    { label: 'Contact', href: 'mailto:support@nategaffney.store' },
  ],
}

/** Sticky bar that follows you up the page on mobile. */
/**
 * Sticky bar that followed you up the page on mobile. Off.
 *
 * To bring it back, replace null with:
 *   { label, sublabel, cta, href }
 */
export const stickyCta = null
