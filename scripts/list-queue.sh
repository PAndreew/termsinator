#!/usr/bin/env bash
set -euo pipefail
server=${SERVER:-root@46.62.240.211}
ssh_key=${SSH_KEY:-$HOME/.ssh/hetzner}
remote_dir=${REMOTE_DIR:-/opt/termsinator}
ssh -i "$ssh_key" -o BatchMode=yes "$server" "cd '$remote_dir' && docker compose -f compose.production.yml --env-file .env.production exec -T db psql -P pager=off -U termsinator -d termsinator -c \"SELECT id,normalized_url,status,created_at FROM analysis_requests WHERE status IN ('queued','running') ORDER BY created_at\""
