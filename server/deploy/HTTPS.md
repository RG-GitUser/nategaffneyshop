# HTTPS and SSL on the droplet

Start to finish for `nategaffney.store`. Substitute your own domain if it
differs.

**HTTPS is not optional here.** The admin session cookie is set `secure`
in production, so over plain HTTP the browser silently discards it and
login appears to do nothing. Same for the chat session cookie.

---

## 1. DNS at Namecheap

Domain List → **Manage** → **Advanced DNS**. Delete the parking-page
records Namecheap adds by default (a `CNAME` for `www` pointing at
`parkingpage.namecheap.com`, and any `URL Redirect` record), then add:

| Type | Host | Value | TTL |
| --- | --- | --- | --- |
| A | `@` | your droplet's IPv4 | Automatic |
| A | `www` | your droplet's IPv4 | Automatic |
| A | `api` | your droplet's IPv4 | Automatic |

Leave the existing MX and mail records alone — those are Namecrane's and
breaking them takes your email down.

Check it has propagated before going further. Certbot will fail with a
confusing error if DNS isn't live yet:

```bash
dig +short nategaffney.store
dig +short api.nategaffney.store
```

Both must print your droplet IP. Give it 15–30 minutes if not.

---

## 2. Firewall

Do this **before** exposing anything.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'      # opens 80 and 443
sudo ufw enable
sudo ufw status
```

Port 80 has to stay open even though everything ends up on 443 — Let's
Encrypt validates over HTTP, and renewals will fail silently later if you
close it.

`27017` must **not** appear in that list.

---

## 3. nginx

```bash
sudo apt update
sudo apt install -y nginx
sudo systemctl enable --now nginx
```

Visit `http://your-droplet-ip` — the default nginx page confirms it works.

Copy the site config in, adjusting the domain if needed:

```bash
sudo cp /var/www/nategaffneyshop/server/deploy/nginx.conf \
        /etc/nginx/sites-available/nategaffneyshop
sudo ln -sf /etc/nginx/sites-available/nategaffneyshop \
            /etc/nginx/sites-enabled/nategaffneyshop
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

`nginx -t` must say **syntax is ok** / **test is successful**. If it
complains about a missing directory, create the web root:

```bash
sudo mkdir -p /var/www/nategaffneyshop/site
sudo chown -R deploy:deploy /var/www/nategaffneyshop
```

---

## 4. Certificates

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx \
  -d nategaffney.store \
  -d www.nategaffney.store \
  -d api.nategaffney.store
```

It asks for an email (renewal warnings — use a real one) and whether to
redirect HTTP to HTTPS. **Choose redirect.**

Certbot edits your nginx config in place: adds the `listen 443 ssl`
blocks, the certificate paths, and a 301 from port 80. You don't need to
write any of that yourself.

All three names must be on the **one** command. A certificate covering
only the apex won't validate for `api.`, and the API is where the session
cookie is set.

---

## 5. Auto-renewal

Certificates last 90 days. The package installs a systemd timer:

```bash
systemctl list-timers | grep certbot     # should show a next-run time
sudo certbot renew --dry-run             # proves renewal actually works
```

The dry run is the important one. If it passes, renewal is genuinely
automatic and you can forget about it.

---

## 6. Point the app at HTTPS

Three values change now that certificates exist.

**`server/.env`:**

```bash
NODE_ENV=production
ALLOWED_ORIGINS=https://nategaffney.store,https://www.nategaffney.store
COOKIE_DOMAIN=.nategaffney.store
GOOGLE_REDIRECT_URI=https://api.nategaffney.store/api/google/callback
UPLOAD_PUBLIC_URL=https://api.nategaffney.store/uploads
```

`NODE_ENV=production` is what turns on the `secure` cookie flag — set it
only once HTTPS is actually working, or you'll lock yourself out of the
dashboard.

The leading dot on `COOKIE_DOMAIN` is what lets the cookie set on
`api.` be sent from the site on the apex.

If you changed `GOOGLE_REDIRECT_URI`, update it in the Google Cloud
console too — it must match **character for character** or OAuth fails.

Restart:

```bash
sudo systemctl restart nategaffneyshop-api
sudo journalctl -u nategaffneyshop-api -n 30 --no-pager
```

**Frontend `.env`** on your own machine, then rebuild and upload:

```bash
VITE_API_URL=https://api.nategaffney.store
```

```bash
npm run build
rsync -avz --delete dist/ deploy@YOUR_DROPLET_IP:/var/www/nategaffneyshop/site/
```

---

## 7. Check it

```bash
curl -I http://nategaffney.store          # expect 301 → https
curl -s https://api.nategaffney.store/health   # expect {"ok":true}
```

In a browser:

- `https://nategaffney.store` — padlock, no warnings
- `https://nategaffney.store/admin/` — sign in, then reload the page. If
  you stay signed in, the cookie is working across the two hosts. If you
  get bounced to the login screen, see below.

---

## When it doesn't work

**Login appears to succeed then immediately logs out.** The cookie isn't
sticking. Almost always `COOKIE_DOMAIN` is missing its leading dot, or
`NODE_ENV=production` is set while you're still testing over HTTP.

**Certbot: "Timeout during connect".** Port 80 is closed or DNS hasn't
propagated. Re-check `ufw status` and `dig`.

**Certbot: "unauthorized"** for one name only. That record is missing or
points elsewhere. Fix the DNS and re-run for all three names together.

**Browser blocks requests to the API.** The origin isn't in
`ALLOWED_ORIGINS`. Include the exact scheme and host — `https://` and
`www` are each a distinct origin.

**Mixed-content warnings.** `VITE_API_URL` is still `http://`. Rebuild
the frontend after changing it; it's baked in at build time.

```bash
sudo tail -50 /var/log/nginx/ng-api.error.log
sudo journalctl -u nategaffneyshop-api -n 100 --no-pager
sudo certbot certificates          # what's issued and when it expires
```
