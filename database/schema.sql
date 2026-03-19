-- ============================================
-- WB Funnel — Schema for Supabase PostgreSQL
-- Запустите этот файл в Supabase SQL Editor
-- ============================================

-- Расширение для UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ──────────────────────────────────────────
-- ТАБЛИЦА: users
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  username      TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  role          TEXT        NOT NULL CHECK (role IN ('admin', 'manager')),
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- ТАБЛИЦА: managers
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS managers (
  id         UUID   PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT   NOT NULL,
  user_id    UUID   REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- ТАБЛИЦА: reports
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id              UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
  manager_id      UUID      NOT NULL REFERENCES managers(id) ON DELETE CASCADE,
  cabinet_id      UUID      REFERENCES cabinets(id) ON DELETE SET NULL,
  period_start    DATE      NOT NULL,
  period_end      DATE      NOT NULL,
  filename        TEXT,
  -- Воронка продаж
  impressions     BIGINT    DEFAULT 0,
  clicks          BIGINT    DEFAULT 0,
  ctr             NUMERIC(6,2) DEFAULT 0,
  added_to_cart   BIGINT    DEFAULT 0,
  ordered_qty     BIGINT    DEFAULT 0,
  bought_qty      BIGINT    DEFAULT 0,
  cancelled_qty   BIGINT    DEFAULT 0,
  conv_to_cart    NUMERIC(6,2) DEFAULT 0,
  conv_to_order   NUMERIC(6,2) DEFAULT 0,
  buyout_rate     NUMERIC(6,2) DEFAULT 0,
  revenue         NUMERIC(15,2) DEFAULT 0,
  avg_price       NUMERIC(10,2) DEFAULT 0,
  -- Сырые данные (JSON для детальных данных по товарам)
  raw_data        JSONB,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- ТАБЛИЦА: logs
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS logs (
  id          UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID      REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT      NOT NULL,
  details     TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- ИНДЕКСЫ
-- ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_reports_manager   ON reports(manager_id);
CREATE INDEX IF NOT EXISTS idx_reports_period    ON reports(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_managers_user     ON managers(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_user         ON logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_created      ON logs(created_at DESC);

-- ──────────────────────────────────────────
-- ТАБЛИЦА: finmodels
-- Одна финансовая модель на менеджера (upsert по manager_id)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finmodels (
  id          UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
  manager_id  UUID      NOT NULL REFERENCES managers(id) ON DELETE CASCADE,
  name        TEXT      NOT NULL DEFAULT 'Финансовая модель',
  months      INTEGER   NOT NULL DEFAULT 1,
  start_date  DATE,
  articles    JSONB     NOT NULL DEFAULT '[]',
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_finmodels_manager ON finmodels(manager_id);
CREATE INDEX        IF NOT EXISTS idx_finmodels_updated ON finmodels(updated_at DESC);

-- Migrations for existing databases (safe to re-run with IF NOT EXISTS)
ALTER TABLE reports   ADD COLUMN IF NOT EXISTS cabinet_id UUID REFERENCES cabinets(id) ON DELETE SET NULL;
ALTER TABLE finmodels ADD COLUMN IF NOT EXISTS cabinet_id UUID REFERENCES cabinets(id) ON DELETE SET NULL;

-- ──────────────────────────────────────────
-- НАЧАЛЬНЫЕ ДАННЫЕ: Admin пользователь
-- password = Admin123 (bcrypt hash)
-- ──────────────────────────────────────────
INSERT INTO users (username, password_hash, role) VALUES (
  'Admin',
  '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.',
  'admin'
) ON CONFLICT (username) DO NOTHING;
