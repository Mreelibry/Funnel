// ── Общий API клиент для всех страниц ──

const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api'
  : '/api';

function getToken()    { return localStorage.getItem('wb_token'); }
function getUser()     { return JSON.parse(localStorage.getItem('wb_user') || 'null'); }
function isAdmin()     { return getUser()?.role === 'admin'; }
function isLoggedIn()  { return !!getToken(); }

function logout() {
  localStorage.removeItem('wb_token');
  localStorage.removeItem('wb_user');
  window.location.href = 'login.html';
}

// Защита страницы — вызывайте в начале каждой страницы
function requireAuth(adminOnly = false) {
  if (!isLoggedIn()) { window.location.href = 'login.html'; return false; }
  if (adminOnly && !isAdmin()) { window.location.href = 'dashboard.html'; return false; }
  return true;
}

// Базовый fetch с авторизацией
async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.body && !(options.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {})
    },
    body: options.body instanceof FormData
      ? options.body
      : options.body ? JSON.stringify(options.body) : undefined
  });

  if (res.status === 401 || res.status === 403) {
    logout(); return;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// Удобные методы
const API = {
  get:    (path)         => apiFetch(path),
  post:   (path, body)   => apiFetch(path, { method: 'POST',   body }),
  put:    (path, body)   => apiFetch(path, { method: 'PUT',    body }),
  delete: (path)         => apiFetch(path, { method: 'DELETE' }),
  upload: (path, formData) => apiFetch(path, { method: 'POST', body: formData }),
};
