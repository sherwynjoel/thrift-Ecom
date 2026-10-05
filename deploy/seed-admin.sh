#!/usr/bin/env bash
# Create the store admin, or reset an existing admin's password, inside the running app container.
#   bash deploy/seed-admin.sh [email]
# The password is typed at a prompt and piped over stdin: it never touches disk, shell history or the process list.
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
COMPOSE=(docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env)

email="${1:-}"
if [ -z "$email" ] && [ -f deploy/.env ]; then
  email="$({ grep -E '^ADMIN_EMAIL=' deploy/.env || true; } | tail -n 1 | cut -d= -f2- | tr -d '"')"
fi
if [ -z "$email" ]; then read -rp "Admin email: " email; fi

read -rsp "Admin password (12+ characters): " password; echo
read -rsp "Repeat the password: " again; echo
[ "$password" = "$again" ] || { echo "The passwords do not match." >&2; exit 1; }
[ "${#password}" -ge 12 ] || { echo "Use at least 12 characters." >&2; exit 1; }

[ -n "$("${COMPOSE[@]}" ps -q app)" ] || { echo "The app is not running. Run: bash deploy/deploy.sh" >&2; exit 1; }
printf '%s\n%s\n' "$email" "$password" | "${COMPOSE[@]}" exec -T app node /opt/tools/create-admin.mjs --stdin
