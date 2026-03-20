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
app.use('/api/daily',      dailyRoutes);
app.use('/api/finmodels',  finmodelRoutes);

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
