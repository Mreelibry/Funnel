const express = require('express');
const multer  = require('multer');
const XLSX    = require('xlsx');
const db      = require('../services/db');
const { authenticate } = require('../middleware/auth');

const router  = express.Router();
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ── Парсинг Excel файла WB ──
function parseWBReport(buffer, filename) {
  const wb   = XLSX.read(buffer, { type: 'buffer' });
  const result = { summary: null, goods: [], period_start: null, period_end: null };

  // Период из листа "Общая информация"
  const infoSheet = wb.Sheets['Общая информация'];
  if (infoSheet) {
    const rows = XLSX.utils.sheet_to_json(infoSheet, { header: 1, defval: '' });
    for (const r of rows) {
      const s = String(r[1] || '');
      const m = s.match(/(\d{4}-\d{2}-\d{2})/g);
      if (m && m.length >= 2) {
        result.period_start = m[0];
        result.period_end   = m[1];
        break;
      }
    }
  }

  // Сводные данные из листа "Фильтры"
  const filtSheet = wb.Sheets['Фильтры'];
  if (filtSheet) {
    const rows = XLSX.utils.sheet_to_json(filtSheet, { header: 1, defval: '' });
    let hi = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].some(c => String(c).trim() === 'Показы')) { hi = i; break; }
    }
    if (hi >= 0) {
      const headers = rows[hi].map(c => String(c).trim());
      const data    = rows[hi + 1] || [];
      const obj = {};
      headers.forEach((k, i) => { if (k) obj[k.replace(/[\u20A0-\u20CF]/g, '₽')] = data[i]; });
      result.summary = obj;
    }
  }

  // Данные по товарам из листа "Товары"
  const goodsSheet = wb.Sheets['Товары'];
  if (goodsSheet) {
    const rows = XLSX.utils.sheet_to_json(goodsSheet, { header: 1, defval: '' });
    let hi = -1;
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][0]).includes('Артикул')) { hi = i; break; }
    }
    if (hi >= 0) {
      const headers = rows[hi].map(c => String(c).trim().replace(/[\u20A0-\u20CF]/g, '₽'));
      result.goods = rows.slice(hi + 1)
        .filter(r => r.some(c => String(c).trim()))
        .map(r => {
          const obj = {};
          headers.forEach((k, i) => { if (k) obj[k] = r[i]; });
          return obj;
        });
    }
  }

  return result;
}

// ── GET /api/reports ──
// Admin → все или по manager_id; Manager → только свои
router.get('/', authenticate, async (req, res) => {
  try {
    const { manager_id, date_from, date_to } = req.query;
    const conditions = [];
    const values     = [];
    let   idx = 1;

    if (req.user.role !== 'admin') {
      // Менеджер видит только свои отчёты
      conditions.push(`r.manager_id = $${idx++}`);
      values.push(req.user.manager_id);
    } else if (manager_id) {
      conditions.push(`r.manager_id = $${idx++}`);
      values.push(manager_id);
    }

    if (date_from) { conditions.push(`r.period_start >= $${idx++}`); values.push(date_from); }
    if (date_to)   { conditions.push(`r.period_end   <= $${idx++}`); values.push(date_to);   }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const result = await db.query(
      `SELECT r.id, r.manager_id, m.name as manager_name,
              r.period_start, r.period_end, r.filename,
              r.impressions, r.clicks, r.ctr, r.added_to_cart,
              r.ordered_qty, r.bought_qty, r.cancelled_qty,
              r.conv_to_cart, r.conv_to_order, r.buyout_rate,
              r.revenue, r.avg_price, r.created_at,
              r.raw_data, r.cabinet_id, c.name as cabinet_name
       FROM reports r
       JOIN managers m ON m.id = r.manager_id
       LEFT JOIN cabinets c ON c.id = r.cabinet_id
       ${where}
       ORDER BY r.period_start DESC`,
      values
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── GET /api/reports/:id ── детальный отчёт с raw_data
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT r.*, m.name as manager_name
       FROM reports r JOIN managers m ON m.id = r.manager_id
       WHERE r.id = $1`,
      [req.params.id]
    );
    const report = result.rows[0];
    if (!report) return res.status(404).json({ error: 'Отчёт не найден' });

    // Менеджер не может смотреть чужие отчёты
    if (req.user.role !== 'admin' && report.manager_id !== req.user.manager_id) {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }

    res.json(report);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── POST /api/reports — загрузить Excel отчёт ──
router.post('/', authenticate, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Файл не загружен' });
  }

  // Определяем manager_id
  let managerId = req.body.manager_id;
  if (req.user.role !== 'admin') {
    // Менеджер может загружать только для себя
    managerId = req.user.manager_id;
  }
  if (!managerId) {
    return res.status(400).json({ error: 'Укажите менеджера' });
  }

  try {
    // Парсим файл
    const parsed = parseWBReport(req.file.buffer, req.file.originalname);
    const s = parsed.summary || {};

    const v = (key, fallback = 0) => parseFloat(s[key]) || fallback;

    // Декодируем имя файла
    let filename = req.file.originalname;
    try {
      const decoded = Buffer.from(filename, 'latin1').toString('utf8');
      if (/[а-яА-ЯёЁ]/.test(decoded)) filename = decoded;
    } catch(e) {}

    const cabinetId = req.body.cabinet_id || null;
    const vals = [
      managerId,
      parsed.period_start || new Date().toISOString().slice(0, 10),
      parsed.period_end   || new Date().toISOString().slice(0, 10),
      filename,
      v('Показы'), v('Переходы в карточку'), v('CTR, %'), v('Положили в корзину'),
      v('Заказали, шт'), v('Выкупили, шт'), v('Отменили, шт'),
      v('Конверсия в корзину, %'), v('Конверсия в заказ, %'), v('Процент выкупа'),
      v('Заказали на сумму, ₽'), v('Средняя цена, ₽'),
      JSON.stringify({ summary: s, goods: parsed.goods })
    ];
    if (cabinetId) vals.push(cabinetId);
    await db.query(
      cabinetId
        ? `INSERT INTO reports (manager_id,period_start,period_end,filename,impressions,clicks,ctr,added_to_cart,ordered_qty,bought_qty,cancelled_qty,conv_to_cart,conv_to_order,buyout_rate,revenue,avg_price,raw_data,cabinet_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`
        : `INSERT INTO reports (manager_id,period_start,period_end,filename,impressions,clicks,ctr,added_to_cart,ordered_qty,bought_qty,cancelled_qty,conv_to_cart,conv_to_order,buyout_rate,revenue,avg_price,raw_data) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      vals
    );
        res.status(201).json({ success: true, period_start: parsed.period_start, period_end: parsed.period_end });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при обработке файла' });
  }
});

// ── DELETE /api/reports/:id (только admin) ──
router.delete('/:id', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }
  try {
    await db.query('DELETE FROM reports WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
