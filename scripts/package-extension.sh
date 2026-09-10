#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
output="$root/frontend/public/downloads/termsinator-extension.zip"
mkdir -p "$(dirname "$output")"
rm -f "$output"
(
  cd "$root/extension"
  zip -X -q -r "$output" . -x '*.DS_Store' -x '__MACOSX/*'
)
echo "$output"
