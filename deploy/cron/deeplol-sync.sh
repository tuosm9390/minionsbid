#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/minionsbid}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env.production.local}"
LOCK_FILE="${LOCK_FILE:-/var/lock/minionsbid-deeplol-sync.lock}"
LOG_DIR="${LOG_DIR:-$APP_DIR/logs/deeplol}"
BATCH_LIMIT="${DEEPLOL_BATCH_LIMIT:-50}"

mkdir -p "$LOG_DIR"
umask 077
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  printf '%s\n' 'Deeplol sync is already running; exiting.' >&2
  exit 0
fi

if [[ ! -r "$ENV_FILE" ]]; then
  printf 'Missing production environment file: %s\n' "$ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

cd "$APP_DIR"
RUN_LOG="$LOG_DIR/deeplol-sync-$(date -u +%Y%m%dT%H%M%SZ).log"

pnpm sync:deeplol -- --write --limit "$BATCH_LIMIT" 2>&1 | tee "$RUN_LOG"
