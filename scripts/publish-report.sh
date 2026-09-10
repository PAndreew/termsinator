#!/usr/bin/env bash
set -euo pipefail

[[ $# -eq 1 ]] || { echo "usage: $0 RESULT.json" >&2; exit 2; }
report_file=$1
root=$(cd "$(dirname "$0")/.." && pwd)
server=${SERVER:-root@46.62.240.211}
ssh_key=${SSH_KEY:-$HOME/.ssh/hetzner}
remote_dir=${REMOTE_DIR:-/opt/termsinator}
ssh_cmd=(ssh -i "$ssh_key" -o BatchMode=yes "$server")

read -r hostname scan_id < <(python3 - "$root" "$report_file" <<'PY'
import json,re,sys
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker
root, path = Path(sys.argv[1]), Path(sys.argv[2])
value = json.loads(path.read_text())
for schema_name, field in (("public-summary-v1.schema.json", "summary"), ("report-v1.schema.json", "report")):
    schema = json.loads((root / "schemas" / schema_name).read_text())
    errors = list(Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(value[field]))
    if errors:
        raise SystemExit(f"{schema_name}: {errors[0].message}")
hostname = value["summary"]["hostname"].lower()
if not re.fullmatch(r"[a-z0-9.-]{1,253}", hostname):
    raise SystemExit("invalid report hostname")
if value["report"]["site"]["hostname"].lower() != hostname:
    raise SystemExit("summary/report hostname mismatch")
print(hostname, value["report"]["scan"]["id"])
PY
)

existing=$(${ssh_cmd[@]} "cd '$remote_dir' && docker compose -f compose.production.yml --env-file .env.production exec -T db psql -At -F '|' -U termsinator -d termsinator -c \"SELECT ar.id,j.id FROM analysis_requests ar JOIN jobs j ON j.analysis_request_id=ar.id WHERE ar.hostname='$hostname' AND ar.status IN ('queued','running') ORDER BY ar.created_at LIMIT 1\"" | tr -d '\r')
if [[ -n "$existing" ]]; then
  IFS='|' read -r request_id job_id <<<"$existing"
  if [[ "$request_id" != "$scan_id" ]]; then
    echo "report scan id $scan_id does not match queued request $request_id; rerun the processor with the queued id" >&2
    exit 1
  fi
else
  request_id=$scan_id
  job_id=$(python3 -c 'import uuid; print(uuid.uuid4())')
fi

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
python3 - "$report_file" "$hostname" "$request_id" "$job_id" "$existing" >"$tmp" <<'PY'
import json,sys,uuid
path, host, request_id, job_id, existing = sys.argv[1:]
payload = json.dumps(json.load(open(path)), separators=(",", ":"), ensure_ascii=False)
tag = "report_" + uuid.uuid4().hex
if f"${tag}$" in payload:
    raise SystemExit("unexpected SQL delimiter collision")
print("BEGIN;")
if not existing:
    print(f"INSERT INTO analysis_requests(id,submitted_url,normalized_url,hostname,status) VALUES('{request_id}','https://{host}/','https://{host}/','{host}','complete');")
    print(f"INSERT INTO jobs(id,analysis_request_id,status) VALUES('{job_id}','{request_id}','complete');")
else:
    print(f"UPDATE analysis_requests SET status='complete',error_code=NULL,updated_at=now() WHERE id='{request_id}';")
    print(f"UPDATE jobs SET status='complete',lease_owner=NULL,lease_expires_at=NULL,updated_at=now() WHERE id='{job_id}';")
print(f"INSERT INTO processing_outputs(job_id,analysis_request_id,payload) VALUES('{job_id}','{request_id}',${tag}${payload}${tag}$::jsonb) ON CONFLICT(job_id) DO UPDATE SET payload=EXCLUDED.payload,created_at=now();")
print("COMMIT;")
PY

${ssh_cmd[@]} "cd '$remote_dir' && docker compose -f compose.production.yml --env-file .env.production exec -T db psql -v ON_ERROR_STOP=1 -U termsinator -d termsinator" <"$tmp" >/dev/null
echo "published $hostname ($request_id)"
