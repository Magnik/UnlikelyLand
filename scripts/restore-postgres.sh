#!/usr/bin/env bash
# Restore the UnlikelyLand database from a gzipped pg_dump file.
#
#   set -a && . ./.env && set +a && ./scripts/restore-postgres.sh backups/unlikelyland-YYYYMMDD-HHMMSS.sql.gz
#
# For the Hostinger stack, target its Compose project explicitly:
#   COMPOSE_PROJECT_NAME=unlikelyland ./scripts/restore-postgres.sh backups/<file>.sql.gz
#
# WARNING: this overwrites current data. Take a fresh backup first.
set -euo pipefail

FILE="${1:?usage: restore-postgres.sh <backup.sql.gz>}"
PG_USER="${POSTGRES_USER:-unlikely}"
PG_DB="${POSTGRES_DB:-unlikelyland}"

# Honour COMPOSE_PROJECT_NAME so the script targets the right stack's container.
COMPOSE=(docker compose)
[ -n "${COMPOSE_PROJECT_NAME:-}" ] && COMPOSE=(docker compose -p "$COMPOSE_PROJECT_NAME")

if [ ! -f "$FILE" ]; then
  echo "No such file: $FILE" >&2
  exit 1
fi

echo "Restoring '$PG_DB' from $FILE ..."
gunzip -c "$FILE" | "${COMPOSE[@]}" exec -T postgres psql -U "$PG_USER" -d "$PG_DB"
echo "Restore complete. Verify the app, then keep an eye on it."
