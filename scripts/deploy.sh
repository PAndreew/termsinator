#!/usr/bin/env bash
set -euo pipefail

SERVER=${SERVER:-root@46.62.240.211}
SSH_KEY=${SSH_KEY:-$HOME/.ssh/hetzner}
REMOTE_DIR=${REMOTE_DIR:-/opt/termsinator}
COMPOSE=compose.production.yml
SSH=(ssh -i "$SSH_KEY" -o BatchMode=yes "$SERVER")

current=$(${SSH[@]} "cat '$REMOTE_DIR/.active-color' 2>/dev/null || echo green")
if [[ "$current" == blue ]]; then next=green; else next=blue; fi
tag=$(git -C "$(dirname "$0")/.." rev-parse --short=12 HEAD 2>/dev/null || date +%Y%m%d%H%M%S)
"$(dirname "$0")/package-extension.sh" >/dev/null

echo "[deploy] active=$current next=$next tag=$tag"
${SSH[@]} "install -d -m 700 '$REMOTE_DIR'"
rsync -az --delete \
  --exclude .git --exclude '.env*' --exclude frontend/node_modules --exclude frontend/dist \
  -e "ssh -i $SSH_KEY -o BatchMode=yes" "$(dirname "$0")/../" "$SERVER:$REMOTE_DIR/"

${SSH[@]} "set -euo pipefail
cd '$REMOTE_DIR'
if [[ ! -f .env.production ]]; then
  umask 077
  printf 'POSTGRES_PASSWORD=%s\nABUSE_HASH_KEY=%s\nIMAGE_TAG=%s\n' \"\$(openssl rand -hex 32)\" \"\$(openssl rand -hex 32)\" '$tag' > .env.production
else
  if ! grep -q '^ABUSE_HASH_KEY=' .env.production; then
    printf 'ABUSE_HASH_KEY=%s\n' \"\$(openssl rand -hex 32)\" >> .env.production
  fi
  sed -i '/^IMAGE_TAG=/d' .env.production
  printf 'IMAGE_TAG=%s\n' '$tag' >> .env.production
  chmod 600 .env.production
fi
set -a; source .env.production; set +a
docker compose -f '$COMPOSE' --env-file .env.production build api-$next web-$next
docker compose -f '$COMPOSE' --env-file .env.production up -d db api-$next web-$next
for i in \$(seq 1 30); do
  api_health=\$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' termsinator-api-$next-1 2>/dev/null || true)
  web_health=\$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' termsinator-web-$next-1 2>/dev/null || true)
  [[ \"\$api_health\" == healthy && \"\$web_health\" == healthy ]] && break
  sleep 2
done
[[ \"\$api_health\" == healthy && \"\$web_health\" == healthy ]]
cp 'infrastructure/Caddyfile.$next' infrastructure/Caddyfile.active
docker compose -f '$COMPOSE' --env-file .env.production up -d edge
docker compose -f '$COMPOSE' --env-file .env.production exec -T edge caddy validate --config /etc/termsinator/Caddyfile.active
docker compose -f '$COMPOSE' --env-file .env.production exec -T edge caddy reload --config /etc/termsinator/Caddyfile.active
printf '%s\n' '$next' > .active-color
"

# Open only the hardened edge after it is healthy locally; app/database ports have no host bindings.
${SSH[@]} "ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw allow 443/udp >/dev/null"

for i in $(seq 1 30); do
  code=$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' https://termsinator.46-62-240-211.sslip.io/api/health/ready || true)
  [[ "$code" == 200 ]] && break
  sleep 2
done
if [[ "$code" != 200 ]]; then
  echo "[deploy] public smoke test failed: HTTP $code; switching back" >&2
  ${SSH[@]} "cd '$REMOTE_DIR'; cp infrastructure/Caddyfile.$current infrastructure/Caddyfile.active; docker compose -f '$COMPOSE' --env-file .env.production exec -T edge caddy reload --config /etc/termsinator/Caddyfile.active" || true
  exit 1
fi
${SSH[@]} "cd '$REMOTE_DIR'; docker compose -f '$COMPOSE' --env-file .env.production stop api-$current web-$current >/dev/null 2>&1 || true"
echo "[deploy] live: https://termsinator.46-62-240-211.sslip.io ($next, HTTP $code)"
