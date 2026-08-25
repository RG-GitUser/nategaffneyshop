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
export const sections = ['offers', 'services']

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
      "The Content Audit is a deep dive into your Instagram page. I study your content, pinpoint what's working and what isn't, and walk you through it all in a video report you can actually learn from. You'll also get a copy of the Essential Creator's Workbook, My guide to content planning and strategy, delivered as a PDF.\n\nHere's what the Content Audit includes:\n\n- A full review of your recent content, what's landing and what's falling flat\n- Hook, pacing, and retention breakdown on your top and worst performing posts\n- Notes on your niche clarity, content pillars, and audience fit\n- A video walkthrough explaining the findings in plain terms\n- A copy of the Essential Creator's Workbook to help you act on it",
    price: '$750 / Audit',
    cta: 'Book',
    href: '#book',
    accent: 'navy',
  },
]

export const profile = {
  name: 'Nate Gaffney',
  handle: '@nategaffney',
  // Short + human. This is the first thing someone reads after tapping your bio link.
  tagline: 'Wolastoqey filmmaker. Nicheless Nomad.',
  blurb:
    'Obsessed with turning inner life into art. Director, writer, journaler, creative director — never just one thing.',
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
 * accent: 'navy' | 'umber' | 'olive' | 'amber'
 */
export const offers = [
  {
    kind: 'pdf',
    title: "Essential Creator's Workbook",
    description:
      "The Essential Creator's Workbook is a PDF for creators who are tired of guessing what to post next. Instead of another list of Instagram tips, it walks you through the actual foundation of consistent content: who you're for, what you stand for, and a system you can repeat every single week.\n\nWhat's inside:\n\n- Your Foundation: define your promise, your audience, and three content pillars\n- A competitor research framework to study five creators and pull proven ideas\n- A 50 ideas bank so you never run out of things to post\n- The \"5 Method,\" turning one idea into five videos (25 videos from five original thoughts)\n- Filming, editing, and publishing checklists you can use every time\n- A weekly review ritual to track what's actually working\n- The Creator Mindset, a one page reminder to keep you grounded\n- A 30 day challenge to put it all into action\n- The Creator Readiness Score, a gut check on whether you're ready to grow",
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
  description:
    'Forty-five minutes on whatever’s actually in your way — a rough cut, pricing, burnout, the work you keep not making. Pick a time that works and tell me what you want to get out of it.',
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
    'A quick 15-minute check-in for people I’ve already worked with — where you’ve landed since the session, what’s stuck, and what to do next. Pick a time and I’ll confirm by email.',
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
    'A breakdown of something that performed — and why',
    'The honest numbers, including the bad ones',
  ],
  bonus:
    'Join and I’ll send you The 7-Day Story Starter — one prompt a day until you’ve got something worth filming.',
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
