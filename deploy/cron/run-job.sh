#!/bin/sh
# Usage: sh /opt/cron/run-job.sh <job>
# POSTs /api/cron/<job> on the app with the bearer header written by start.sh; prints one log line.
set -u
job="${1:?usage: run-job.sh <job>}"
base="$(cat /run/cron-app-url 2>/dev/null || echo http://app:3000)"
started="$(date '+%Y-%m-%d %H:%M:%S %Z')"

if out="$(curl -sS --fail-with-body --max-time 300 -X POST -H @/run/cron-auth-header "${base}/api/cron/${job}" 2>&1)"; then
  echo "${started} [cron] ${job} ok ${out}"
else
  status=$?
  echo "${started} [cron] ${job} FAILED (curl exit ${status}) ${out}"
  exit "${status}"
fi
