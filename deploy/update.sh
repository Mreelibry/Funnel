#!/usr/bin/env bash
# Автообновление: если в ветке появились новые коммиты — подтянуть и пересобрать контейнер.
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BRANCH="${BRANCH:-claude/wonderful-shannon-l6ye11}"
cd "$APP_DIR"
exec 9>/tmp/otpravki-update.lock
flock -n 9 || exit 0

git fetch -q origin "$BRANCH"
[ "$(git rev-parse HEAD)" = "$(git rev-parse "origin/$BRANCH")" ] && exit 0

echo "$(date '+%F %T') обновление до $(git rev-parse --short "origin/$BRANCH")"
git reset -q --hard "origin/$BRANCH"
chmod +x deploy/update.sh
docker compose up -d --build --remove-orphans
docker image prune -f >/dev/null 2>&1 || true
