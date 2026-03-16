const express = require('express');
const bcrypt  = require('bcrypt');
const db      = require('../services/db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const SALT_ROUNDS = 10;

// GET /api/users — список всех пользователей (только admin)
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

// POST /api/users — создать пользователя (только admin)
router.post('/', authenticate, requireAdmin, async (req, res) => {
  const { username, password, role, manager_name } = req.body;

  if (!username || !password || !role) {
    return res.status(400).json({ error: 'Заполните все обязательные поля' });
  }
  if (!['admin', 'manager'].includes(role)) {
    return res.status(400).json({ error: 'Неверная роль' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
  }

  try {
    // Проверяем уникальность логина
    const exists = await db.query('SELECT id FROM users WHERE username = $1', [username]);
    if (exists.rows[0]) {
      return res.status(409).json({ error: 'Пользователь с таким логином уже существует' });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);

    const userResult = await db.query(
      `INSERT INTO users (username, password_hash, role)
       VALUES ($1, $2, $3) RETURNING id, username, role, is_active, created_at`,
      [username, hash, role]
    );
    const newUser = userResult.rows[0];

    // Если менеджер — создаём запись в managers
    let manager = null;
    if (role === 'manager') {
      const name = manager_name || username;
      const mgrResult = await db.query(
        `INSERT INTO managers (name, user_id) VALUES ($1, $2)
         RETURNING id, name`,
        [name, newUser.id]
      );
      manager = mgrResult.rows[0];
    }

    // Лог
    await db.query(
      'INSERT INTO logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'create_user', `Создан пользователь ${username} (${role})`]
    );

    res.status(201).json({ ...newUser, manager });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/users/:id — редактировать пользователя (только admin)
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { password, role, is_active, manager_name } = req.body;

  try {
    const userRes = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    if (!userRes.rows[0]) return res.status(404).json({ error: 'Пользователь не найден' });

    const updates = [];
    const values  = [];
    let idx = 1;

    if (password) {
      const hash = await bcrypt.hash(password, SALT_ROUNDS);
      updates.push(`password_hash = $${idx++}`); values.push(hash);
    }
    if (role && ['admin', 'manager'].includes(role)) {
      updates.push(`role = $${idx++}`); values.push(role);
    }
    if (typeof is_active === 'boolean') {
      updates.push(`is_active = $${idx++}`); values.push(is_active);
    }

    if (updates.length > 0) {
      values.push(id);
      await db.query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`,
        values
      );
    }

    // Обновить имя менеджера если передано
    if (manager_name) {
      await db.query(
        'UPDATE managers SET name = $1 WHERE user_id = $2',
        [manager_name, id]
      );
    }

    await db.query(
      'INSERT INTO logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'edit_user', `Изменён пользователь ID ${id}`]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE /api/users/:id — удалить пользователя (только admin)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;

  // Нельзя удалить самого себя
  if (id === req.user.id) {
    return res.status(400).json({ error: 'Нельзя удалить собственный аккаунт' });
  }

  try {
    const result = await db.query(
      'DELETE FROM users WHERE id = $1 RETURNING username',
      [id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Пользователь не найден' });

    await db.query(
      'INSERT INTO logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'delete_user', `Удалён пользователь ${result.rows[0].username}`]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
