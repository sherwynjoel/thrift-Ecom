#!/usr/bin/env bash
# Build and (re)start the production stack. Run from anywhere inside the repo on the server.
#   bash deploy/deploy.sh                  git pull, build thrift-app:<commit>, start, wait for health, roll back if unhealthy
#   bash deploy/deploy.sh --no-pull        deploy the commit that is checked out
#   bash deploy/deploy.sh --restart        re-read deploy/.env and recreate app, cron and backup without rebuilding
#   bash deploy/deploy.sh --rollback TAG   run a previously built image (list: docker images thrift-app)
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
ENV_FILE=deploy/.env
COMPOSE=(docker compose -f deploy/docker-compose.prod.yml --env-file "$ENV_FILE")
KEEP_IMAGES=3
WAIT=(--wait --wait-timeout 300)

log() { printf '\033[1m[deploy]\033[0m %s\n' "$*"; }
die() { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
env_value() { { grep -E "^$1=" "$ENV_FILE" || true; } | tail -n 1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
need() { [ -n "$(env_value "$1")" ] || die "set $1 in $ENV_FILE${2:+ ($2)}"; }

# Mirrors src/server/env-check.ts: the app refuses to start without these, so stop here instead of mid-deploy.
preflight() {
  command -v docker >/dev/null 2>&1 || die "Docker is missing: sudo bash deploy/setup-ec2.sh"
  [ -f "$ENV_FILE" ] || die "$ENV_FILE is missing: cp deploy/.env.production.example $ENV_FILE and fill it in"
  if grep -qE '^(POSTGRES_PASSWORD|AUTH_SECRET|CRON_SECRET)=replace-with-' "$ENV_FILE"; then
    die "$ENV_FILE still contains replace-with-… placeholders"
  fi
  DOMAIN="$(env_value DOMAIN)"
  if [ -z "$DOMAIN" ] || [ "$DOMAIN" = "shop.example.com" ]; then die "set DOMAIN in $ENV_FILE"; fi
  need ACME_EMAIL
  need AUTH_SECRET "openssl rand -base64 32"
  case "$(env_value PAYMENT_PROVIDER)" in
    razorpay)
      need RAZORPAY_KEY_ID "Razorpay dashboard → API Keys; Test mode keys are fine to start"
      need RAZORPAY_KEY_SECRET "Razorpay dashboard → API Keys"
      need RAZORPAY_WEBHOOK_SECRET "openssl rand -hex 32, also pasted into the Razorpay webhook" ;;
    disabled) log "PAYMENT_PROVIDER=disabled: checkout shows 'payments open soon' until Razorpay keys are added" ;;
    *) die "PAYMENT_PROVIDER must be razorpay (or disabled before keys exist) in $ENV_FILE" ;;
  esac
  local cron_secret
  cron_secret="$(env_value CRON_SECRET)"
  [ "${#cron_secret}" -ge 32 ] || die "CRON_SECRET must be at least 32 characters (openssl rand -hex 32)"
  case "$(env_value EMAIL_DRIVER)" in
    smtp) need SMTP_URL "EMAIL_DRIVER=smtp" ;;
    ses) need AWS_REGION "EMAIL_DRIVER=ses" ;;
    disabled) log "EMAIL_DRIVER=disabled: no emails are sent until an email sender is configured" ;;
    *) die "EMAIL_DRIVER must be smtp or ses (or disabled before a sender exists) in $ENV_FILE (see docs/deploy/aws-ec2.md → Email)" ;;
  esac
  need EMAIL_FROM
  if grep -qE '^(ACME_EMAIL|EMAIL_FROM)=.*@example\.com' "$ENV_FILE"; then
    die "replace the example.com placeholder in ACME_EMAIL/EMAIL_FROM in $ENV_FILE with your real address"
  fi
  "${COMPOSE[@]}" config -q || die "the compose configuration is invalid"
}

public_check() {
  if curl -fsS --max-time 15 "https://${DOMAIN}/api/health"; then
    echo
  else
    log "WARNING: https://${DOMAIN}/api/health is not reachable yet (DNS or the certificate may still be pending)"
  fi
}

prune_images() {
  local current previous tag
  current="$(cat deploy/.current-version 2>/dev/null || true)"
  previous="$(cat deploy/.previous-version 2>/dev/null || true)"
  # `docker images` lists newest first; keep the newest KEEP_IMAGES plus whatever is current/previous.
  docker images thrift-app --format '{{.Tag}}' | tail -n +"$((KEEP_IMAGES + 1))" | while read -r tag; do
    if [ "$tag" != "$current" ] && [ "$tag" != "$previous" ]; then docker rmi "thrift-app:$tag" >/dev/null || true; fi
  done
  docker image prune -f >/dev/null
  docker builder prune -f --filter until=168h >/dev/null || true
}

mode=deploy
pull=1
tag=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --no-pull) pull=0 ;;
    --restart) mode=restart ;;
    --rollback)
      mode=rollback
      tag="${2:-}"
      if [ "$#" -gt 1 ]; then shift; fi
      ;;
    -h|--help) sed -n '2,6p' "$0"; exit 0 ;;
    *) die "unknown option: $1 (see --help)" ;;
  esac
  shift
done

preflight

if [ "$mode" = restart ]; then
  APP_VERSION="$(cat deploy/.current-version 2>/dev/null || echo dev)"
  export APP_VERSION
  log "recreating app, cron and backup with thrift-app:$APP_VERSION"
  "${COMPOSE[@]}" up -d --no-build --force-recreate "${WAIT[@]}" app cron backup || die "the app did not become healthy: ${COMPOSE[*]} logs app"
  public_check
  exit 0
fi

if [ "$mode" = rollback ]; then
  [ -n "$tag" ] || die "usage: deploy.sh --rollback <tag>   (tags: docker images thrift-app)"
  docker image inspect "thrift-app:$tag" >/dev/null 2>&1 || die "there is no local image thrift-app:$tag"
  export APP_VERSION="$tag"
  log "rolling back to $tag (database migrations are not reverted)"
  "${COMPOSE[@]}" up -d --no-build "${WAIT[@]}" app cron || die "thrift-app:$tag did not become healthy"
  cp deploy/.current-version deploy/.previous-version 2>/dev/null || true
  echo "$tag" > deploy/.current-version
  public_check
  exit 0
fi

if [ "$pull" = 1 ]; then
  log "pulling the latest code"
  git pull --ff-only
  # Continue with the freshly pulled copy of this script, so changes to the deploy kit apply in the same run.
  exec bash deploy/deploy.sh --no-pull
fi
APP_VERSION="$(git rev-parse --short HEAD)"
export APP_VERSION
previous="$(cat deploy/.current-version 2>/dev/null || true)"

log "building thrift-app:$APP_VERSION (the first build takes several minutes)"
"${COMPOSE[@]}" build app cron

log "starting the stack and waiting for it to become healthy"
if ! "${COMPOSE[@]}" up -d --remove-orphans "${WAIT[@]}"; then
  "${COMPOSE[@]}" logs --tail 80 app || true
  if [ -n "$previous" ] && [ "$previous" != "$APP_VERSION" ] && docker image inspect "thrift-app:$previous" >/dev/null 2>&1; then
    log "thrift-app:$APP_VERSION is unhealthy; rolling back to $previous"
    APP_VERSION="$previous" "${COMPOSE[@]}" up -d --no-build "${WAIT[@]}" app cron caddy || true
    die "deploy of $APP_VERSION failed and was rolled back to $previous"
  fi
  die "deploy of $APP_VERSION failed (no earlier image to roll back to)"
fi

if [ -n "$previous" ] && [ "$previous" != "$APP_VERSION" ]; then echo "$previous" > deploy/.previous-version; fi
echo "$APP_VERSION" > deploy/.current-version
log "thrift-app:$APP_VERSION is healthy"
public_check
prune_images
log "done"
