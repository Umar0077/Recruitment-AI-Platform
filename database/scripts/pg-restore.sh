#!/usr/bin/env bash
# Restore a pg_dump archive into a NEW, EMPTY database (default: interviewos_restore_<timestamp>).
# It never drops or overwrites an existing database. After checking the restored copy, switch the
# application's DATABASE_URL to it (or rename databases) during a planned maintenance window.
#
#   ./pg-restore.sh /var/backups/interviewos/interviewos_20261111T021500Z.dump [target_db]
#   PG_MODE=native ./pg-restore.sh <file> [target_db]
set -euo pipefail

FILE="${1:?usage: pg-restore.sh <dump-file> [target-db]}"
TARGET="${2:-interviewos_restore_$(date -u +%Y%m%dT%H%M%SZ)}"
OWNER="${APP_DB_USER:-interviewos_app}"
MODE="${PG_MODE:-docker}"
HERE="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$HERE/../docker/docker-compose.yml}"

[ -f "$FILE" ] || { echo "No such file: $FILE" >&2; exit 1; }
if [ -f "$FILE.sha256" ]; then sha256sum -c "$FILE.sha256"; fi
[[ "$TARGET" =~ ^[a-z_][a-z0-9_]{0,62}$ ]] || { echo "Invalid database name: $TARGET" >&2; exit 1; }

psql_cmd() {
  if [ "$MODE" = "docker" ]; then docker compose -f "$COMPOSE_FILE" exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 "$@"' _ "$@";
  else psql -d postgres -v ON_ERROR_STOP=1 "$@"; fi
}

EXISTS="$(psql_cmd -tAc "SELECT 1 FROM pg_database WHERE datname = '$TARGET'")"
if [ "$EXISTS" = "1" ]; then
  echo "Database '$TARGET' already exists. Refusing to overwrite — choose a new name." >&2
  exit 1
fi

psql_cmd -c "CREATE DATABASE \"$TARGET\" OWNER \"$OWNER\""
echo "Restoring $FILE → $TARGET"
if [ "$MODE" = "docker" ]; then
  docker compose -f "$COMPOSE_FILE" exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$1" --no-owner --role="$2" --exit-on-error' _ "$TARGET" "$OWNER" < "$FILE"
else
  pg_restore -d "$TARGET" --no-owner --role="$OWNER" --exit-on-error "$FILE"
fi
echo "Restored. Verify with: psql -d $TARGET -c 'SELECT count(*) FROM candidates;'"
