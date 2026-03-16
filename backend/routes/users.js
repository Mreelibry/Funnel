const express = require('express');
const db      = require('../services/db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/users
router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.username, u.role, u.is_active, u.created_at,
              m.id as manager_id, m.name as manager_name
       FROM users u
       LEFT JOIN managers m ON m.user_id = u.id
       ORDER BY u.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/users
router.post('/', authenticate, requireAdmin, async (req, res) => {
  const { username, password, role, manager_name } = req.body;

  if (!username || !password || !role) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }
  if (!['admin', 'manager'].includes(role)) {
    return res.status(400).json({ error: 'Неверная роль' });
  }

  try {
    const exists = await db.query('SELECT id FROM users WHERE username = $1', [username]);
    if (exists.rows[0]) {
      return res.status(409).json({ error: 'Пользователь уже существует' });
    }

    // Пароль хранится как есть
    const userResult = await db.query(
      `INSERT INTO users (username, password_hash, role)
       VALUES ($1, $2, $3) RETURNING id, username, role, is_active, created_at`,
      [username, password, role]
    );
    const newUser = userResult.rows[0];

    let manager = null;
    if (role === 'manager') {
      const name = manager_name || username;
      const mgrResult = await db.query(
        `INSERT INTO managers (name, user_id) VALUES ($1, $2) RETURNING id, name`,
        [name, newUser.id]
      );
      manager = mgrResult.rows[0];
    }

    await db.query(
      'INSERT INTO logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'create_user', `Создан ${username} (${role})`]
    );

    res.status(201).json({ ...newUser, manager });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/users/:id
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { password, role, is_active, manager_name } = req.body;

  try {
    const updates = [], values = [];
    let idx = 1;

    if (password) { updates.push(`password_hash = $${idx++}`); values.push(password); }
    if (role && ['admin','manager'].includes(role)) { updates.push(`role = $${idx++}`); values.push(role); }
    if (typeof is_active === 'boolean') { updates.push(`is_active = $${idx++}`); values.push(is_active); }

    if (updates.length > 0) {
      values.push(id);
      await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`, values);
    }

    if (manager_name) {
      await db.query('UPDATE managers SET name = $1 WHERE user_id = $2', [manager_name, id]);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE /api/users/:id
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'Нельзя удалить себя' });
  }
  try {
    const result = await db.query('DELETE FROM users WHERE id = $1 RETURNING username', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Не найден' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
