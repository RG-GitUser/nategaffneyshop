# Droplet setup, start to finish

Ubuntu 22.04/24.04 DigitalOcean droplet. Run as a sudo user, not root.

## 0. Try it locally first

No droplet, no MongoDB install needed:

```bash
cd server
npm install
npm run dev:local
```

That starts a throwaway in-memory MongoDB, seeds `admin@example.com` /
`localdevpassword`, and boots the API on :8080. Run `npm run dev` in the
project root and the dashboard is at http://localhost:5173/admin/.
Everything is wiped when you stop it.

## 1. Node and a deploy user

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs nginx git
sudo adduser --system --group --home /var/www/nategaffneyshop deploy
```

## 2. MongoDB

```bash
curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc | \
  sudo gpg -o /usr/share/keyrings/mongodb.gpg --dearmor
echo "deb [signed-by=/usr/share/keyrings/mongodb.gpg] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/8.0 multiverse" | \
  sudo tee /etc/apt/sources.list.d/mongodb.list
sudo apt update && sudo apt install -y mongodb-org
sudo systemctl enable --now mongod
```

**Check it is not exposed.** `/etc/mongod.conf` must have:

```yaml
net:
  bindIp: 127.0.0.1
```

An internet-facing MongoDB with no auth gets found and wiped within hours.
Confirm with `sudo ss -tlnp | grep 27017` — it should show `127.0.0.1:27017`,
never `0.0.0.0`.

Then create a database user:

```bash
mongosh
```
```javascript
use admin
db.createUser({
  user: "ngapp",
  pwd: "a-long-random-password",
  roles: [{ role: "readWrite", db: "nategaffneyshop" }]
})
```

Enable auth by adding to `/etc/mongod.conf`:

```yaml
security:
  authorization: enabled
```

`sudo systemctl restart mongod`. Your `MONGODB_URI` becomes:

```
mongodb://ngapp:a-long-random-password@127.0.0.1:27017/?authSource=admin
```

### Connecting MongoDB Compass

Don't open the port. Tunnel over SSH — Compass has this built in:
**New Connection → Advanced → Proxy/SSH → SSH with Password/Identity File**,
hostname `127.0.0.1`, port `27017`, and your droplet's SSH details.

## 3. The app

```bash
sudo mkdir -p /var/www/nategaffneyshop
sudo chown deploy:deploy /var/www/nategaffneyshop
sudo -u deploy git clone https://github.com/RG-GitUser/nategaffneyshop.git /var/www/nategaffneyshop
cd /var/www/nategaffneyshop/server
sudo -u deploy npm ci --omit=dev
sudo -u deploy mkdir -p /var/www/nategaffneyshop/uploads
```

Create `.env` from `.env.example` and fill it in. Generate the session secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Lock the file down — it holds every secret you have:

```bash
sudo chmod 600 /var/www/nategaffneyshop/server/.env
sudo chown deploy:deploy /var/www/nategaffneyshop/server/.env
```

Create the admin account:

```bash
sudo -u deploy npm run create-admin -- nate@nategaffney.com "a long passphrase"
```

## 4. Run it

```bash
sudo cp deploy/nategaffneyshop-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now nategaffneyshop-api
sudo journalctl -u nategaffneyshop-api -f
```

You want to see `API listening on :8080` and `[mail] SMTP ready`.

## 5. nginx and TLS

DNS at Namecheap first — two `A` records at the droplet's IP:

| Host | Points to |
| --- | --- |
| `@` and `www` | droplet IP |
| `api` | droplet IP |

Then:

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/nategaffneyshop-api
sudo ln -s /etc/nginx/sites-available/nategaffneyshop-api /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d nategaffney.com -d www.nategaffney.com -d api.nategaffney.com
```

**HTTPS is required**, not a nicety — the admin session cookie is `secure`
in production, so login silently fails over plain HTTP.

## 6. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status          # 27017 must NOT be listed
```

## 7. The site itself

Build locally and copy the static files up:

```bash
# on your machine, with VITE_API_URL=https://api.nategaffney.com in .env
npm run build
rsync -avz --delete dist/ deploy@YOUR_DROPLET_IP:/var/www/nategaffneyshop/site/
```

## 8. Google Calendar

Google Cloud Console:

1. New project → enable **Google Calendar API**
2. OAuth consent screen → External → add yourself as a test user
3. Credentials → OAuth client ID → **Web application**
4. Authorised redirect URI, exactly:
   `https://api.nategaffney.com/api/google/callback`
5. Put the client id and secret in `.env`, restart the service
6. Admin dashboard → Account → **Connect Google Calendar**

After that, confirming a booking creates the calendar event, mints a Meet
room, and Google emails the invite to both of you.

## Updating later

```bash
cd /var/www/nategaffneyshop
sudo -u deploy git pull
cd server && sudo -u deploy npm ci --omit=dev
sudo systemctl restart nategaffneyshop-api
```

## When something breaks

```bash
sudo journalctl -u nategaffneyshop-api -n 100 --no-pager   # app logs
sudo tail -50 /var/log/nginx/ng-api.error.log              # proxy errors
curl -s localhost:8080/health                              # is it alive
```

The server refuses to start on a bad config rather than half-working — if
it won't boot, the journal names the exact variable.
