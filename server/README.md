# API server

Express API behind the admin dashboard. Runs on DigitalOcean.

Everything sensitive lives here and nowhere else: the Stripe secret key, the
MongoDB connection string, the Supabase service role key. **None of these may
ever appear in the frontend** — the Vite bundle is public.

## What it does

| Route | Auth | Purpose |
| --- | --- | --- |
| `GET /api/content` | public | Live site reads admin-edited copy |
| `PUT /api/content` | admin | Save copy |
| `GET /api/shop` | public | Visible shop items |
| `GET /api/shop/all` | admin | All items, including hidden |
| `POST/PUT/DELETE /api/shop` | admin | Manage items |
| `POST /api/bookings` | public, throttled | Booking request from the site |
| `GET /api/bookings/taken` | public | Slots to grey out (no names/emails) |
| `GET /api/bookings` | admin | Full list |
| `PATCH /api/bookings/:id` | admin | Reschedule, confirm, cancel |
| `GET /api/payments` | admin | Stripe payments |
| `POST /api/payments/:id/refund` | admin | Full or partial refund |
| `POST /api/media` | admin | Image upload to Supabase Storage |

## Security model

Two independent checks on every admin route, both must pass:

1. The bearer token is a **cryptographically verified** Supabase JWT — not
   decoded and trusted.
2. The email inside it is on the `ADMIN_EMAILS` allowlist.

The second check is what stops an open Supabase signup becoming an admin
account. There is no member login and no signup route — accounts are created
by hand in the Supabase dashboard.

Also on: Helmet, CORS locked to `ALLOWED_ORIGINS`, global and per-route rate
limits, magic-number checks on uploads, and an `auditLog` collection recording
every refund, cancellation and content change with who did it and when.

The server refuses to start if `ADMIN_EMAILS` is empty, or if CORS is
unrestricted in production. Failing at boot beats failing at the first refund.

## Setup

```bash
cd server
npm install
cp .env.example .env   # then fill it in
npm run dev
```

You need:

1. **MongoDB** — Atlas or DO Managed. Put the URI in `MONGODB_URI`.
2. **Supabase project** — copy the URL, JWT secret and service role key from
   Project Settings → API. Create a Storage bucket (default name `site-media`)
   and make it public-read.
3. **Nate's admin account** — create it manually in Supabase → Authentication →
   Users, then put that email in `ADMIN_EMAILS`. Turn **off** public signups
   under Authentication → Providers.
4. **Stripe secret key** — from the Stripe dashboard. Use a test key first.

## Deploying to DigitalOcean

App Platform is the simplest route: point it at this repo, set the source
directory to `server`, run command `npm start`, HTTP port `8080`. Add every
variable from `.env.example` as an **encrypted** env var. Set
`ALLOWED_ORIGINS` to the real site domain.

Then set `VITE_API_URL` on the frontend build to the API's URL.

## A note on refunds

Stripe's own dashboard also does refunds, with its own audit trail and 2FA.
This API is a convenience layer for the common case. For anything unusual —
disputes, chargebacks, partial captures — use the Stripe dashboard directly.
