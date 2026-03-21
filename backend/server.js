require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const db      = require('./services/db');

const authRoutes      = require('./routes/auth');
const userRoutes      = require('./routes/users');
const reportRoutes    = require('./routes/reports');
const managerRoutes   = require('./routes/managers');
const cabinetRoutes   = require('./routes/cabinets');
const dailyRoutes     = require('./routes/daily');
const finmodelRoutes  = require('./routes/finmodels');
const unitEconRoutes  = require('./routes/unit_economics');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth',       authRoutes);
app.use('/api/users',      userRoutes);
app.use('/api/reports',    reportRoutes);
app.use('/api/managers',   managerRoutes);
app.use('/api/cabinets',   cabinetRoutes);
app.use('/api/daily',          dailyRoutes);
app.use('/api/finmodels',      finmodelRoutes);
app.use('/api/unit-economics', unitEconRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

async function runMigrations() {
  const migrations = [
    // Таблица кабинетов (на случай если не создана)
    `CREATE TABLE IF NOT EXISTS cabinets (
      id         UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
      name       TEXT      NOT NULL,
      manager_id UUID      REFERENCES managers(id) ON DELETE CASCADE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
    // cabinet_id в reports
    `ALTER TABLE reports   ADD COLUMN IF NOT EXISTS cabinet_id UUID REFERENCES cabinets(id) ON DELETE SET NULL`,
    // cabinet_id в finmodels
    `ALTER TABLE finmodels ADD COLUMN IF NOT EXISTS cabinet_id UUID REFERENCES cabinets(id) ON DELETE SET NULL`,
    // Уникальный индекс finmodels по cabinet_id
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_finmodels_cabinet ON finmodels(cabinet_id) WHERE cabinet_id IS NOT NULL`,
    // Таблица юнит-экономики
    `CREATE TABLE IF NOT EXISTS unit_economics (
      id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
      manager_id       UUID          NOT NULL REFERENCES managers(id) ON DELETE CASCADE,
      name             TEXT          NOT NULL DEFAULT 'Новый товар',
      currency_rate    NUMERIC(12,4) NOT NULL DEFAULT 1,
      purchase_price   NUMERIC(12,2) NOT NULL DEFAULT 0,
      batch_qty        INTEGER       NOT NULL DEFAULT 1,
      length_cm        NUMERIC(8,2)  NOT NULL DEFAULT 0,
      width_cm         NUMERIC(8,2)  NOT NULL DEFAULT 0,
      height_cm        NUMERIC(8,2)  NOT NULL DEFAULT 0,
      commission_pct   NUMERIC(6,3)  NOT NULL DEFAULT 0,
      price_before_spp NUMERIC(12,2) NOT NULL DEFAULT 0,
      buyout_pct       NUMERIC(6,2)  NOT NULL DEFAULT 100,
      ad_spend_pct     NUMERIC(6,3)  NOT NULL DEFAULT 0,
      loc_index        NUMERIC(10,5) NOT NULL DEFAULT 1,
      sales_dist_index NUMERIC(10,5) NOT NULL DEFAULT 0,
      tax_system       TEXT          NOT NULL DEFAULT 'Не считать налог',
      tax_rate         NUMERIC(6,3)  NOT NULL DEFAULT 0,
      spp              NUMERIC(6,3),
      acceptance_cost  NUMERIC(12,2) NOT NULL DEFAULT 0,
      storage_cost     NUMERIC(12,2) NOT NULL DEFAULT 0,
      warehouse_coeff  NUMERIC(8,2)  NOT NULL DEFAULT 100,
      extra_expenses   NUMERIC(12,2) NOT NULL DEFAULT 0,
      created_at       TIMESTAMP     NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMP     NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_unit_econ_manager ON unit_economics(manager_id)`,
    // Новые колонки юнит-экономики
    `ALTER TABLE unit_economics ADD COLUMN IF NOT EXISTS wh_coeff_logistics NUMERIC(8,2) NOT NULL DEFAULT 100`,
    `ALTER TABLE unit_economics ADD COLUMN IF NOT EXISTS cabinet_id UUID REFERENCES cabinets(id) ON DELETE SET NULL`,
    `ALTER TABLE unit_economics ADD COLUMN IF NOT EXISTS return_cost NUMERIC(12,2) NOT NULL DEFAULT 0`,
    // Переход коэффициентов склада с множителя (1.0) на проценты (100):
    // Если значение ≤ 10 — это старый формат (множитель), умножаем на 100
    `UPDATE unit_economics SET warehouse_coeff   = warehouse_coeff   * 100 WHERE warehouse_coeff   <= 10`,
    `UPDATE unit_economics SET wh_coeff_logistics = wh_coeff_logistics * 100 WHERE wh_coeff_logistics <= 10`,
    // label_defs в финмоделях
    `ALTER TABLE finmodels ADD COLUMN IF NOT EXISTS label_defs JSONB NOT NULL DEFAULT '[]'`,
  ];
  for (const sql of migrations) {
    try { await db.query(sql); }
    catch(e) { console.error('Migration failed:', e.message); }
  }
  console.log('✅ Migrations complete');
}

runMigrations().then(() => {
  app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
});
