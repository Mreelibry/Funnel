const express = require('express');
const db      = require('../services/db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/finmodels
// Менеджер — своя модель; Админ — своя или по ?manager_id=X
router.get('/', authenticate, async (req, res) => {
  try {
    let mgrId;
    if (req.user.role === 'admin') {
      mgrId = req.query.manager_id || null;
      if (!mgrId) return res.json(null); // админ без выбранного менеджера
    } else {
      mgrId = req.user.manager_id;
      if (!mgrId) return res.json(null);
    }

    const result = await db.query(
      `SELECT f.*, m.name as manager_name
       FROM finmodels f
       JOIN managers m ON m.id = f.manager_id
       WHERE f.manager_id = $1`,
      [mgrId]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/finmodels/all — список всех финмоделей (только для админа)
router.get('/all', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT f.id, f.manager_id, f.name, f.months, f.start_date,
              f.updated_at, m.name as manager_name,
              jsonb_array_length(f.articles) as articles_count
       FROM finmodels f
       JOIN managers m ON m.id = f.manager_id
       ORDER BY m.name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/finmodels — upsert финмодели
// Менеджер сохраняет свою; Админ может сохранить чужую (передаёт manager_id в теле)
router.put('/', authenticate, async (req, res) => {
  const { name, months, start_date, articles, manager_id } = req.body;

  let mgrId;
  if (req.user.role === 'admin') {
    mgrId = manager_id || null;
    if (!mgrId) return res.status(400).json({ error: 'Укажите manager_id' });
  } else {
    mgrId = req.user.manager_id;
    if (!mgrId) return res.status(403).json({ error: 'Нет привязки к менеджеру' });
  }

  if (!Array.isArray(articles)) {
    return res.status(400).json({ error: 'articles должен быть массивом' });
  }

  try {
    const result = await db.query(
      `INSERT INTO finmodels (manager_id, name, months, start_date, articles)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (manager_id) DO UPDATE SET
         name       = EXCLUDED.name,
         months     = EXCLUDED.months,
         start_date = EXCLUDED.start_date,
         articles   = EXCLUDED.articles,
         updated_at = NOW()
       RETURNING *`,
      [
        mgrId,
        name || 'Финансовая модель',
        months || 1,
        start_date || null,
        JSON.stringify(articles)
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE /api/finmodels/:id — удалить (только для админа)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM finmodels WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
