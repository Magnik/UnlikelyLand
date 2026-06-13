#!/usr/bin/env bash
# Dump the UnlikelyLand database from the running postgres container to a
# gzipped file, and prune to the most recent 14 backups.
#
#   Run from the repo root with the .env loaded, e.g.:
#     set -a && . ./.env && set +a && ./scripts/backup-postgres.sh
#
# Test your restores periodically with scripts/restore-postgres.sh.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETAIN="${RETAIN:-14}"
PG_USER="${POSTGRES_USER:-unlikely}"
PG_DB="${POSTGRES_DB:-unlikelyland}"

mkdir -p "$BACKUP_DIR"
TS="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/unlikelyland-$TS.sql.gz"

echo "Backing up database '$PG_DB' → $OUT"
docker compose exec -T postgres pg_dump -U "$PG_USER" "$PG_DB" | gzip > "$OUT"

# Retention: keep the newest $RETAIN, delete the rest.
ls -1t "$BACKUP_DIR"/unlikelyland-*.sql.gz 2>/dev/null | tail -n "+$((RETAIN + 1))" | xargs -r rm -f

echo "Done. Current backups:"
ls -1t "$BACKUP_DIR"/unlikelyland-*.sql.gz
