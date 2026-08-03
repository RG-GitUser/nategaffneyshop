# API server

Express API behind the admin dashboard. Runs on your DigitalOcean droplet
alongside MongoDB, sends mail through Namecrane, and talks to Stripe.

Everything sensitive lives here and nowhere else: the Stripe secret key, the
MongoDB URI, the session secret, the mailbox password. **None of these may ever
appear in the frontend** — the Vite bundle is public.

## Stack

| Piece | What it does |
| --- | --- |
| DigitalOcean droplet | Runs this API and serves uploaded images |
| MongoDB | Content, shop items, bookings, the admin account, audit log |
| Namecheap | Domain and DNS |
| Namecrane | SMTP for booking notifications |
| Stripe | Payments and refunds |

MongoDB Compass points at the same `MONGODB_URI` — useful for eyeballing
`bookings` or `auditLog` directly.

## Routes

| Route | Auth | Purpose |
| --- | --- | --- |
| `POST /api/auth/login` | public, throttled | Sign in, sets session cookie |
| `POST /api/auth/logout` | — | Clear the cookie |
| `GET /api/auth/me` | admin | Is the session still good? |
| `POST /api/auth/password` | admin | Change password |
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
| `POST /api/media` | admin | Image upload |

## Security model

- **One account, created by hand.** There is no signup route anywhere. The only
  way an admin exists is `npm run create-admin`.
- **Passwords are bcrypt hashed** (cost 12), never stored or logged in plain text.
- **Session is an httpOnly cookie.** JavaScript can't read it, so an XSS bug
  can't steal it the way it could a token in `localStorage`.
- **Login is rate limited** to 8 attempts per 15 minutes per IP.
- **Timing-safe-ish login:** a hash comparison runs even when the account
  doesn't exist, so a missing address isn't measurably faster to reject.
- **Identical error message** for wrong password and unknown address.
- **CORS locked** to `ALLOWED_ORIGINS`; everything else is refused.
- **Uploads are sniffed by magic number**, so a renamed script can't be written
  into a public directory. Random filename suffixes.
- **Audit log** records every refund, cancellation, content change and login.

The server refuses to boot if `JWT_SECRET` is short or still the placeholder,
or if CORS is unrestricted in production. Failing at boot beats failing at the
first refund.

Changing `JWT_SECRET` invalidates every session immediately — the fastest way
to kick everyone out if something ever looks wrong.

## Setup

```bash
cd server
npm install
cp .env.example .env
```

Fill in `.env`, then generate a session secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Create the admin account:

```bash
npm run create-admin -- nate@nategaffney.com "a long passphrase you remember"
```

Run it:

```bash
npm run dev     # local
npm start       # production
```

## Deploying on the droplet

1. **MongoDB** — if it's on the same droplet, bind it to `127.0.0.1` only.
   Never expose 27017 to the internet. Connect Compass over an SSH tunnel:
   `ssh -L 27017:127.0.0.1:27017 user@droplet`
2. **Uploads** — `UPLOAD_DIR` must be on persistent disk and writable by the
   node user, e.g. `/var/www/nategaffneyshop/uploads`.
3. **Process manager** — run under `pm2` or a systemd unit so it restarts on
   boot and on crash.
4. **nginx** — put the API behind nginx on `api.yourdomain.com` with a Let's
   Encrypt certificate, proxying to `127.0.0.1:8080`. The session cookie is
   `secure` in production, so **HTTPS is required or login will not work**.
5. **DNS at Namecheap** — an `A` record for `api` pointing at the droplet IP.
6. **Namecrane SMTP** — host, port 465, and the mailbox password in `.env`.
   The server verifies the credentials at boot and logs the result.

Set the frontend's `VITE_API_URL` to `https://api.yourdomain.com` and rebuild.

### Why the API belongs on a subdomain

The session cookie is `SameSite=Lax` with `COOKIE_DOMAIN=.yourdomain.com`.
That works across `yourdomain.com` and `api.yourdomain.com` because they share
a registrable domain. Put the API on an unrelated domain and the browser won't
send the cookie at all — the API also accepts an `Authorization: Bearer` token
as a fallback, but the cookie is the safer path.

## A note on refunds

Stripe's own dashboard also does refunds, with its own audit trail and 2FA.
This API is a convenience layer for the common case. For anything unusual —
disputes, chargebacks, partial captures — use the Stripe dashboard directly.
