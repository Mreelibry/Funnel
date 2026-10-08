# Деплой «Отправок» на свой сервер

Сервис живёт в `/opt/otpravki` в отдельном Docker-контейнере `otpravki` на порту **3100**.
Другие проекты на сервере (Funnel и т. д.) он не трогает.

## 1. Один раз на сервере

Нужны Docker и плагин compose (`docker compose version` должен работать).

```bash
sudo mkdir -p /opt/otpravki/data
sudo chown -R $USER /opt/otpravki
cd /opt/otpravki
nano .env
```

Содержимое `.env`:

```env
APP_PASSWORD=придумайте-пароль
SESSION_SECRET=длинная-случайная-строка   # openssl rand -hex 32
SPREADSHEET_ID=1daZLTn20ExCasdwpCW9bgayToJT1DUwolHC2r80b8II
# OTPRAVKI_PORT=3100        # если 3100 занят
# OTPRAVKI_BIND=127.0.0.1   # когда настроите nginx и домен
```

Ключ Google (если уже есть) положить рядом как `/opt/otpravki/service-account.json`.
Без него сервис работает, просто без синхронизации с таблицей — можно добавить позже и перезапустить:
`cd /opt/otpravki && docker compose restart`.

Если порт 3100 закрыт файрволом: `sudo ufw allow 3100/tcp`.

## 2. Ключ для деплоя из GitHub

На своём компьютере:

```bash
ssh-keygen -t ed25519 -f otpravki_deploy -N "" -C otpravki-deploy
ssh-copy-id -i otpravki_deploy.pub ПОЛЬЗОВАТЕЛЬ@IP_СЕРВЕРА
```

Пользователь должен иметь право запускать `docker` (состоять в группе `docker`).

## 3. Секреты в GitHub

Репозиторий → **Settings → Secrets and variables → Actions → New repository secret**:

| Секрет               | Значение                                   |
|----------------------|--------------------------------------------|
| `OTPRAVKI_SSH_HOST`  | IP или домен сервера                       |
| `OTPRAVKI_SSH_USER`  | пользователь                               |
| `OTPRAVKI_SSH_KEY`   | содержимое файла `otpravki_deploy` (приватный ключ целиком) |
| `OTPRAVKI_SSH_PORT`  | порт SSH, если не 22 (можно не создавать) |

## 4. Запуск

**Actions → Deploy «Отправки» → Run workflow** (ветка `claude/wonderful-shannon-l6ye11`).
Дальше деплой идёт сам при каждом пуше в эту ветку.

Открыть: `http://IP_СЕРВЕРА:3100`.

## 5. Домен и HTTPS (по желанию)

1. DNS: A-запись поддомена → IP сервера.
2. `deploy/nginx-otpravki.conf` → `/etc/nginx/sites-available/otpravki`, поправить `server_name`,
   `sudo ln -s /etc/nginx/sites-available/otpravki /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx`.
3. `sudo certbot --nginx -d ваш.поддомен`.
4. В `.env` добавить `OTPRAVKI_BIND=127.0.0.1`, затем `docker compose up -d` — порт 3100 перестанет торчать наружу.

## Полезное

```bash
cd /opt/otpravki
docker compose logs -f            # логи
docker compose restart            # перезапуск
cp data/otpravki.db ~/backup-$(date +%F).db   # бэкап базы
```
