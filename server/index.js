'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const db = require('./db');
const sheets = require('./sheets');
const { normalizeShipment, shipmentTotals } = require('./model');

const PORT = Number(process.env.PORT) || 3000;
const APP_PASSWORD = process.env.APP_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const COOKIE = 'otpravki_session';
const SESSION_TOKEN = crypto.createHmac('sha256', SESSION_SECRET).update(APP_PASSWORD).digest('hex');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

// ---------- авторизация: один общий пароль из APP_PASSWORD ----------

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return '';
}

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const isAuthed = (req) => !APP_PASSWORD || safeEqual(readCookie(req, COOKIE), SESSION_TOKEN);

app.post('/api/login', (req, res) => {
  if (!APP_PASSWORD) return res.json({ ok: true });
  if (!safeEqual((req.body && req.body.password) || '', APP_PASSWORD)) {
    return res.status(401).json({ error: 'Неверный пароль' });
  }
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${SESSION_TOKEN}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 30}${secure}`
  );
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  res.json({ authed: isAuthed(req), passwordRequired: Boolean(APP_PASSWORD) });
});

app.use('/api', (req, res, next) => (isAuthed(req) ? next() : res.status(401).json({ error: 'Нужно войти' })));

// ---------- отправки ----------

const summary = (s) => ({
  id: s.id,
  title: s.title,
  date: s.date,
  fulfillment: s.fulfillment,
  status: s.status,
  comment: s.comment,
  brands: s.brands.map((b) => ({ name: b.name, owner: b.owner, models: b.models.map((m) => m.name) })),
  totals: shipmentTotals(s),
  syncedAt: s.syncedAt,
  syncError: s.syncError,
  updatedAt: s.updatedAt,
});

const withTotals = (s) => s && { ...s, totals: shipmentTotals(s) };

async function sync(id) {
  if (!sheets.enabled()) return db.get(id);
  const s = db.get(id);
  try {
    const sheetId = await sheets.syncShipment(s);
    db.markSynced(id, sheetId);
  } catch (e) {
    console.error(`Синхронизация отправки #${id}:`, e.message);
    db.markSyncError(id, e.message);
  }
  return db.get(id);
}

const route = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((e) => res.status(400).json({ error: e.message }));

const idParam = (req) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Некорректный id');
  return id;
};

app.get('/api/config', (req, res) => res.json({ sheets: sheets.status() }));

app.get('/api/shipments', (req, res) => res.json(db.list().map(summary)));

app.get('/api/shipments/:id', route((req, res) => {
  const s = db.get(idParam(req));
  if (!s) return res.status(404).json({ error: 'Отправка не найдена' });
  res.json(withTotals(s));
}));

app.post('/api/shipments', route(async (req, res) => {
  const created = db.create(normalizeShipment(req.body));
  res.status(201).json(withTotals(await sync(created.id)));
}));

app.put('/api/shipments/:id', route(async (req, res) => {
  const id = idParam(req);
  if (!db.update(id, normalizeShipment(req.body))) return res.status(404).json({ error: 'Отправка не найдена' });
  res.json(withTotals(await sync(id)));
}));

app.post('/api/shipments/:id/sync', route(async (req, res) => {
  const id = idParam(req);
  if (!db.get(id)) return res.status(404).json({ error: 'Отправка не найдена' });
  if (!sheets.enabled()) throw new Error('Google Sheets не настроен');
  res.json(withTotals(await sync(id)));
}));

app.delete('/api/shipments/:id', route(async (req, res) => {
  const id = idParam(req);
  const s = db.get(id);
  if (!s) return res.status(404).json({ error: 'Отправка не найдена' });
  db.remove(id);
  if (sheets.enabled() && s.sheetId != null) {
    await sheets.deleteSheet(s.sheetId).catch((e) => console.error('Удаление листа:', e.message));
  }
  res.json({ ok: true });
}));

// Подсказки для автодополнения — всё, что уже встречалось в отправках.
app.get('/api/suggestions', (req, res) => {
  const sets = { fulfillments: new Set(), brands: new Map(), models: new Set(), colors: new Map(), sizes: new Set() };
  for (const s of db.list()) {
    if (s.fulfillment) sets.fulfillments.add(s.fulfillment);
    for (const b of s.brands) {
      if (b.name && !sets.brands.has(b.name)) sets.brands.set(b.name, b.owner);
      for (const m of b.models) {
        if (m.name) sets.models.add(m.name);
        m.sizes.forEach((x) => sets.sizes.add(x));
        for (const c of m.colors) {
          // Артикул зависит от бренда и модели, поэтому ключ — тройка.
          if (c.name) sets.colors.set(`${b.name}|${m.name}|${c.name}`, c.article);
        }
      }
    }
  }
  res.json({
    fulfillments: [...sets.fulfillments],
    brands: [...sets.brands].map(([name, owner]) => ({ name, owner })),
    models: [...sets.models],
    sizes: [...sets.sizes],
    colors: [...sets.colors].map(([key, article]) => {
      const [brand, model, name] = key.split('|');
      return { brand, model, name, article };
    }),
  });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Не найдено' }));

// ---------- фронтенд ----------

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

app.listen(PORT, () => {
  const g = sheets.status();
  console.log(`Отправки: http://localhost:${PORT}`);
  console.log(g.enabled ? `Google Sheets: включено (${g.serviceEmail})` : 'Google Sheets: выключено (нет ключа или SPREADSHEET_ID)');
  if (!APP_PASSWORD) console.log('Внимание: APP_PASSWORD не задан — вход без пароля');
});
