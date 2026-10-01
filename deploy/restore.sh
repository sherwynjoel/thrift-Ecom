#!/usr/bin/env bash
# Restore from the daily backups in the `backups` volume.
#   bash deploy/restore.sh list
#   bash deploy/restore.sh db db-20261001T213000Z.sql.gz            replace the live database (a fresh backup is taken first)
#   bash deploy/restore.sh uploads uploads-20261001T213000Z.tar.gz   put product/banner/design images back into the uploads volume
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
COMPOSE=(docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env)
die() { echo "[restore] ERROR: $*" >&2; exit 1; }
confirm() {
  local answer
  read -rp "$1 Type RESTORE to continue: " answer
  [ "$answer" = "RESTORE" ] || die "cancelled"
}

cmd="${1:-}"
file="${2:-}"
case "$cmd" in
  list)
    "${COMPOSE[@]}" exec -T backup ls -lh /backups
    ;;
  db)
    [[ "$file" =~ ^db-[0-9]{8}T[0-9]{6}Z\.sql\.gz$ ]] || die "usage: restore.sh db db-YYYYMMDDTHHMMSSZ.sql.gz (see: restore.sh list)"
    # The app is restarted below with the image deploy.sh last started; without it compose would look for thrift-app:dev.
    APP_VERSION="$(cat deploy/.current-version 2>/dev/null || true)"
    [ -n "$APP_VERSION" ] || die "deploy/.current-version is missing: run bash deploy/deploy.sh once before restoring"
    export APP_VERSION
    "${COMPOSE[@]}" exec -T backup test -f "/backups/$file" || die "/backups/$file does not exist"
    confirm "This REPLACES the live database with $file."
    "${COMPOSE[@]}" exec -T backup sh /opt/backup/backup.sh once
    "${COMPOSE[@]}" stop app cron
    # Single quotes on purpose: $PGDATABASE is expanded inside the backup container, where it is set.
    # shellcheck disable=SC2016
    "${COMPOSE[@]}" exec -T backup sh -c 'dropdb --if-exists --force "$PGDATABASE" && createdb "$PGDATABASE"'
    "${COMPOSE[@]}" exec -T backup sh -c "gunzip -c '/backups/$file' | psql -v ON_ERROR_STOP=1 --quiet --single-transaction"
    "${COMPOSE[@]}" up -d --no-build --wait --wait-timeout 300 app cron
    echo "[restore] database restored from $file"
    ;;
  uploads)
    [[ "$file" =~ ^uploads-[0-9]{8}T[0-9]{6}Z\.tar\.gz$ ]] || die "usage: restore.sh uploads uploads-YYYYMMDDTHHMMSSZ.tar.gz"
    confirm "This overwrites images in the uploads volume with the ones in $file."
    docker run --rm -v thrift_uploads:/uploads -v thrift_backups:/backups:ro alpine:3.20 \
      sh -c "tar -xzf '/backups/$file' -C /uploads && chown -R 1001:1001 /uploads"
    echo "[restore] uploads restored from $file"
    ;;
  *)
    sed -n '2,5p' "$0"
    exit 64
    ;;
esac
