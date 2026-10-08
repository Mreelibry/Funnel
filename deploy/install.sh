#!/usr/bin/env bash
# Установка «Отправок» на сервер одной командой:
#   curl -fsSL https://raw.githubusercontent.com/Mreelibry/Funnel/claude/wonderful-shannon-l6ye11/deploy/install.sh | sudo bash
# Повторный запуск безопасен: обновит код и перезапустит сервис, данные и пароль сохранятся.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/Mreelibry/Funnel.git}"
BRANCH="${BRANCH:-claude/wonderful-shannon-l6ye11}"
APP_DIR="${APP_DIR:-/opt/otpravki}"

say() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Запустите с sudo: ... | sudo bash"

# ---------- Docker ----------
if ! command -v docker >/dev/null 2>&1; then
  say "Ставлю Docker"
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker >/dev/null 2>&1 || true
if ! docker compose version >/dev/null 2>&1; then
  say "Ставлю docker compose"
  (apt-get update -qq && apt-get install -y -qq docker-compose-plugin) || (dnf install -y docker-compose-plugin) \
    || die "Не удалось поставить docker compose"
fi
command -v git >/dev/null 2>&1 || { say "Ставлю git"; (apt-get install -y -qq git || dnf install -y git); }

# ---------- Код ----------
if [ -d "$APP_DIR/.git" ]; then
  say "Обновляю код в $APP_DIR"
  git -C "$APP_DIR" fetch -q origin "$BRANCH"
  git -C "$APP_DIR" checkout -q -B "$BRANCH" "origin/$BRANCH"
  git -C "$APP_DIR" reset -q --hard "origin/$BRANCH"
else
  if [ -e "$APP_DIR" ] && [ -n "$(ls -A "$APP_DIR" 2>/dev/null)" ]; then
    BAK="$APP_DIR.bak-$(date +%s)"
    say "В $APP_DIR уже есть файлы — переношу их в $BAK"
    mv "$APP_DIR" "$BAK"
  fi
  say "Скачиваю код в $APP_DIR"
  git clone -q --branch "$BRANCH" --single-branch "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"
mkdir -p data
[ -f service-account.json ] || echo '{}' > service-account.json

# ---------- Настройки ----------
port_busy() { ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$1\$"; }
if [ ! -f .env ]; then
  PORT=3100
  while port_busy "$PORT"; do PORT=$((PORT + 1)); done
  rand_hex() { od -An -N"$1" -tx1 /dev/urandom | tr -d ' \n'; }
  PASSWORD="$(rand_hex 5)"
  cat > .env <<ENV
APP_PASSWORD=$PASSWORD
SESSION_SECRET=$(rand_hex 32)
SPREADSHEET_ID=1daZLTn20ExCasdwpCW9bgayToJT1DUwolHC2r80b8II
OTPRAVKI_PORT=$PORT
ENV
  chmod 600 .env
fi
PORT="$(grep -E '^OTPRAVKI_PORT=' .env | cut -d= -f2)"; PORT="${PORT:-3100}"
PASSWORD="$(grep -E '^APP_PASSWORD=' .env | cut -d= -f2)"

if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow "$PORT/tcp" >/dev/null
fi

# ---------- Запуск ----------
say "Собираю и запускаю контейнер (первый раз — пару минут)"
docker compose up -d --build --remove-orphans
docker image prune -f >/dev/null 2>&1 || true

ok=""
for _ in $(seq 1 30); do
  if docker compose exec -T otpravki wget -qO- http://127.0.0.1:3000/api/me >/dev/null 2>&1; then ok=1; break; fi
  sleep 2
done
[ -n "$ok" ] || { docker compose logs --tail 40 otpravki; die "Сервис не запустился, логи выше"; }

# ---------- Автообновление ----------
chmod +x deploy/update.sh
cat > /etc/cron.d/otpravki <<CRON
# Подтягивает новые версии «Отправок» из GitHub каждые 5 минут
*/5 * * * * root BRANCH=$BRANCH $APP_DIR/deploy/update.sh >> /var/log/otpravki-update.log 2>&1
CRON
chmod 644 /etc/cron.d/otpravki

IP="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
printf '\n\033[1;32m✔ Готово!\033[0m\n\n'
printf '  Адрес:   http://%s:%s\n' "$IP" "$PORT"
printf '  Пароль:  %s\n\n' "$PASSWORD"
printf '  Обновления из GitHub подтягиваются сами каждые 5 минут.\n'
printf '  Пароль и настройки: %s/.env  ·  база: %s/data\n\n' "$APP_DIR" "$APP_DIR"
