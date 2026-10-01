#!/bin/sh
# Entrypoint of the `backup` container (postgres:16-alpine).
#   sh /opt/backup/backup.sh loop   (default) checks hourly and backs up when the newest dump is older than ~23 h
#   sh /opt/backup/backup.sh once   one backup now (used by deploy/restore.sh before a restore)
# Writes /backups/db-<UTC>.sql.gz (pg_dump) and /backups/uploads-<UTC>.tar.gz (the uploads volume),
# deletes files older than BACKUP_RETENTION_DAYS, and copies new files to s3://$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX/ when set.
set -eu
# shellcheck disable=SC3040 # busybox ash (alpine) supports pipefail
set -o pipefail

DIR=/backups
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
mkdir -p "$DIR"

log() { echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') [backup] $*"; }

s3_copy() {
  [ -n "${BACKUP_S3_BUCKET:-}" ] || return 0
  command -v aws >/dev/null 2>&1 || apk add --no-cache aws-cli >/dev/null
  if aws s3 cp --only-show-errors "$1" "s3://${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX:-thrift}/$(basename "$1")"; then
    log "copied $(basename "$1") to s3://${BACKUP_S3_BUCKET}"
  else
    log "WARNING: S3 copy of $(basename "$1") failed (local copy kept)"
  fi
}

backup_once() {
  ts="$(date -u '+%Y%m%dT%H%M%SZ')"
  db_tmp="$DIR/.db-$ts.partial"
  if pg_dump --no-owner --no-privileges | gzip -9 > "$db_tmp"; then
    mv "$db_tmp" "$DIR/db-$ts.sql.gz"
    log "database -> db-$ts.sql.gz ($(du -h "$DIR/db-$ts.sql.gz" | cut -f1))"
    s3_copy "$DIR/db-$ts.sql.gz"
  else
    rm -f "$db_tmp"
    log "ERROR: pg_dump failed"
    return 1
  fi
  if [ -d /uploads ]; then
    up_tmp="$DIR/.uploads-$ts.partial"
    if tar -czf "$up_tmp" -C /uploads .; then
      mv "$up_tmp" "$DIR/uploads-$ts.tar.gz"
      log "uploads -> uploads-$ts.tar.gz"
      s3_copy "$DIR/uploads-$ts.tar.gz"
    else
      rm -f "$up_tmp"
      log "WARNING: uploads archive failed"
    fi
  fi
  find "$DIR" -maxdepth 1 -type f \( -name 'db-*.sql.gz' -o -name 'uploads-*.tar.gz' \) -mtime +"$((RETENTION_DAYS - 1))" -print -delete
}

case "${1:-loop}" in
  once)
    backup_once
    ;;
  loop)
    log "started; retention ${RETENTION_DAYS} days${BACKUP_S3_BUCKET:+, copying to s3://$BACKUP_S3_BUCKET}"
    while true; do
      if [ -z "$(find "$DIR" -maxdepth 1 -name 'db-*.sql.gz' -mmin -1380 | head -n 1)" ]; then
        backup_once || log "backup failed; retrying in an hour"
      fi
      sleep 3600
    done
    ;;
  *)
    echo "usage: backup.sh [loop|once]" >&2
    exit 64
    ;;
esac
