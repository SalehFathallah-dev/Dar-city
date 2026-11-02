#!/usr/bin/env bash
# Runs all migrations, the demo seed and RLS tests against a throwaway local
# PostgreSQL cluster. Requires PostgreSQL 15+ binaries (pg_ctl, initdb, psql).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
WORK="$(mktemp -d)"
PORT="${PGPORT_TEST:-55432}"
RUN_AS=""
if [ "$(id -u)" = "0" ]; then RUN_AS="runuser -u postgres --"; chown postgres "$WORK"; fi
cleanup() { $RUN_AS "$PGBIN/pg_ctl" -D "$WORK/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT
$RUN_AS "$PGBIN/initdb" -D "$WORK/data" -U postgres >/dev/null
$RUN_AS "$PGBIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" start >/dev/null
PSQL=(psql -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f "$ROOT/supabase/tests/00_supabase_stubs.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do echo "→ $(basename "$f")"; "${PSQL[@]}" -f "$f"; done
echo "→ demo seed"; "${PSQL[@]}" -f "$ROOT/supabase/seed/demo_data.sql"
echo "→ RLS tests"; "${PSQL[@]}" -f "$ROOT/supabase/tests/rls_tests.sql"
echo "→ demo removal"; "${PSQL[@]}" -f "$ROOT/supabase/seed/remove_demo_data.sql"
"${PSQL[@]}" -c "do \$\$ begin assert (select count(*) from public.players where is_demo) = 0; end \$\$;"
echo "Database test suite completed successfully."
