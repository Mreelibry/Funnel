const express = require('express');
const db      = require('../services/db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/managers — список менеджеров
// Admin видит всех, менеджер — только себя
router.get('/', authenticate, async (req, res) => {
  try {
    let result;
    if (req.user.role === 'admin') {
      result = await db.query(
        `SELECT m.id, m.name, m.user_id, u.username, u.is_active
         FROM managers m
         LEFT JOIN users u ON u.id = m.user_id
         ORDER BY m.name`
      );
    } else {
      // Менеджер видит только себя
      result = await db.query(
        `SELECT m.id, m.name, m.user_id, u.username, u.is_active
         FROM managers m
         LEFT JOIN users u ON u.id = m.user_id
         WHERE m.user_id = $1`,
        [req.user.id]
      );
    }
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/managers — создать менеджера без привязки к user (только admin)
router.post('/', authenticate, requireAdmin, async (req, res) => {
  const { name, user_id } = req.body;
  if (!name) return res.status(400).json({ error: 'Имя менеджера обязательно' });

  try {
    const result = await db.query(
      'INSERT INTO managers (name, user_id) VALUES ($1, $2) RETURNING *',
      [name, user_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE /api/managers/:id (только admin)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM managers WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
