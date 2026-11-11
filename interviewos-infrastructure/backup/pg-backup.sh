#!/usr/bin/env bash
# Logical PostgreSQL backup (pg_dump custom format) with retention.
#
#   ./pg-backup.sh                         # uses the docker compose "postgres" service
#   PG_MODE=native ./pg-backup.sh          # uses pg_dump on PATH and PG* env vars / ~/.pgpass
#
# Env: BACKUP_DIR (default /var/backups/interviewos), RETENTION_DAYS (default 14),
#      APP_DB_NAME (default interviewos), COMPOSE_FILE (default ../docker/docker-compose.yml).
# Credentials come from the environment or ~/.pgpass — never from this file.
# Schedule with cron, e.g.:  15 2 * * *  /opt/interviewos/infrastructure/backup/pg-backup.sh
set -euo pipefail
umask 077

BACKUP_DIR="${BACKUP_DIR:-/var/backups/interviewos}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
DB="${APP_DB_NAME:-interviewos}"
MODE="${PG_MODE:-docker}"
HERE="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$HERE/../docker/docker-compose.yml}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/${DB}_${STAMP}.dump"

mkdir -p "$BACKUP_DIR"
echo "Backing up database '$DB' → $OUT"

if [ "$MODE" = "docker" ]; then
  docker compose -f "$COMPOSE_FILE" exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$1" -Fc --no-owner' _ "$DB" > "$OUT.partial"
else
  pg_dump -d "$DB" -Fc --no-owner > "$OUT.partial"
fi

# Verify the archive is readable before keeping it.
if [ "$MODE" = "docker" ]; then
  docker compose -f "$COMPOSE_FILE" exec -T postgres pg_restore --list < "$OUT.partial" > /dev/null
else
  pg_restore --list "$OUT.partial" > /dev/null
fi
mv "$OUT.partial" "$OUT"
sha256sum "$OUT" > "$OUT.sha256"
echo "OK ($(du -h "$OUT" | cut -f1))"

# Retention: delete only our own dump files older than RETENTION_DAYS.
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name "${DB}_*.dump" -o -name "${DB}_*.dump.sha256" \) -mtime +"$RETENTION_DAYS" -print -delete
# Copy $BACKUP_DIR off the server (object storage / another host) — a backup on the same disk is not a backup.
