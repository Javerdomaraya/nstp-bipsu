#!/usr/bin/env bash
#
# Executes the real coordinator-scope migration against a real PostgreSQL server
# and asserts, case by case, that it resolves what it can and ABORTS on
# everything it cannot.
#
# Why this exists in addition to test/migration-scope-guard.test.js: that suite
# asserts the structure of migration.sql and executes a SQLite transcription of
# its logic. Neither proves the PL/pgSQL parses, that ::"CoordinatorScope" casts
# resolve, or that RAISE EXCEPTION actually rolls the transaction back. Only
# running the file on PostgreSQL proves that, and it is the abort paths -- the
# ones that must never silently preserve a stale CWTS grant -- that most need it.
#
# ---------------------------------------------------------------------------
# THIS SCRIPT IS DESTRUCTIVE. It deletes all rows from coordinator_profile,
# nstp_component, and user, drops foreign keys, and re-adds a column default.
# It must only ever run against a disposable CI or scratch database, which is
# why it refuses to start unless BOTH guards below are satisfied.
# ---------------------------------------------------------------------------
#
#   MIGRATION_GUARD_TEST=1   explicit opt-in from the caller
#   database name           must match one of the disposable-name patterns
#
# Usage:
#   MIGRATION_GUARD_TEST=1 DATABASE_URL=postgresql://...:5432/nstp_ci \
#     bash test/migration-guard.pgtest.sh

set -euo pipefail

MIGRATION_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/prisma/migrations/20260824120000_require_explicit_coordinator_scope"
MIGRATION_FILE="$MIGRATION_DIR/migration.sql"

if [[ ! -f "$MIGRATION_FILE" ]]; then
  echo "FATAL: migration not found at $MIGRATION_FILE" >&2
  exit 1
fi

if [[ "${MIGRATION_GUARD_TEST:-}" != "1" ]]; then
  cat >&2 <<'MSG'
REFUSING TO RUN.

This script destroys data in the target database. Set MIGRATION_GUARD_TEST=1 to
confirm the target is a disposable CI or scratch database.
MSG
  exit 2
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "REFUSING TO RUN: DATABASE_URL is not set." >&2
  exit 2
fi

# Strip credentials, query string, and path to isolate the database name.
DB_NAME="${DATABASE_URL##*/}"
DB_NAME="${DB_NAME%%\?*}"

case "$DB_NAME" in
  nstp_ci | nstp_guard_test | *_test | *_scratch | *_ci)
    ;;
  *)
    cat >&2 <<MSG
REFUSING TO RUN against database "$DB_NAME".

Only disposable databases are permitted: nstp_ci, nstp_guard_test, *_test,
*_scratch, *_ci. This check exists so that a stray DATABASE_URL pointing at
production cannot destroy it.
MSG
    exit 2
    ;;
esac

echo "Target database: $DB_NAME"
echo "Migration under test: ${MIGRATION_FILE#"$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/"}"
echo

psql_q() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -t -A -c "$1"; }
psql_exec() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }

# Sanity: the schema must already be at head. This script rewinds one column, not
# the whole schema, so it cannot bootstrap an empty database.
if [[ "$(psql_q "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='coordinator_profile' AND column_name='scope'")" != "1" ]]; then
  echo "FATAL: coordinator_profile.scope not found. Apply migrations before running this script." >&2
  exit 1
fi

PASS=0
FAIL=0
declare -a FAILURES=()

# Restores the exact pre-migration condition: the historical column default is
# back, the foreign keys are absent (so the dangling-reference cases can be
# constructed at all -- which is precisely the production state the guard exists
# to catch), and the three tables are empty.
reset_state() {
  # TRUNCATE ... CASCADE rather than DELETE: nstp_component is referenced by
  # section, module, student_profile, enrollment, grade, and instructor_profile,
  # so a plain DELETE would fail on a database that is not completely empty.
  # CASCADE is safe here only because this script refuses to run against
  # anything but a disposable database.
  psql_exec "
    ALTER TABLE \"coordinator_profile\"
      DROP CONSTRAINT IF EXISTS \"coordinator_profile_userId_fkey\",
      DROP CONSTRAINT IF EXISTS \"coordinator_profile_componentId_fkey\";
    TRUNCATE \"coordinator_profile\", \"nstp_component\" CASCADE;
    DELETE FROM \"user\" WHERE \"id\" LIKE 'guard-%';
    ALTER TABLE \"coordinator_profile\"
      ALTER COLUMN \"scope\" SET DEFAULT 'CWTS'::\"CoordinatorScope\";
  "
}

# Returns the database to post-migration head state: both foreign keys present
# with the ON DELETE actions declared in 20260802130000_restore_postgres_foreign_keys,
# no rows from this script, and no column default. Without this, a later CI step
# that verifies physical FK state would see the keys this script dropped and
# report a false defect.
restore_schema() {
  psql_exec "
    TRUNCATE \"coordinator_profile\", \"nstp_component\" CASCADE;
    DELETE FROM \"user\" WHERE \"id\" LIKE 'guard-%';
    ALTER TABLE \"coordinator_profile\" ALTER COLUMN \"scope\" DROP DEFAULT;
    ALTER TABLE \"coordinator_profile\"
      DROP CONSTRAINT IF EXISTS \"coordinator_profile_userId_fkey\",
      DROP CONSTRAINT IF EXISTS \"coordinator_profile_componentId_fkey\";
    ALTER TABLE \"coordinator_profile\"
      ADD CONSTRAINT \"coordinator_profile_userId_fkey\"
        FOREIGN KEY (\"userId\") REFERENCES \"user\"(\"id\") ON DELETE CASCADE ON UPDATE CASCADE,
      ADD CONSTRAINT \"coordinator_profile_componentId_fkey\"
        FOREIGN KEY (\"componentId\") REFERENCES \"nstp_component\"(\"id\") ON DELETE SET NULL ON UPDATE CASCADE;
  "
}

seed_user() { # id, coordinatorScope metadata ('' for none)
  local id="$1" scope="${2:-}"
  local data='{}'
  [[ -n "$scope" ]] && data="{\"coordinatorScope\": \"$scope\"}"
  psql_exec "INSERT INTO \"user\" (\"id\",\"name\",\"email\",\"passwordHash\",\"role\",\"status\",\"data\",\"createdAt\",\"updatedAt\")
             VALUES ('$id','Guard $id','$id@guard.test','x','COORDINATOR','ACTIVE','$data'::jsonb, now(), now())"
}

seed_component() { # id, type
  psql_exec "INSERT INTO \"nstp_component\" (\"id\",\"type\",\"name\",\"createdAt\",\"updatedAt\")
             VALUES ('$1','$2'::\"NSTPComponentType\",'$2', now(), now())"
}

seed_profile() { # id, userId, componentId ('' for NULL)
  local component="NULL"
  [[ -n "${3:-}" ]] && component="'$3'"
  # scope is deliberately omitted so the historical DEFAULT 'CWTS' applies --
  # this is what an unmigrated production row looks like.
  psql_exec "INSERT INTO \"coordinator_profile\" (\"id\",\"userId\",\"componentId\",\"createdAt\",\"updatedAt\")
             VALUES ('$1','$2',$component, now(), now())"
}

# Runs the migration the way Prisma does: one file, one transaction.
run_migration() {
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -q -f "$MIGRATION_FILE" 2>&1
}

record() { # outcome, label, detail
  if [[ "$1" == pass ]]; then
    PASS=$((PASS + 1))
    printf '  PASS  %s\n' "$2"
  else
    FAIL=$((FAIL + 1))
    FAILURES+=("$2 -- $3")
    printf '  FAIL  %s\n        %s\n' "$2" "$3"
  fi
}

expect_resolves() { # label, profileId, expectedScope
  local label="$1" profile="$2" expected="$3" output actual
  if [[ -z "$(psql_q "SELECT \"scope\" FROM \"coordinator_profile\" WHERE \"id\"='$profile'")" ]]; then
    record fail "$label" "setup error: profile $profile was not seeded"
    return
  fi
  if ! output="$(run_migration)"; then
    record fail "$label" "migration aborted unexpectedly: ${output//$'\n'/ }"
    return
  fi
  actual="$(psql_q "SELECT \"scope\" FROM \"coordinator_profile\" WHERE \"id\"='$profile'")"
  if [[ "$actual" == "$expected" ]]; then
    record pass "$label (scope=$actual)"
  else
    record fail "$label" "expected scope $expected, got '$actual'"
  fi
}

expect_aborts() { # label, profileId, expectedMessageFragment
  local label="$1" profile="$2" fragment="$3" output before after
  before="$(psql_q "SELECT \"scope\" FROM \"coordinator_profile\" WHERE \"id\"='$profile'")"

  # Without this, a mis-seeded case would compare two empty strings and pass.
  if [[ -z "$before" ]]; then
    record fail "$label" "setup error: profile $profile was not seeded"
    return
  fi

  if output="$(run_migration)"; then
    record fail "$label" "migration SUCCEEDED but must abort"
    return
  fi

  if [[ "$output" != *"$fragment"* ]]; then
    record fail "$label" "aborted, but not for the expected reason: ${output//$'\n'/ }"
    return
  fi

  # The property that matters most: a rolled-back migration must leave the row
  # exactly as it was, not part-way converted and not silently resolved.
  after="$(psql_q "SELECT \"scope\" FROM \"coordinator_profile\" WHERE \"id\"='$profile'")"
  if [[ "$before" != "$after" ]]; then
    record fail "$label" "row mutated despite abort: '$before' -> '$after'"
    return
  fi

  # The default must still be present, proving the whole file rolled back and not
  # merely the statement that raised.
  local still_default
  still_default="$(psql_q "SELECT COALESCE(column_default,'') FROM information_schema.columns
                           WHERE table_name='coordinator_profile' AND column_name='scope'")"
  if [[ "$still_default" != *CWTS* ]]; then
    record fail "$label" "DROP DEFAULT was committed despite the abort"
    return
  fi

  record pass "$label (rolled back cleanly)"
}

echo "Resolvable cases -- the migration must complete and derive the correct scope:"

reset_state; seed_user guard-u1; seed_component guard-c-cwts CWTS
seed_profile guard-p1 guard-u1 guard-c-cwts
expect_resolves "A. component CWTS -> CWTS" guard-p1 CWTS

reset_state; seed_user guard-u1; seed_component guard-c-lts LTS
seed_profile guard-p1 guard-u1 guard-c-lts
expect_resolves "B. component LTS -> LTS, not the CWTS default" guard-p1 LTS

reset_state; seed_user guard-u1; seed_component guard-c-army MTS_ARMY
seed_profile guard-p1 guard-u1 guard-c-army
expect_resolves "C. component MTS_ARMY -> MTS" guard-p1 MTS

reset_state; seed_user guard-u1; seed_component guard-c-navy MTS_NAVY
seed_profile guard-p1 guard-u1 guard-c-navy
expect_resolves "C2. component MTS_NAVY -> MTS" guard-p1 MTS

reset_state; seed_user guard-u1; seed_component guard-c-coast CWTS_COAST_GUARD
seed_profile guard-p1 guard-u1 guard-c-coast
expect_resolves "C3. component CWTS_COAST_GUARD -> CWTS" guard-p1 CWTS

reset_state; seed_user guard-u1 MTS
seed_profile guard-p1 guard-u1 ''
expect_resolves "D. no component, metadata MTS -> MTS" guard-p1 MTS

echo
echo "Unresolvable cases -- the migration must abort and roll back:"

reset_state; seed_user guard-u1 LTS; seed_component guard-c-cwts CWTS
seed_profile guard-p1 guard-u1 guard-c-cwts
expect_aborts "E. component and metadata disagree" guard-p1 "disagree"

reset_state; seed_user guard-u1 LTS
seed_profile guard-p1 guard-u1 guard-c-deleted
expect_aborts "F. dangling componentId" guard-p1 "dangling"

reset_state; seed_component guard-c-lts LTS
seed_profile guard-p1 guard-u-deleted guard-c-lts
expect_aborts "G. orphan userId" guard-p1 "dangling"

reset_state; seed_user guard-u1
seed_profile guard-p1 guard-u1 ''
expect_aborts "H. no component and no usable metadata" guard-p1 "no authoritative"

echo
echo "Post-migration column state:"

reset_state; seed_user guard-u1; seed_component guard-c-lts LTS
seed_profile guard-p1 guard-u1 guard-c-lts
if run_migration >/dev/null 2>&1; then
  remaining="$(psql_q "SELECT COALESCE(column_default,'none') FROM information_schema.columns
                       WHERE table_name='coordinator_profile' AND column_name='scope'")"
  if [[ "$remaining" == none ]]; then
    record pass "I. the historical DEFAULT is gone after a successful migration"
  else
    record fail "I. the historical DEFAULT is gone after a successful migration" \
      "default is still '$remaining'"
  fi

  # With no default, an omitted scope must be refused by the database itself --
  # the backstop behind the request schema.
  #
  # A DIFFERENT user is required here: coordinator_profile.userId is UNIQUE, so
  # reusing guard-u1 would fail with a unique violation and the case would pass
  # for entirely the wrong reason.
  seed_user guard-u2
  nodefault_error="$(psql "$DATABASE_URL" -q -c \
    "INSERT INTO \"coordinator_profile\" (\"id\",\"userId\",\"createdAt\",\"updatedAt\")
     VALUES ('guard-p-nodefault','guard-u2', now(), now())" 2>&1 || true)"

  if [[ "$nodefault_error" != *"null value in column \"scope\""* ]]; then
    if [[ -z "$nodefault_error" ]]; then
      record fail "J. an omitted scope is refused by the database" \
        "the INSERT succeeded, so a default or nullable column remains"
    else
      record fail "J. an omitted scope is refused by the database" \
        "rejected for the wrong reason: ${nodefault_error//$'\n'/ }"
    fi
  else
    record pass "J. an omitted scope is refused by the database (not-null violation)"
  fi
else
  record fail "I/J. post-migration column state" "the setup migration did not complete"
fi

echo
restore_schema
echo "----------------------------------------------------------------------"
printf 'Migration guard (PostgreSQL): %d passed, %d failed\n' "$PASS" "$FAIL"

if (( FAIL > 0 )); then
  echo
  echo "Failures:"
  for failure in "${FAILURES[@]}"; do echo "  - $failure"; done
  echo
  echo "The coordinator scope migration must not be deployed while these fail."
  exit 1
fi

echo "The migration resolves every derivable case and refuses every ambiguous one."
