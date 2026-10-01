#!/bin/sh
# Entrypoint of the `cron` container (deploy/cron/Dockerfile: alpine + curl + tzdata): store the bearer header for run-job.sh,
# install deploy/crontab and run busybox crond in the foreground (logs go to `docker compose logs cron`).
set -eu
: "${CRON_SECRET:?CRON_SECRET must be set}"

umask 077
printf 'Authorization: Bearer %s\n' "$CRON_SECRET" > /run/cron-auth-header
printf '%s' "${APP_URL:-http://app:3000}" > /run/cron-app-url

mkdir -p /etc/crontabs
cp /etc/cron.src/crontab /etc/crontabs/root

echo "[cron] $(date) schedule (TZ=${TZ:-UTC}):"
grep -v '^#' /etc/crontabs/root | sed '/^[[:space:]]*$/d'
exec crond -f -d 8
