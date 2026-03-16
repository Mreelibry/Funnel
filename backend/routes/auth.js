const express  = require('express');
const bcrypt   = require('bcrypt');
const jwt      = require('jsonwebtoken');
const db       = require('../services/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Введите логин и пароль' });
  }

  try {
    const result = await db.query(
      'SELECT * FROM users WHERE username = $1 AND is_active = true',
      [username]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    // Получаем manager_id если это менеджер
    let managerId = null;
    if (user.role === 'manager') {
      const mgrResult = await db.query(
        'SELECT id FROM managers WHERE user_id = $1',
        [user.id]
      );
      if (mgrResult.rows[0]) managerId = mgrResult.rows[0].id;
    }

    const token = jwt.sign(
      {
        id:         user.id,
        username:   user.username,
        role:       user.role,
        manager_id: managerId
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Лог входа
    await db.query(
      'INSERT INTO logs (user_id, action, details) VALUES ($1, $2, $3)',
      [user.id, 'login', `Вход пользователя ${user.username}`]
    );

    res.json({
      token,
      user: {
        id:         user.id,
        username:   user.username,
        role:       user.role,
        manager_id: managerId
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/auth/me — текущий пользователь
router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, username, role, is_active, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
