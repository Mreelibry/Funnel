# WB Funnel Analytics — Руководство по деплою

## Архитектура

```
GitHub (код)
    ├── /frontend  → GitHub Pages (бесплатно)
    └── /backend   → Railway (бесплатно)
                         ↓
                    Supabase PostgreSQL (бесплатно)
```

---

## ШАГ 1 — Supabase (база данных)

### 1.1 Регистрация
1. Перейдите на **https://supabase.com**
2. Нажмите **Start your project** → войдите через GitHub
3. Нажмите **New project**
4. Заполните:
   - Name: `wb-funnel`
   - Database Password: придумайте надёжный пароль, **сохраните его**
   - Region: выберите **Central EU (Frankfurt)**
5. Нажмите **Create new project** → ждите 1-2 минуты

### 1.2 Создание таблиц
1. В левом меню нажмите **SQL Editor**
2. Нажмите **New query**
3. Скопируйте содержимое файла `database/schema.sql` и вставьте в редактор
4. Нажмите **Run** (Ctrl+Enter)
5. Должно появиться: `Success. No rows returned`

### 1.3 Получить строку подключения
1. В левом меню: **Settings → Database**
2. Прокрутите до раздела **Connection string**
3. Выберите вкладку **URI**
4. Скопируйте строку вида:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxxxxxx.supabase.co:5432/postgres
   ```
5. Сохраните — понадобится в шаге 3

---

## ШАГ 2 — Залейте код на GitHub

### Структура репозитория должна быть:
```
Funnel/
├── backend/
│   ├── server.js
│   ├── package.json
│   ├── .env.example
│   ├── routes/
│   ├── middleware/
│   └── services/
├── frontend/
│   ├── login.html
│   ├── dashboard.html
│   ├── admin.html
│   ├── api.js
│   ├── app.js
│   └── styles.css
└── database/
    └── schema.sql
```

### Загрузка через GitHub web-интерфейс:
1. Перейдите в ваш репозиторий **github.com/Mreelibry/Funnel**
2. Нажмите **Add file → Upload files**
3. Перетащите все файлы из архива
4. Нажмите **Commit changes**

---

## ШАГ 3 — Railway (бэкенд)

### 3.1 Регистрация
1. Перейдите на **https://railway.app**
2. Нажмите **Login** → **Login with GitHub**
3. Подтвердите доступ к репозиториям

### 3.2 Создание проекта
1. Нажмите **New Project**
2. Выберите **Deploy from GitHub repo**
3. Найдите и выберите **Mreelibry/Funnel**
4. Railway спросит что деплоить — выберите папку **backend** или укажите Root Directory: `backend`

### 3.3 Настройка переменных окружения
1. В панели Railway кликните на ваш сервис
2. Перейдите на вкладку **Variables**
3. Нажмите **New Variable** и добавьте по одной:

| Переменная       | Значение |
|-----------------|---------|
| `DATABASE_URL`  | Строка из Supabase (шаг 1.3) |
| `JWT_SECRET`    | Любая длинная строка, например: `wb-funnel-super-secret-2024-xyz` |
| `FRONTEND_URL`  | `https://mreelibry.github.io` |
| `NODE_ENV`      | `production` |

4. Railway автоматически добавит `PORT` — не трогайте

### 3.4 Деплой
1. Перейдите на вкладку **Deployments**
2. Нажмите **Deploy** (или произойдёт автоматически)
3. Дождитесь статуса **Success** (2-3 минуты)
4. Скопируйте URL вашего сервиса вида:
   ```
   https://funnel-production-xxxx.up.railway.app
   ```

---

## ШАГ 4 — Обновить URL в коде фронтенда

### В файлах `api.js` замените строку:
```javascript
// БЫЛО:
: 'https://YOUR_RAILWAY_URL.railway.app/api';

// СТАЛО (вставьте ваш реальный URL):
: 'https://funnel-production-xxxx.up.railway.app/api';
```

То же самое в `login.html` (там есть аналогичная строка).

Обновите файлы в GitHub → Railway автоматически передеплоится.

---

## ШАГ 5 — GitHub Pages (фронтенд)

1. В репозитории → **Settings → Pages**
2. Source: `main` / folder: `/frontend`
   - Если нет опции `/frontend` — переместите файлы из папки `frontend` в корень
3. Нажмите **Save**
4. URL будет: **https://mreelibry.github.io/Funnel**

---

## ШАГ 6 — Проверка

### Откройте: https://mreelibry.github.io/Funnel/login.html

Войдите с данными:
- Логин: `Admin`
- Пароль: `Admin123`

**Первые шаги после входа:**
1. Перейдите в **Управление** → создайте менеджеров
2. Вернитесь на **Дашборд** → загрузите первый отчёт
3. Выберите менеджера из списка и смотрите аналитику

---

## Начальные данные

Пользователь admin создаётся автоматически при запуске schema.sql:
- Логин: `Admin`
- Пароль: `Admin123`
- ⚠️ **Смените пароль после первого входа!**

---

## Проблемы и решения

| Проблема | Решение |
|---------|---------|
| 404 на странице | Убедитесь что `index.html` / `login.html` в корне Pages |
| Ошибка CORS | Проверьте переменную `FRONTEND_URL` в Railway |
| Ошибка БД | Проверьте `DATABASE_URL` в Railway → должен быть без пробелов |
| Неверный пароль Admin | Запустите schema.sql снова в Supabase |
| Railway не видит backend | Проверьте что Root Directory = `backend` в настройках сервиса |
