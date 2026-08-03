# nategaffneyshop

Link-in-bio storefront for **Nate Gaffney** — the page people land on when they
tap the link in his Instagram bio. Built with React + Vite, no CSS framework.

## Run it

```bash
npm install
npm run dev
```

Vite prints two URLs. The **Network** one works on your phone if it's on the
same wifi — worth checking, since most traffic here will be mobile.

```bash
npm run build     # production build into dist/
npm run preview   # serve the build locally to sanity-check it
```

## Changing things

Almost everything lives in **`src/content.js`** — copy, prices, links, which
offers appear and in what order. It's plain JavaScript objects with comments;
no React knowledge needed to edit it.

- Remove an offer → delete its object from the `offers` array
- Reorder offers → move the objects around (cards renumber themselves)
- Kill a whole section → set `featured`, `newsletter`, or `stickyCta` to `null`
- Change colors/fonts → the tokens at the top of `src/styles/global.css`

## Theming

Light is the default. The toggle in the upper-right corner flips to dark and
remembers the choice in `localStorage`; an inline script in `index.html` applies
it before first paint so there's no flash of the wrong theme.

Both palettes live in the two blocks at the top of `src/styles/global.css`
(`:root` and `:root[data-theme="dark"]`). Nothing downstream hardcodes a color,
so a full reskin means editing those blocks only.

Two accent tokens exist on purpose:

- `--accent` — orange **text**, borders and icons on the page background
- `--accent-fill` — deeper orange used as a solid **background** under `--on-accent`

They can't be one value: on a dark page, orange text has to stay light enough
to read, while an orange fill has to be dark enough for cream text on top.
Per-card colors use a separate `--card-accent` scope so they never collide.

Images go in `public/images/` — see the README in there for names and sizes.

## Layout

- **Mobile** — one column, thumb-friendly targets, and a CTA bar that slides up
  after you scroll past the intro.
- **Desktop (≥900px)** — the profile becomes a sticky left rail and the offers
  scroll beside it, so the page doesn't look like a phone screenshot stretched
  out on a laptop.

## Booking calendar

The calendar in `src/components/BookingCalendar.jsx` is configured entirely
from the `booking` object in `content.js` — open weekdays, time slots, how much
notice you need, how far ahead people can book, and specific days off.

**It collects a request, it does not reserve anything.** There's no backend, so
it can't see Nate's real calendar and can't stop two people picking the same
slot. That's fine if he confirms each one by hand, and the copy says so. For
real availability, payment and auto-confirm, drop a Cal.com or Calendly embed
in place of the `.booking__picker` block — the comment at the top of the
component marks the spot.

Set `booking.action` to a form POST URL to actually receive requests. The form
sends `date` (YYYY-MM-DD), `time`, `name`, `email` and `note`.

## Newsletter

**The Cutting Room** is the page's only email capture, on purpose — two forms
competing on one page splits conversions. The 7-Day Story Starter rides along
as the signup bonus instead of being its own block.

The "recent issues" rail is the part that actually earns subscribers, so keep
real headlines in `newsletter.recentIssues`. If Nate wants them clickable,
add an `href` to each and wrap the `<p>` in `Newsletter.jsx`.

## Still to wire up

- Checkout links. Every `href` in `content.js` is `#` right now. Point them at
  Stripe Payment Links, Gumroad, Stan, Calendly — whatever Nate ends up using.
- Newsletter delivery. Set `newsletter.action` to a form POST URL (ConvertKit,
  Beehiiv, Substack). Until then the form shows a confirmation and drops the
  address — don't launch without this connected.
- Real photos and the `og.jpg` share image.
- Real testimonials. The three in `content.js` are placeholders.
- Analytics, if he wants it.
