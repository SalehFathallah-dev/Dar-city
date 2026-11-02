#!/usr/bin/env bash
# Database test suite on throw-away local PostgreSQL clusters (PostgreSQL 15+ binaries required).
#  Phase A – existing single-club data → multi-club migration → integrity + RLS + club isolation tests
#  Phase B – migration rollback keeps every record, and the migration can be re-applied
#  Phase C – fresh install with the current DEMO seed, then DEMO removal
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PORT="${PGPORT_TEST:-55432}"
RUN_AS=""; [ "$(id -u)" = "0" ] && RUN_AS="runuser -u postgres --"
WORK=""
start_db() {
  WORK="$(mktemp -d)"; [ -n "$RUN_AS" ] && chown postgres "$WORK"
  $RUN_AS "$PGBIN/initdb" -D "$WORK/data" -U postgres >/dev/null 2>&1
  $RUN_AS "$PGBIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" start >/dev/null
  PSQL=(psql -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -o /dev/null)
  "${PSQL[@]}" -f "$ROOT/supabase/tests/00_supabase_stubs.sql"
}
stop_db() { [ -n "$WORK" ] && { $RUN_AS "$PGBIN/pg_ctl" -D "$WORK/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$WORK"; WORK=""; }; }
trap stop_db EXIT
M="$ROOT/supabase/migrations"
legacy() { for f in "$M"/2026110200000{1,2,3}_*.sql; do "${PSQL[@]}" -f "$f"; done; "${PSQL[@]}" -f "$ROOT/supabase/tests/legacy_seed.sql"; }
counts() { psql -h "$WORK" -p "$PORT" -U postgres -d postgres -At -c "select string_agg(n::text, ',') from (select count(*) n from players union all select count(*) from medical_examinations union all select count(*) from injuries union all select count(*) from injury_followups union all select count(*) from treatments union all select count(*) from rehabilitation_sessions union all select count(*) from rtp_assessments union all select count(*) from medical_clearances union all select count(*) from player_availability union all select count(*) from medical_histories) x"; }

echo "Phase A – migrate existing data and test security"
start_db; legacy
BEFORE=$(counts)
"${PSQL[@]}" -f "$M/20261102000004_multi_club.sql"
AFTER=$(counts)
[ "$BEFORE" = "$AFTER" ] || { echo "Row counts changed: $BEFORE -> $AFTER"; exit 1; }
echo "  record counts preserved: $AFTER"
( cd "$ROOT/supabase/tests" && psql -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -o /dev/null -f rls_tests.sql )
stop_db

echo "Phase B – rollback and re-apply"
start_db; legacy
BEFORE=$(counts)
"${PSQL[@]}" -f "$M/20261102000004_multi_club.sql"
"${PSQL[@]}" -f "$ROOT/supabase/rollback/20261102000004_multi_club_down.sql"
[ "$(counts)" = "$BEFORE" ] || { echo "Rollback changed row counts"; exit 1; }
"${PSQL[@]}" -c "insert into public.players (full_name, date_of_birth, position) values ('Post-rollback', '2000-01-01', 'Center')"
"${PSQL[@]}" -c "delete from public.players where full_name = 'Post-rollback'"
"${PSQL[@]}" -f "$M/20261102000004_multi_club.sql"
echo "  rollback preserved all records; migration re-applied"
stop_db

echo "Phase C – fresh install with DEMO data"
start_db
for f in "$M"/*.sql; do "${PSQL[@]}" -f "$f"; done
"${PSQL[@]}" -f "$ROOT/supabase/seed/demo_data.sql"
"${PSQL[@]}" -c "do \$\$ begin assert (select count(*) from public.clubs) = 2; assert (select count(*) from public.players where club_id = '00000000-0000-4000-8000-00000000c0d2') = 3; assert (select count(*) from public.players where player_code like 'KWB-%') = 3; end \$\$;"
"${PSQL[@]}" -f "$ROOT/supabase/seed/remove_demo_data.sql"
"${PSQL[@]}" -c "do \$\$ begin assert (select count(*) from public.players where is_demo) = 0; assert (select count(*) from public.clubs) = 1; end \$\$;"
stop_db
echo "Database test suite completed successfully."
