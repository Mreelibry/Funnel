const express = require('express');
const db      = require('../services/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/daily — список ежедневных отчётов
router.get('/', authenticate, async (req, res) => {
  try {
    const { manager_id, date_from, date_to, limit = 30 } = req.query;
    const conditions = [];
    const values     = [];
    let   idx = 1;

    if (req.user.role !== 'admin') {
      conditions.push(`d.manager_id = $${idx++}`);
      values.push(req.user.manager_id);
    } else if (manager_id) {
      conditions.push(`d.manager_id = $${idx++}`);
      values.push(manager_id);
    }

    if (date_from) { conditions.push(`d.report_date >= $${idx++}`); values.push(date_from); }
    if (date_to)   { conditions.push(`d.report_date <= $${idx++}`); values.push(date_to);   }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    values.push(parseInt(limit));

    const result = await db.query(
      `SELECT d.*, m.name as manager_name
       FROM daily_reports d
       JOIN managers m ON m.id = d.manager_id
       ${where}
       ORDER BY d.report_date DESC, d.created_at DESC
       LIMIT $${idx}`,
      values
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/daily — создать отчёт
router.post('/', authenticate, async (req, res) => {
  const { tasks, notes, report_date, manager_id } = req.body;

  const mgrId = req.user.role === 'admin'
    ? (manager_id || req.user.manager_id)
    : req.user.manager_id;

  if (!mgrId) return res.status(400).json({ error: 'Нет привязки к менеджеру' });

  try {
    const result = await db.query(
      `INSERT INTO daily_reports (manager_id, report_date, tasks, notes)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        mgrId,
        report_date || new Date().toISOString().slice(0, 10),
        JSON.stringify(tasks || []),
        notes || ''
      ]
    );

    await db.query(
      'INSERT INTO logs (user_id, action, details) VALUES ($1,$2,$3)',
      [req.user.id, 'create_daily', `Ежедневный отчёт за ${report_date || 'сегодня'}`]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/daily/:id
router.put('/:id', authenticate, async (req, res) => {
  const { tasks, notes } = req.body;
  try {
    const result = await db.query(
      `UPDATE daily_reports SET tasks = $1, notes = $2, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [JSON.stringify(tasks || []), notes || '', req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE /api/daily/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    await db.query('DELETE FROM daily_reports WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
