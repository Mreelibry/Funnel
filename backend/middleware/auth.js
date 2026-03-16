const jwt = require('jsonwebtoken');

// Проверка JWT токена
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Токен не предоставлен' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Токен недействителен или истёк' });
  }
}

// Только для администраторов
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Доступ запрещён. Требуются права администратора.' });
  }
  next();
}

// Только для менеджеров или выше
function requireManager(req, res, next) {
  if (!req.user || !['admin', 'manager'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Доступ запрещён.' });
  }
  next();
}

module.exports = { authenticate, requireAdmin, requireManager };
