const express = require('express');
const multer  = require('multer');
const XLSX    = require('xlsx');
const db      = require('../services/db');
const gsheets = require('../services/gsheets');
const { parseSheet, totalQty } = require('../services/shipment_parser');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const STATUSES = ['draft', 'sent', 'accepted'];

// Приводим присланную структуру к ожидаемому виду
function normalizeBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];
  const str = v => String(v ?? '').trim();
  return blocks.map(b => ({
    brand: str(b.brand),
    owner: str(b.owner),
    date:  /^\d{4}-\d{2}-\d{2}/.test(str(b.date)) ? str(b.date).slice(0, 10) : null,
    groups: (Array.isArray(b.groups) ? b.groups : []).map(g => {
      const sizes = [...new Set((Array.isArray(g.sizes) ? g.sizes : []).map(str).filter(Boolean))];
      return {
        model: str(g.model),
        kind:  g.kind === 'return' ? 'return' : 'ship',
        sizes,
        items: (Array.isArray(g.items) ? g.items : []).map(it => {
          const qty = {};
          for (const s of sizes) {
            const q = Math.round(Number(it.qty?.[s]));
            if (q > 0) qty[s] = q;
          }
          return { color: str(it.color), article: str(it.article), qty };
        }).filter(it => it.color || it.article || Object.keys(it.qty).length),
      };
    }).filter(g => g.items.length || g.model),
  })).filter(b => b.brand || b.groups.length);
}

function shipmentFields(body) {
  const blocks = normalizeBlocks(body.blocks);
  return {
    title:       String(body.title || '').trim() || 'Отправка',
    ship_date:   /^\d{4}-\d{2}-\d{2}/.test(body.ship_date || '') ? body.ship_date.slice(0, 10) : null,
    fulfillment: String(body.fulfillment || '').trim(),
    status:      STATUSES.includes(body.status) ? body.status : 'sent',
    comment:     String(body.comment || '').trim(),
    blocks,
    total_qty:   totalQty(blocks, 'ship'),
    return_qty:  totalQty(blocks, 'return'),
  };
}

// pg отдаёт DATE как Date в локальной зоне — возвращаем 'YYYY-MM-DD'
function fix(row) {
  if (!row) return row;
  const d = row.ship_date;
  if (d instanceof Date) {
    row.ship_date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return row;
}

// Синхронизация с Google; ошибка не мешает сохранению — пишется в sync_error
async function syncRow(row) {
  fix(row);
  if (!gsheets.isConfigured()) return row;
  try {
    const { gid, title } = await gsheets.syncShipment(row);
    const r = await db.query(
      `UPDATE shipments SET sheet_gid = $2, sheet_title = $3, synced_at = NOW(), sync_error = NULL
       WHERE id = $1 RETURNING *`, [row.id, gid, title]);
    return fix(r.rows[0]);
  } catch (err) {
    console.error('Google sync failed:', err.message);
    const r = await db.query(`UPDATE shipments SET sync_error = $2 WHERE id = $1 RETURNING *`, [row.id, err.message]);
    return fix(r.rows[0]);
  }
}

// GET /api/shipments — список отправок
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT s.*, u.username AS created_by_name
       FROM shipments s LEFT JOIN users u ON u.id = s.created_by
       ORDER BY s.ship_date DESC NULLS LAST, s.created_at DESC`
    );
    res.json(result.rows.map(fix));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/shipments/google/status — подключена ли Google Таблица
router.get('/google/status', authenticate, (req, res) => {
  res.json(gsheets.status());
});

// POST /api/shipments/google/sync-all — перезаписать все листы
router.post('/google/sync-all', authenticate, requireAdmin, async (req, res) => {
  if (!gsheets.isConfigured()) return res.status(400).json({ error: 'Google Таблица не подключена' });
  try {
    const rows = (await db.query(`SELECT * FROM shipments ORDER BY ship_date ASC NULLS FIRST, created_at ASC`)).rows;
    let ok = 0; const errors = [];
    for (const row of rows) {
      const r = await syncRow(row);
      if (r.sync_error) errors.push(`${r.title}: ${r.sync_error}`); else ok++;
    }
    res.json({ ok, errors });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/shipments/google/import — подтянуть листы из Google Таблицы,
// которые ещё не связаны с отправками в сервисе (лист остаётся привязанным)
router.post('/google/import', authenticate, requireAdmin, async (req, res) => {
  if (!gsheets.isConfigured()) return res.status(400).json({ error: 'Google Таблица не подключена' });
  try {
    const tabs = await gsheets.readAllTabs();
    const linked = new Set((await db.query(`SELECT sheet_gid FROM shipments WHERE sheet_gid IS NOT NULL`)).rows.map(r => r.sheet_gid));
    const created = []; const skipped = [];
    for (const tab of tabs) {
      if (linked.has(tab.gid)) continue;
      const parsed = parseSheet(tab.rows, tab.title);
      if (!parsed.blocks.length) { skipped.push(tab.title); continue; }
      const f = shipmentFields(parsed);
      const r = await db.query(
        `INSERT INTO shipments (title, ship_date, fulfillment, status, comment, blocks, total_qty, return_qty,
                                sheet_gid, sheet_title, synced_at, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),$11) RETURNING id, title`,
        [f.title, f.ship_date, f.fulfillment, f.status, f.comment, JSON.stringify(f.blocks), f.total_qty, f.return_qty,
         tab.gid, tab.title, req.user.id]
      );
      created.push({ ...r.rows[0], warnings: parsed.warnings });
    }
    res.json({ created, skipped });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Ошибка сервера' });
  }
});

// POST /api/shipments/parse — разобрать Excel бухгалтера (без сохранения)
router.post('/parse', authenticate, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheets = wb.SheetNames.map(name => {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
      const parsed = parseSheet(rows, name);
      return { ...parsed, total_qty: totalQty(parsed.blocks, 'ship'), return_qty: totalQty(parsed.blocks, 'return') };
    }).filter(s => s.blocks.length);
    if (!sheets.length) return res.status(400).json({ error: 'Не удалось найти отправки в файле' });
    res.json(sheets);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Не удалось прочитать файл: ' + err.message });
  }
});

// GET /api/shipments/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const r = await db.query(`SELECT * FROM shipments WHERE id = $1`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Отправка не найдена' });
    res.json(fix(r.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/shipments — создать (и сразу выгрузить в Google)
router.post('/', authenticate, async (req, res) => {
  const f = shipmentFields(req.body);
  try {
    const r = await db.query(
      `INSERT INTO shipments (title, ship_date, fulfillment, status, comment, blocks, total_qty, return_qty, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [f.title, f.ship_date, f.fulfillment, f.status, f.comment, JSON.stringify(f.blocks), f.total_qty, f.return_qty, req.user.id]
    );
    res.status(201).json(await syncRow(r.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/shipments/:id — изменить (и обновить лист в Google)
router.put('/:id', authenticate, async (req, res) => {
  const f = shipmentFields(req.body);
  try {
    const r = await db.query(
      `UPDATE shipments SET title=$2, ship_date=$3, fulfillment=$4, status=$5, comment=$6, blocks=$7,
              total_qty=$8, return_qty=$9, updated_at=NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id, f.title, f.ship_date, f.fulfillment, f.status, f.comment, JSON.stringify(f.blocks), f.total_qty, f.return_qty]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Отправка не найдена' });
    res.json(await syncRow(r.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/shipments/:id/sync — повторить выгрузку в Google
router.post('/:id/sync', authenticate, async (req, res) => {
  if (!gsheets.isConfigured()) return res.status(400).json({ error: 'Google Таблица не подключена' });
  try {
    const r = await db.query(`SELECT * FROM shipments WHERE id = $1`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Отправка не найдена' });
    res.json(await syncRow(r.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE /api/shipments/:id?sheet=1 — удалить (sheet=1 — удалить и лист в Google)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const r = await db.query(`DELETE FROM shipments WHERE id = $1 RETURNING sheet_gid`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Отправка не найдена' });
    let sheetDeleted = false;
    if (req.query.sheet === '1' && gsheets.isConfigured()) {
      try { sheetDeleted = await gsheets.deleteTab(r.rows[0].sheet_gid); }
      catch (e) { console.error('Google delete failed:', e.message); }
    }
    res.json({ success: true, sheetDeleted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
