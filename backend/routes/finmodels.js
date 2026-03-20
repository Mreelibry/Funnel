const express = require('express');
const db      = require('../services/db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/finmodels?cabinet_id=X  — финмодель по кабинету (основной режим)
// GET /api/finmodels?manager_id=X  — финмодель по менеджеру (legacy / admin)
router.get('/', authenticate, async (req, res) => {
  try {
    const { cabinet_id, manager_id } = req.query;

    if (cabinet_id) {
      // Загрузка по кабинету — доступно всем
      const result = await db.query(
        `SELECT f.*, m.name as manager_name
         FROM finmodels f
         JOIN managers m ON m.id = f.manager_id
         WHERE f.cabinet_id = $1`,
        [cabinet_id]
      );
      return res.json(result.rows[0] || null);
    }

    // Fallback: по менеджеру
    let mgrId;
    if (req.user.role === 'admin') {
      mgrId = manager_id || null;
      if (!mgrId) return res.json(null);
    } else {
      mgrId = req.user.manager_id;
      if (!mgrId) return res.json(null);
    }
    const result = await db.query(
      `SELECT f.*, m.name as manager_name
       FROM finmodels f
       JOIN managers m ON m.id = f.manager_id
       WHERE f.manager_id = $1
       ORDER BY f.updated_at DESC
       LIMIT 1`,
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
  const { name, months, start_date, articles, manager_id, cabinet_id } = req.body;

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

  if (!cabinet_id) {
    return res.status(400).json({ error: 'Укажите cabinet_id' });
  }

  try {
    const result = await db.query(
      `INSERT INTO finmodels (manager_id, cabinet_id, name, months, start_date, articles)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (cabinet_id) WHERE cabinet_id IS NOT NULL DO UPDATE SET
         manager_id = EXCLUDED.manager_id,
         name       = EXCLUDED.name,
         months     = EXCLUDED.months,
         start_date = EXCLUDED.start_date,
         articles   = EXCLUDED.articles,
         updated_at = NOW()
       RETURNING *`,
      [
        mgrId,
        cabinet_id,
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
