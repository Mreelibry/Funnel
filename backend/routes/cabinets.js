const express = require('express');
const db      = require('../services/db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/cabinets — список кабинетов
// Admin видит все, менеджер — только свои
router.get('/', authenticate, async (req, res) => {
  try {
    let result;
    if (req.user.role === 'admin') {
      const { manager_id } = req.query;
      if (manager_id) {
        result = await db.query(
          `SELECT c.*, m.name as manager_name
           FROM cabinets c JOIN managers m ON m.id = c.manager_id
           WHERE c.manager_id = $1 ORDER BY c.name`,
          [manager_id]
        );
      } else {
        result = await db.query(
          `SELECT c.*, m.name as manager_name
           FROM cabinets c JOIN managers m ON m.id = c.manager_id
           ORDER BY m.name, c.name`
        );
      }
    } else {
      // Менеджер видит свои кабинеты + те, к которым ему дали доступ
      result = await db.query(
        `SELECT DISTINCT c.*, m.name as manager_name
         FROM cabinets c JOIN managers m ON m.id = c.manager_id
         WHERE c.manager_id = $1
            OR EXISTS (
              SELECT 1 FROM cabinet_access ca
              WHERE ca.cabinet_id = c.id AND ca.manager_id = $1
            )
         ORDER BY c.name`,
        [req.user.manager_id]
      );
    }
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/cabinets — создать кабинет
router.post('/', authenticate, async (req, res) => {
  const { name, manager_id } = req.body;
  if (!name) return res.status(400).json({ error: 'Название кабинета обязательно' });

  // Менеджер может создавать только для себя
  const mgrId = req.user.role === 'admin' ? (manager_id || req.user.manager_id) : req.user.manager_id;
  if (!mgrId) return res.status(400).json({ error: 'Укажите менеджера' });

  try {
    const result = await db.query(
      'INSERT INTO cabinets (name, manager_id) VALUES ($1, $2) RETURNING *',
      [name, mgrId]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/cabinets/:id
router.put('/:id', authenticate, async (req, res) => {
  const { name } = req.body;
  try {
    await db.query('UPDATE cabinets SET name = $1 WHERE id = $2', [name, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE /api/cabinets/:id
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM cabinets WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/cabinets/:id/access — список менеджеров с доступом
router.get('/:id/access', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT m.id, m.name FROM cabinet_access ca
       JOIN managers m ON m.id = ca.manager_id
       WHERE ca.cabinet_id = $1 ORDER BY m.name`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/cabinets/:id/access — дать доступ менеджеру
router.post('/:id/access', authenticate, requireAdmin, async (req, res) => {
  const { manager_id } = req.body;
  if (!manager_id) return res.status(400).json({ error: 'Укажите менеджера' });
  try {
    await db.query(
      `INSERT INTO cabinet_access (cabinet_id, manager_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [req.params.id, manager_id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE /api/cabinets/:id/access/:manager_id — отозвать доступ
router.delete('/:id/access/:manager_id', authenticate, requireAdmin, async (req, res) => {
  try {
    await db.query(
      `DELETE FROM cabinet_access WHERE cabinet_id = $1 AND manager_id = $2`,
      [req.params.id, req.params.manager_id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
