#!/usr/bin/env bash
# Esegue reset + migration + smoke test in UNA transazione con ROLLBACK
# sul progetto Supabase indicato. Non modifica nulla.
# Uso: SUPABASE_ACCESS_TOKEN=... ./supabase/tests/run.sh <project-ref>
set -euo pipefail
REF="${1:?project ref}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
SQL=$( { echo "begin;"; cat "$DIR/ops/reset-legacy.sql" "$DIR"/migrations/*.sql "$DIR/tests/smoke.sql"; echo "rollback;"; } )
printf '%s' "$SQL" | python3 -c '
import json, os, sys, urllib.request
ref = sys.argv[1]; sql = sys.stdin.read()
req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{ref}/database/query",
    data=json.dumps({"query": sql}).encode(), method="POST",
    headers={"Authorization": "Bearer " + os.environ.get("SUPABASE_ACCESS_TOKEN", "dummy"), "Content-Type": "application/json"})
try:
    print(urllib.request.urlopen(req).read().decode()[:2000])
except urllib.error.HTTPError as e:
    print("ERRORE", e.code, e.read().decode()[:3000]); sys.exit(1)
' "$REF"
