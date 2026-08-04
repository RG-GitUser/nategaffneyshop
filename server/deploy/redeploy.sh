#!/usr/bin/env bash
# One-command redeploy for the droplet:
#   bash /var/www/nategaffneyshop/server/deploy/redeploy.sh
#
# Pull, build the frontend, publish it, refresh server deps, fix
# ownership, restart the API — and say what version ended up live.
set -euo pipefail

ROOT=/var/www/nategaffneyshop

git config --global --add safe.directory "$ROOT" 2>/dev/null || true

cd "$ROOT"
echo "── pulling ──────────────────────────────"
git pull

echo "── building frontend ────────────────────"
npm ci
npm run build
# Additive publish: old hashed assets stay behind, so a phone holding
# yesterday's cached HTML still finds its CSS instead of rendering bare.
mkdir -p site
cp -r dist/. site/
# prune hashed assets older than 30 days so the folder doesn't grow forever
find site/assets -type f -mtime +30 -delete 2>/dev/null || true

echo "── server deps ──────────────────────────"
cd server
npm ci --omit=dev

echo "── permissions + restart ────────────────"
chown -R deploy:deploy "$ROOT"
chmod 600 "$ROOT/server/.env"
systemctl restart nategaffneyshop-api

echo "── result ───────────────────────────────"
echo "commit : $(git -C "$ROOT" rev-parse --short HEAD)  $(git -C "$ROOT" log -1 --format=%s)"
# The API takes a few seconds to boot (Atlas + SMTP checks), so poll
# rather than checking once and crying wolf.
HEALTH="API NOT RESPONDING after 30s — journalctl -u nategaffneyshop-api -n 30"
for i in $(seq 1 15); do
  if OUT=$(curl -sf http://127.0.0.1:8080/health 2>/dev/null); then HEALTH="$OUT"; break; fi
  sleep 2
done
echo "health : $HEALTH"
echo
echo "Hard-refresh the site (Ctrl+Shift+R) — the browser caches the old bundle."
