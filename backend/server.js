require('dotenv').config();
const express = require('express');
const cors    = require('cors');

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

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
