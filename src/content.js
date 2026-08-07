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
export const sections = [
  'featuredVideo',
  'featured',
  'offers',
  'services',
  'booking',
  'groupChat',
  'about',
  'newsletter',
  'testimonials',
  'faqs',
]

/**
 * Custom containers added from the admin dashboard (Content tab →
 * "Add container"). Each is { id, title, fields: [{ id, label, value }] }
 * and renders as its own section, positioned by the `sections` order.
 */
export const custom = []

/**
 * Archived section ids: kept with all their content but left off the
 * public page until restored from the dashboard.
 */
export const archived = []

/**
 * Service cards, managed entirely from the admin Services tab. Shaped
 * like offers: { title, description, price, tag, cta, href, accent }.
 * Empty list hides the section.
 */
export const services = []

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
  { label: 'TikTok', href: '#', icon: 'tiktok' },
  { label: 'Email', href: 'mailto:support@nategaffney.store', icon: 'mail' },
]

/**
 * The big highlighted offer at the top of the page. Currently off.
 *
 * To bring it back, replace null with an object shaped like:
 *   { badge, title, subtitle, description, price, oldPrice, spotsLeft,
 *     cta, href, note, bullets: [] }
 * Everything except title, description, price, cta and href is optional.
 */
export const featured = null

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
    kind: 'product',
    title: 'Content That Lands',
    description:
      'A 60-page guide to hooks, pacing, and the structural stuff that makes a video work. Read it in an afternoon.',
    price: '$39',
    oldPrice: '$59',
    cta: 'Get the guide',
    href: '#',
    accent: 'navy',
    tag: 'Most popular',
  },
  {
    kind: 'product',
    title: '1:1 Creator Consult',
    description:
      '45 minutes, just us. Bring your work, your rough cut, or the thing you can’t figure out. You leave with a plan.',
    price: '$150',
    cta: 'Book a call',
    href: '#book', // jumps to the calendar section
    accent: 'umber',
    rating: '5.0',
  },
  {
    kind: 'product',
    title: 'The Grade',
    description:
      'The color profiles and LUTs behind my last two years of work. Drop them straight into Premiere, Resolve, or Lightroom.',
    price: '$29',
    cta: 'Grab the pack',
    href: '#',
    accent: 'amber',
  },
  {
    kind: 'link',
    title: 'Hire me for a film',
    description:
      'Weddings, docs, and brand work through Wabanaki Media. Tell me what you’re making.',
    cta: 'Start a project',
    href: '#',
    accent: 'olive',
  },
]

/**
 * Coaching calendar. Set to null to remove the section entirely.
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
  // Shown to the visitor so nobody books 3am their time by accident.
  timezone: 'Atlantic Time (AT)',
  // Weekdays open for booking. 0 = Sunday … 6 = Saturday.
  availableDays: [1, 2, 3, 4],
  // Slots offered on any available day.
  slots: ['9:00 AM', '10:30 AM', '1:00 PM', '2:30 PM', '4:00 PM'],
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

/**
 * Circle.so group chat. Set to null to remove the section.
 *
 * The section also hides itself automatically if the server has no Circle
 * tokens configured, so it never renders as a broken box.
 */
/**
 * The group chat. Set to null to remove the section.
 *
 * mode:
 *   'native' — chat runs on our own server and database. Free, no third
 *              party, moderation built into the admin dashboard.
 *   'circle' — proxies Circle.so's API instead. Needs their Business plan,
 *              so it's off by default; the code is written and switches on
 *              once the server has CIRCLE_HEADLESS_TOKEN set.
 *   'link'   — no chat, just a button out to an external community.
 *
 * Both 'native' and 'circle' hit identical endpoint shapes, so switching
 * is a one-word change here.
 */
export const groupChat = {
  mode: 'native',

  eyebrow: 'The group chat',
  title: 'Join the conversation',
  description:
    'A running conversation with other people making things — what they’re working on, what’s stuck, what actually worked. Drop in whenever.',
  cta: 'Get my code',

  // Optional standing Google Meet room for live group sessions. Create a
  // link once in Google Meet and paste it here; shown above the chat.
  meetUrl: null,
  meetLabel: 'Live session',
  meetNote: 'We hop on here for group calls. Same link every time.',

  // Used only when mode is 'link'.
  joinUrl: 'https://circle.so',
  joinCta: 'Open the community',
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
