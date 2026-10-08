'use strict';

// ============================================================
//  Отправки — одностраничное приложение без сборки
// ============================================================

const $app = document.getElementById('app');
const $actions = document.getElementById('topbar-actions');

const STATUS = {
  draft: 'Черновик',
  sent: 'Отправлено',
  received: 'Принято ФФ',
};
const KIND = { shipment: 'Отгрузка', return: 'Возврат' };
const DEFAULT_SIZES = ['XS', 'S', 'M', 'L'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_NOM = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

const ICON = {
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
  sync: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/></svg>',
  sheet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 9v12"/></svg>',
  box: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M8 12l8-4 8 4v9l-8 4-8-4z"/><path d="M8 12l8 4 8-4M16 16v9"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg>',
  print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 9V3h12v6M6 18H4v-7h16v7h-2"/><rect x="6" y="14" width="12" height="7"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
};

// ---------- утилиты ----------

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const fmt = (n) => (n || 0).toLocaleString('ru-RU');
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const parseIso = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
};
const longDate = (iso) => {
  const { y, m, d } = parseIso(iso);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
const autoTitle = (date, ff) => {
  if (!date) return '';
  const { m, d } = parseIso(date);
  return `От ${d} ${MONTHS[m - 1]}${ff ? ` (${ff})` : ''}`;
};
const timeAgo = (sqlTime) => {
  if (!sqlTime) return '';
  const t = new Date(sqlTime.replace(' ', 'T') + 'Z');
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
  return t.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const colorTotal = (c) => Object.values(c.qty || {}).reduce((a, b) => a + (Number(b) || 0), 0);
const modelTotal = (m) => m.colors.reduce((a, c) => a + colorTotal(c), 0);
const totals = (s) => {
  let shipped = 0;
  let returned = 0;
  for (const b of s.brands) for (const m of b.models) {
    if (m.kind === 'return') returned += modelTotal(m);
    else shipped += modelTotal(m);
  }
  return { shipped, returned };
};

function toast(text, isError = false) {
  const el = document.createElement('div');
  el.className = `toast${isError ? ' err' : ''}`;
  el.textContent = text;
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), isError ? 6000 : 3000);
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login') {
    renderLogin();
    throw new Error(data.error || 'Нужно войти');
  }
  if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
  return data;
}

const state = { config: null, suggestions: null, list: null, filters: { q: '', ff: '', status: '' } };

// ---------- роутер ----------

let leaveGuard = null; // функция, возвращающая true, если есть несохранённые изменения

let currentHash = location.hash;
let restoringHash = false;

function route() {
  const hash = location.hash.replace(/^#/, '') || '/';
  currentHash = location.hash;
  state.activeEd = null;
  $app.oninput = $app.onclick = $app.onkeydown = $app.onpaste = null;
  window.scrollTo(0, 0);
  document.title = 'Отправки';
  const act = hash.match(/^\/s\/(\d+)\/act$/);
  if (act) return renderAct(Number(act[1]));
  const m = hash.match(/^\/s\/(\d+)(\/edit)?$/);
  if (hash === '/new') return renderEditor(null);
  if (hash.startsWith('/new?copy=')) return renderEditor(null, Number(hash.split('=')[1]));
  if (m && m[2]) return renderEditor(Number(m[1]));
  if (m) return renderDetail(Number(m[1]));
  return renderList();
}

window.addEventListener('hashchange', () => {
  if (restoringHash) {
    restoringHash = false;
    return;
  }
  if (leaveGuard && leaveGuard() && !confirm('Есть несохранённые изменения. Уйти без сохранения?')) {
    restoringHash = true;
    location.hash = currentHash;
    return;
  }
  leaveGuard = null;
  route();
});
window.addEventListener('beforeunload', (e) => {
  if (leaveGuard && leaveGuard()) e.preventDefault();
});

const go = (hash) => {
  if (location.hash === `#${hash}`) route();
  else location.hash = hash;
};

function setActions(html) {
  $actions.innerHTML = html;
}

function topActions() {
  const sheets = state.config && state.config.sheets;
  const sheetBtn = sheets && sheets.spreadsheetUrl
    ? `<a class="btn ghost hide-sm" href="${esc(sheets.spreadsheetUrl)}" target="_blank" rel="noopener" title="${sheets.enabled ? 'Таблица синхронизируется' : 'Синхронизация не настроена'}">${ICON.sheet}Google Таблица<span class="dot ${sheets.enabled ? 'ok' : 'off'}"></span></a>`
    : '';
  const logout = state.passwordRequired ? `<button class="btn ghost icon" id="logout" title="Выйти">${ICON.logout}</button>` : '';
  setActions(`${sheetBtn}<a class="btn primary" href="#/new">${ICON.plus}<span class="hide-sm">Новая отправка</span></a>${logout}`);
  const lo = document.getElementById('logout');
  if (lo) lo.onclick = async () => { await api('/logout', { method: 'POST' }); renderLogin(); };
}

const spinner = () => { $app.innerHTML = '<div class="spinner"></div>'; };

// ============================================================
//  Вход
// ============================================================

function renderLogin() {
  leaveGuard = null;
  setActions('');
  $app.innerHTML = `
    <form class="card login" id="login">
      <span class="logo-mark">${ICON.box}</span>
      <div><h1>Отправки</h1><div class="muted">Введите пароль, чтобы продолжить</div></div>
      <input class="input" type="password" name="password" placeholder="Пароль" autocomplete="current-password" autofocus>
      <div class="error" id="login-err"></div>
      <button class="btn primary" type="submit">Войти</button>
    </form>`;
  document.getElementById('login').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('/login', { method: 'POST', body: { password: e.target.password.value } });
      await boot();
    } catch (err) {
      document.getElementById('login-err').textContent = err.message;
    }
  };
}

// ============================================================
//  Список отправок
// ============================================================

async function renderList() {
  topActions();
  if (!state.list) spinner();
  try {
    state.list = await api('/shipments');
  } catch (e) {
    return;
  }
  drawList();
}

function drawList() {
  const list = state.list;
  const f = state.filters;

  if (!list.length) {
    $app.innerHTML = `
      <div class="card empty">
        <div class="ico">${ICON.box}</div>
        <h2>Отправок пока нет</h2>
        <p>Создайте первую отправку: укажите фулфилмент, бренды, модели и количество по размерам и цветам. Всё сразу продублируется в Google Таблицу.</p>
        <a class="btn primary" href="#/new">${ICON.plus}Новая отправка</a>
      </div>`;
    return;
  }

  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 86400e3).toISOString().slice(0, 10);
  const recent = list.filter((s) => s.date >= monthAgo);
  const sum = (arr, k) => arr.reduce((a, s) => a + s.totals[k], 0);
  const brandSet = new Set(list.flatMap((s) => s.brands.map((b) => b.name)));
  const ffs = [...new Set(list.map((s) => s.fulfillment).filter(Boolean))];

  const q = f.q.trim().toLowerCase();
  const filtered = list.filter((s) => {
    if (f.ff && s.fulfillment !== f.ff) return false;
    if (f.status && s.status !== f.status) return false;
    if (!q) return true;
    const hay = [s.title, s.fulfillment, s.comment, ...s.brands.flatMap((b) => [b.name, b.owner, ...b.models])].join(' ').toLowerCase();
    return hay.includes(q);
  });

  const groups = new Map();
  for (const s of filtered) {
    const key = s.date.slice(0, 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }

  const chip = (group, value, label) =>
    `<button class="chip${f[group] === value ? ' on' : ''}" data-filter="${group}" data-value="${esc(value)}">${esc(label)}</button>`;

  $app.innerHTML = `
    <div class="page-head">
      <div><h1>Отправки</h1><div class="sub">Поставки товаров на фулфилмент и возвраты</div></div>
    </div>
    <div class="stats">
      <div class="card stat"><div class="label">Отправок</div><div class="value">${fmt(list.length)}</div><div class="hint">${fmt(recent.length)} за 30 дней</div></div>
      <div class="card stat"><div class="label">Отгружено единиц</div><div class="value">${fmt(sum(list, 'shipped'))}</div><div class="hint">${fmt(sum(recent, 'shipped'))} за 30 дней</div></div>
      <div class="card stat"><div class="label">Возвратов</div><div class="value">${fmt(sum(list, 'returned'))}</div><div class="hint">${fmt(sum(recent, 'returned'))} за 30 дней</div></div>
      <div class="card stat"><div class="label">Брендов</div><div class="value">${fmt(brandSet.size)}</div><div class="hint">${fmt(ffs.length)} фулфилмент${ffs.length === 1 ? '' : 'а'}</div></div>
    </div>
    <div class="toolbar">
      <label class="search">${ICON.search}<input class="input" id="q" placeholder="Бренд, ИП, модель…" value="${esc(f.q)}"></label>
      <div class="chips">${chip('ff', '', 'Все ФФ')}${ffs.map((x) => chip('ff', x, x)).join('')}</div>
      <div class="spacer"></div>
      <div class="chips">${chip('status', '', 'Любой статус')}${Object.entries(STATUS).map(([k, v]) => chip('status', k, v)).join('')}</div>
    </div>
    <div id="groups">
      ${filtered.length ? [...groups].map(([key, items]) => {
        const [y, m] = key.split('-').map(Number);
        return `
          <div class="month"><h2>${MONTHS_NOM[m - 1]} ${y}</h2><span class="muted">${fmt(items.reduce((a, s) => a + s.totals.shipped, 0))} ед.</span></div>
          <div class="grid">${items.map(shipCard).join('')}</div>`;
      }).join('') : '<div class="card empty"><h2>Ничего не найдено</h2><p>Попробуйте изменить поиск или фильтры.</p></div>'}
    </div>`;

  const qi = document.getElementById('q');
  qi.oninput = () => {
    f.q = qi.value;
    const pos = qi.selectionStart;
    drawList();
    const n = document.getElementById('q');
    n.focus();
    n.setSelectionRange(pos, pos);
  };
  $app.querySelectorAll('[data-filter]').forEach((b) => {
    b.onclick = () => { f[b.dataset.filter] = b.dataset.value; drawList(); };
  });
}

function syncDot(s) {
  const enabled = state.config && state.config.sheets.enabled;
  if (!enabled) return '';
  if (s.syncError) return `<span class="dot err" title="${esc(s.syncError)}"></span>`;
  if (s.syncedAt) return `<span class="dot ok" title="В таблице · ${esc(timeAgo(s.syncedAt))}"></span>`;
  return '<span class="dot" title="Ещё не в таблице"></span>';
}

function shipCard(s) {
  const { m, d } = parseIso(s.date);
  const brands = s.brands.map((b) => b.name).join(', ') || 'Без брендов';
  return `
    <a class="card ship-card" href="#/s/${s.id}">
      <div class="datebox"><b>${d}</b><small>${MONTHS_SHORT[m - 1]}</small></div>
      <div class="ship-body">
        <div class="ship-title">${esc(s.title)}</div>
        <div class="ship-brands">${esc(brands)}</div>
        <div class="ship-foot">
          ${s.fulfillment ? `<span class="badge ff">${esc(s.fulfillment)}</span>` : ''}
          <span class="badge ${s.status}">${STATUS[s.status]}</span>
          <span class="spacer"></span>
          ${s.totals.returned ? `<span class="badge return">↩ ${fmt(s.totals.returned)}</span>` : ''}
          <span class="units">${fmt(s.totals.shipped)} <small>ед.</small></span>
          ${syncDot(s)}
        </div>
      </div>
    </a>`;
}

// ============================================================
//  Просмотр отправки
// ============================================================

async function renderDetail(id) {
  topActions();
  spinner();
  let s;
  try {
    s = await api(`/shipments/${id}`);
  } catch (e) {
    $app.innerHTML = `<div class="card empty"><h2>${esc(e.message)}</h2><p><a class="btn" href="#/">К списку</a></p></div>`;
    return;
  }
  drawDetail(s);
}

function syncLine(s) {
  const sheets = state.config.sheets;
  if (!sheets.enabled) return '<span class="sync-line"><span class="dot off"></span>Google Таблица не подключена</span>';
  if (s.syncError) return `<span class="sync-line err"><span class="dot err"></span>Ошибка синхронизации: ${esc(s.syncError)}</span>`;
  if (s.syncedAt) return `<span class="sync-line"><span class="dot ok"></span>В таблице · ${esc(timeAgo(s.syncedAt))}</span>`;
  return '<span class="sync-line"><span class="dot"></span>Ещё не в таблице</span>';
}

function qtyTable(m) {
  const rowTotal = (size) => m.colors.reduce((a, c) => a + (c.qty[size] || 0), 0);
  return `
    <div class="table-wrap"><table class="qty">
      <thead><tr><th class="size">Размер</th>${m.colors.map((c) => `<th>${esc(c.name)}${c.article ? `<span class="art">Арт. ${esc(c.article)}</span>` : ''}</th>`).join('')}<th>Всего</th></tr></thead>
      <tbody>${m.sizes.map((size) => `
        <tr><td class="size">${esc(size)}</td>${m.colors.map((c) => (c.qty[size] ? `<td>${c.qty[size]}</td>` : '<td class="empty-cell">—</td>')).join('')}<td class="rowtotal">${fmt(rowTotal(size))}</td></tr>`).join('')}
      </tbody>
      <tfoot><tr><td class="size">Общ:</td>${m.colors.map((c) => `<td>${fmt(colorTotal(c))}</td>`).join('')}<td>${fmt(modelTotal(m))}</td></tr></tfoot>
    </table></div>`;
}

// Компактный вид для телефона: цвет → размеры чипами.
function colorList(m) {
  return `
    <div class="only-mobile color-list">
      ${m.colors.map((c) => `
        <div class="cl-row">
          <div class="cl-head"><b>${esc(c.name)}</b>${c.article ? `<span class="muted">Арт. ${esc(c.article)}</span>` : ''}<span class="spacer"></span><b>${fmt(colorTotal(c))}</b></div>
          <div class="cl-sizes" style="--n:${Math.min(m.sizes.length, 5)}">${m.sizes.map((size) => `<span class="cl-size${c.qty[size] ? '' : ' zero'}"><small>${esc(size)}</small>${c.qty[size] || '—'}</span>`).join('')}</div>
        </div>`).join('')}
    </div>`;
}

function drawDetail(s) {
  const t = totals(s);
  const sheets = state.config.sheets;
  $app.innerHTML = `
    <a class="back no-print" href="#/">${ICON.back}Все отправки</a>
    <div class="page-head">
      <div>
        <h1>${esc(s.title)}</h1>
        <div class="sub">
          <span>${longDate(s.date)}</span>
          ${s.fulfillment ? `<span class="badge ff">${esc(s.fulfillment)}</span>` : ''}
          <span class="badge ${s.status}">${STATUS[s.status]}</span>
          ${syncLine(s)}
        </div>
      </div>
      <div class="row no-print">
        ${sheets.enabled ? `<button class="btn" id="sync" title="Перезаписать лист в Google Таблице">${ICON.sync}<span class="hide-sm">Синхронизировать</span></button>` : ''}
        <button class="btn" onclick="window.print()" title="Печать">${ICON.print}</button>
        <a class="btn" href="#/s/${s.id}/act" title="Акт приёма-передачи для печати (A4)">${ICON.doc}<span class="hide-sm">Акт</span></a>
        <a class="btn" href="#/new?copy=${s.id}" title="Создать копию">${ICON.copy}<span class="hide-sm">Копия</span></a>
        <button class="btn danger" id="del" title="Удалить">${ICON.trash}</button>
        <a class="btn primary" href="#/s/${s.id}/edit">${ICON.edit}Редактировать</a>
      </div>
    </div>
    <div class="stats">
      <div class="card stat"><div class="label">Отгрузка</div><div class="value">${fmt(t.shipped)}</div><div class="hint">единиц</div></div>
      <div class="card stat"><div class="label">Возвраты</div><div class="value">${fmt(t.returned)}</div><div class="hint">единиц</div></div>
      <div class="card stat"><div class="label">Брендов</div><div class="value">${s.brands.length}</div><div class="hint">${s.brands.map((b) => esc(b.name)).join(', ') || '—'}</div></div>
      <div class="card stat"><div class="label">Моделей</div><div class="value">${s.brands.reduce((a, b) => a + b.models.length, 0)}</div><div class="hint">${s.brands.reduce((a, b) => a + b.models.reduce((x, m) => x + m.colors.length, 0), 0)} цветов</div></div>
    </div>
    ${s.comment ? `<div class="card comment-box">${esc(s.comment)}</div>` : ''}
    ${s.brands.length ? s.brands.map((b) => {
      const shipped = b.models.filter((m) => m.kind !== 'return').reduce((a, m) => a + modelTotal(m), 0);
      const returned = b.models.filter((m) => m.kind === 'return').reduce((a, m) => a + modelTotal(m), 0);
      return `
        <section class="card brand-card">
          <div class="brand-head">
            <div><h2>${esc(b.name)}</h2>${b.owner ? `<div class="owner">${esc(b.owner)}</div>` : ''}</div>
            <div class="brand-total"><span>Отгрузка: <b>${fmt(shipped)}</b></span>${returned ? `<span>Возвраты: <b>${fmt(returned)}</b></span>` : ''}</div>
          </div>
          <div class="brand-body">
            ${b.models.map((m) => `
              <div>
                <div class="model-head"><h3>${esc(m.name)}</h3><span class="badge ${m.kind}">${KIND[m.kind]}</span><span class="model-total">Общ. кол-во: <b>${fmt(modelTotal(m))} ед.</b></span></div>
                ${m.colors.length ? `<div class="only-desktop">${qtyTable(m)}</div>${colorList(m)}` : '<div class="muted">Цвета не добавлены</div>'}
              </div>`).join('') || '<div class="muted">Модели не добавлены</div>'}
          </div>
        </section>`;
    }).join('') : '<div class="card empty"><p>В отправке пока нет брендов.</p></div>'}
  `;

  const del = document.getElementById('del');
  del.onclick = async () => {
    const extra = sheets.enabled && s.sheetId != null ? '\nЛист в Google Таблице тоже будет удалён.' : '';
    if (!confirm(`Удалить «${s.title}»?${extra}`)) return;
    try {
      await api(`/shipments/${s.id}`, { method: 'DELETE' });
      state.list = null;
      toast('Отправка удалена');
      go('/');
    } catch (e) { toast(e.message, true); }
  };
  const sync = document.getElementById('sync');
  if (sync) sync.onclick = async () => {
    sync.disabled = true;
    try {
      const fresh = await api(`/shipments/${s.id}/sync`, { method: 'POST' });
      toast(fresh.syncError ? 'Не удалось синхронизировать' : 'Лист обновлён', Boolean(fresh.syncError));
      drawDetail(fresh);
    } catch (e) { toast(e.message, true); sync.disabled = false; }
  };
}

// ============================================================
//  Акт приёма-передачи (A4)
// ============================================================

// 520 → «пятьсот двадцать»
function numberWords(n) {
  if (!n) return 'ноль';
  const ones = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
  const onesF = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
  const teens = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
  const tens = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
  const hundreds = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];
  const triple = (x, fem) => {
    const out = [hundreds[Math.floor(x / 100)]];
    const r = x % 100;
    if (r >= 10 && r < 20) out.push(teens[r - 10]);
    else out.push(tens[Math.floor(r / 10)], (fem ? onesF : ones)[r % 10]);
    return out.filter(Boolean).join(' ');
  };
  const plural = (x, one, few, many) => {
    const r = x % 100;
    if (r >= 11 && r <= 14) return many;
    return [many, one, few, few, few, many, many, many, many, many][x % 10];
  };
  const th = Math.floor(n / 1000);
  const rest = n % 1000;
  const parts = [];
  if (th) parts.push(triple(th, true), plural(th, 'тысяча', 'тысячи', 'тысяч'));
  if (rest) parts.push(triple(rest, false));
  return parts.join(' ');
}

function actSizes(models) {
  const order = [];
  for (const m of models) for (const x of m.sizes) if (!order.includes(x)) order.push(x);
  return order;
}

function actTable(models, title) {
  if (!models.length) return '';
  const sizes = actSizes(models);
  let n = 0;
  let total = 0;
  const sizeTotals = Object.fromEntries(sizes.map((x) => [x, 0]));
  const rows = models.flatMap((m) => m.colors.map((c, ci) => {
    n += 1;
    const t = colorTotal(c);
    total += t;
    sizes.forEach((x) => { sizeTotals[x] += c.qty[x] || 0; });
    return `<tr>
      <td class="c">${n}</td>
      ${ci === 0 ? `<td rowspan="${m.colors.length}" class="model">${esc(m.name)}</td>` : ''}
      <td>${esc(c.name)}${c.article ? `<div class="art">Арт. ${esc(c.article)}</div>` : ''}</td>
      ${sizes.map((x) => `<td class="c">${m.sizes.includes(x) ? (c.qty[x] || '—') : ''}</td>`).join('')}
      <td class="c b">${t}</td>
    </tr>`;
  }));
  return `
    <h3 class="act-h3">${title}</h3>
    <table class="act-table">
      <thead><tr><th class="c" style="width:7mm">№</th><th>Модель</th><th>Цвет / артикул</th>${sizes.map((x) => `<th class="c sz">${esc(x)}</th>`).join('')}<th class="c" style="width:17mm">Всего, ед.</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
      <tfoot><tr><td colspan="3" class="r b">Итого:</td>${sizes.map((x) => `<td class="c b">${sizeTotals[x]}</td>`).join('')}<td class="c b">${total}</td></tr></tfoot>
    </table>`;
}

function actPage(s, b, index, count) {
  const shipped = b.models.filter((m) => m.kind !== 'return');
  const returned = b.models.filter((m) => m.kind === 'return');
  const sum = (ms) => ms.reduce((a, m) => a + modelTotal(m), 0);
  const tShipped = sum(shipped);
  const tReturned = sum(returned);
  const number = count > 1 ? `${s.id}/${index + 1}` : `${s.id}`;
  const receiver = s.fulfillment || '';
  const sign = (role, who) => `
    <div class="act-sign">
      <div class="role">${role}</div>
      <div class="who">${who ? esc(who) : '&nbsp;'}</div>
      <div class="lines"><span class="line"></span><span class="slash">/</span><span class="line wide"></span></div>
      <div class="hints"><span>подпись</span><span>Ф. И. О.</span></div>
      <div class="date">«____» ______________ 20___ г.</div>
    </div>`;
  return `
    <section class="act-page">
      <div class="act-top"><span>Акт № ${esc(number)}</span><span>${esc(longDate(s.date))} г.</span></div>
      <h1 class="act-title">Акт приёма-передачи товара</h1>
      <div class="act-sub">№ ${esc(number)} от ${esc(longDate(s.date))} г.</div>
      <table class="act-parties">
        <tr><td class="k">Отправитель:</td><td>${esc(b.owner || '—')}${b.name ? `, бренд «${esc(b.name)}»` : ''}</td></tr>
        <tr><td class="k">Получатель:</td><td>${receiver ? esc(receiver) : '<span class="blank"></span>'}</td></tr>
        ${s.comment ? `<tr><td class="k">Примечание:</td><td>${esc(s.comment)}</td></tr>` : ''}
      </table>
      <p class="act-text">Отправитель передал, а получатель принял следующий товар:</p>
      ${actTable(shipped, 'Передаваемый товар')}
      ${actTable(returned, 'Возврат товара')}
      <div class="act-total">
        ${shipped.length ? `<div>Всего передано: <b>${tShipped} (${numberWords(tShipped)}) ед.</b></div>` : ''}
        ${returned.length ? `<div>Всего возвращено: <b>${tReturned} (${numberWords(tReturned)}) ед.</b></div>` : ''}
      </div>
      <p class="act-text">Товар передан в указанном количестве. Стороны претензий по количеству и комплектности не имеют.</p>
      <div class="act-signs">
        ${sign('Отправил', b.owner)}
        ${sign('Принял', receiver)}
      </div>
    </section>`;
}

async function renderAct(id) {
  topActions();
  spinner();
  let s;
  try {
    s = await api(`/shipments/${id}`);
  } catch (e) {
    $app.innerHTML = `<div class="card empty"><h2>${esc(e.message)}</h2></div>`;
    return;
  }
  const brands = s.brands.filter((b) => b.models.some((m) => m.colors.length));
  let pick = 'all';
  const draw = () => {
    const list = pick === 'all' ? brands : [brands[Number(pick)]];
    document.title = `Акт ${s.title}${pick === 'all' ? '' : ` — ${list[0].owner || list[0].name}`}`;
    $app.innerHTML = `
      <div class="act-toolbar no-print">
        <a class="back" href="#/s/${s.id}">${ICON.back}К отправке</a>
        <div class="row">
          ${brands.length > 1 ? `<select class="input select" id="act-pick" style="width:auto">
            <option value="all">Все ИП (${brands.length} ${[2, 3, 4].includes(brands.length % 10) && ![12, 13, 14].includes(brands.length % 100) ? 'листа' : 'листов'})</option>
            ${brands.map((b, i) => `<option value="${i}" ${String(i) === pick ? 'selected' : ''}>${esc(b.owner || b.name)}</option>`).join('')}
          </select>` : ''}
          <button class="btn primary" id="act-print">${ICON.print}Печать / PDF</button>
        </div>
        <div class="muted act-hint">На телефоне: «Печать / PDF» → «Поделиться» → «Сохранить в Файлы». На компьютере в окне печати выберите «Сохранить как PDF».</div>
      </div>
      <div class="act-stage"><div class="act-scale">${list.length ? list.map((b) => actPage(s, b, brands.indexOf(b), brands.length)).join('') : '<div class="card empty"><p>В отправке нет товаров.</p></div>'}</div></div>`;
    fitAct();
    const sel = document.getElementById('act-pick');
    if (sel) sel.onchange = () => { pick = sel.value; draw(); };
    document.getElementById('act-print').onclick = () => window.print();
  };
  draw();
}

// На узком экране уменьшаем лист, чтобы он помещался целиком.
function fitAct() {
  const stage = $app.querySelector('.act-stage');
  const scale = $app.querySelector('.act-scale');
  const page = $app.querySelector('.act-page');
  if (!stage || !scale || !page) return;
  scale.style.zoom = '';
  const k = Math.min(1, stage.clientWidth / page.offsetWidth);
  if (k < 1) scale.style.zoom = String(k);
}
window.addEventListener('resize', () => { if (location.hash.endsWith('/act')) fitAct(); });

// ============================================================
//  Редактор
// ============================================================

const blankColor = () => ({ id: uid(), name: '', article: '', qty: {} });
const blankModel = (sizes = DEFAULT_SIZES) => ({ id: uid(), name: '', kind: 'shipment', sizes: [...sizes], colors: [blankColor()] });
const blankBrand = () => ({ id: uid(), name: '', owner: '', models: [blankModel()] });

async function renderEditor(id, copyFrom) {
  topActions();
  spinner();
  let s;
  try {
    const [loaded] = await Promise.all([
      id || copyFrom ? api(`/shipments/${id || copyFrom}`) : null,
      api('/suggestions').then((x) => { state.suggestions = x; }),
    ]);
    if (loaded) {
      s = structuredClone(loaded);
      if (copyFrom) {
        s = { ...s, title: '', date: todayIso(), status: 'draft' };
        delete s.id;
      }
    } else {
      s = { title: '', date: todayIso(), fulfillment: '', status: 'draft', comment: '', brands: [blankBrand()] };
    }
  } catch (e) {
    $app.innerHTML = `<div class="card empty"><h2>${esc(e.message)}</h2></div>`;
    return;
  }

  for (const b of s.brands) {
    const e = matchEntity(b.owner);
    if (!e) continue;
    b.owner = e.owner;
    if (e.brands.length === 1) b.name = e.brands[0];
  }

  // Заголовок считается «авто», пока его не трогали руками.
  const titleAuto = !s.title || s.title === autoTitle(s.date, s.fulfillment);
  if (titleAuto) s.title = autoTitle(s.date, s.fulfillment);
  const ed = { s, id, titleAuto, initial: JSON.stringify(s), saving: false, collapsed: new Set() };
  // На телефоне длинную отправку открываем свёрнутой — видно все модели сразу.
  const models = s.brands.flatMap((b) => b.models);
  if (MOBILE.matches && models.length > 1) models.forEach((m) => ed.collapsed.add(m.id));
  state.activeEd = ed;
  leaveGuard = () => !ed.saving && JSON.stringify(ed.s) !== ed.initial;
  drawEditor(ed);
}

function datalists() {
  const sg = state.suggestions || { fulfillments: [], brands: [], models: [], colors: [] };
  const uniq = (arr) => [...new Set(arr)];
  return `
    <datalist id="dl-ff">${sg.fulfillments.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
    <datalist id="dl-model">${sg.models.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
    <datalist id="dl-color">${uniq(sg.colors.map((x) => x.name)).map((x) => `<option value="${esc(x)}">`).join('')}</datalist>`;
}

const MOBILE = window.matchMedia('(max-width: 700px)');
MOBILE.addEventListener('change', () => { if (state.activeEd) drawEditor(state.activeEd); });

const attrs = (o) => Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ');

// Цвета, которые уже встречались у этой модели (артикул — от того же бренда), но ещё не добавлены.
function knownColors(b, m) {
  const sg = state.suggestions;
  if (!sg || !m.name.trim()) return [];
  const have = new Set(m.colors.map((c) => c.name.trim().toLowerCase()));
  const byName = new Map();
  for (const c of sg.colors) {
    if (c.model !== m.name || have.has(c.name.toLowerCase())) continue;
    const prev = byName.get(c.name);
    if (!prev || (c.brand === b.name && prev.brand !== b.name)) byName.set(c.name, c);
  }
  return [...byName.values()].slice(0, 16).map((c) => ({ name: c.name, article: c.brand === b.name ? c.article : '' }));
}

// Модели, которые этот бренд уже отправлял, но которых нет в текущей отправке.
function knownModels(b) {
  const sg = state.suggestions;
  if (!sg || !b.name.trim()) return [];
  const have = new Set(b.models.map((m) => m.name.trim().toLowerCase()));
  return sg.templates
    .map((t, ti) => ({ ...t, ti }))
    .filter((t) => t.brand === b.name && !have.has(t.model.toLowerCase()))
    .slice(0, 12);
}

function colorChips(b, m, bi, mi) {
  const list = knownColors(b, m);
  if (!list.length) return '';
  return `<div class="suggest"><span class="suggest-label">Быстро добавить цвет:</span>${list.map((c) => `<button type="button" class="chip sm" ${attrs({ act: 'add-known-color', bi, mi, name: c.name, article: c.article })}>+ ${esc(c.name)}</button>`).join('')}</div>`;
}

function modelChips(b, bi) {
  const list = knownModels(b);
  if (!list.length) return '';
  return `<div class="suggest"><span class="suggest-label">Уже отправляли:</span>${list.map((t) => `<button type="button" class="chip sm" ${attrs({ act: 'add-template', bi, ti: t.ti })}>+ ${esc(t.model)} <small>${t.colors.length} цв.</small></button>`).join('')}</div>`;
}

function edModel(ed, b, m, bi, mi) {
  const mob = ed.mobile;
  const collapsed = ed.collapsed.has(m.id);
  const ids = { bi, mi };
  const rowTotal = (size) => m.colors.reduce((a, c) => a + (Number(c.qty[size]) || 0), 0);
  const cell = (c, ci, size, si) =>
    `<input class="cell" type="text" inputmode="numeric" pattern="[0-9]*" enterkeyhint="next" autocomplete="off" placeholder="·" ${attrs({ f: 'qty', bi, mi, ci, si })} value="${c.qty[size] || ''}">`;

  const head = `
    <div class="ed-model-head">
      <button type="button" class="btn ghost icon collapse${collapsed ? ' is-collapsed' : ''}" ${attrs({ act: 'toggle', ...ids })} title="${collapsed ? 'Развернуть' : 'Свернуть'}">${ICON.chevron}</button>
      ${collapsed
        ? `<button type="button" class="model-summary" ${attrs({ act: 'toggle', ...ids })}><b>${esc(m.name || 'Без названия')}</b><span>${m.colors.length} цв. · ${esc(m.sizes.join(' '))}</span></button>`
        : `<input class="input model-name" list="dl-model" placeholder="${mob ? 'Название модели' : 'Модель, например «Вилка однотон»'}" autocomplete="off" ${attrs({ f: 'model.name', ...ids })} value="${esc(m.name)}">`}
      ${collapsed ? `<span class="badge ${m.kind}">${KIND[m.kind]}</span>` : `<div class="segmented kind">${Object.entries(KIND).map(([k, v]) => `<button type="button" class="${m.kind === k ? 'on' : ''}" ${attrs({ act: 'kind', kind: k, ...ids })}>${v}</button>`).join('')}</div>`}
      <span class="model-total"><span class="hide-sm">Общ. кол-во: </span><b data-total="model" ${attrs(ids)}>${fmt(modelTotal(m))}</b> ед.</span>
      ${collapsed ? '' : `
        <button type="button" class="btn ghost icon" ${attrs({ act: 'dup-model', ...ids })} title="Дублировать модель">${ICON.copy}</button>
        <button type="button" class="btn ghost icon danger" ${attrs({ act: 'del-model', ...ids })} title="Удалить модель">${ICON.trash}</button>`}
    </div>`;
  if (collapsed) return `<div class="ed-model is-collapsed${m.kind === 'return' ? ' is-return' : ''}">${head}</div>`;

  const sizes = `
    <div class="sizes">
      <span class="suggest-label">Размеры:</span>
      ${m.sizes.map((size, si) => `<span class="size-chip">${esc(size)}<button type="button" ${attrs({ act: 'del-size', si, ...ids })} title="Убрать размер" aria-label="Убрать ${esc(size)}">×</button></span>`).join('')}
      <input class="size-add" placeholder="+ размер" enterkeyhint="done" autocapitalize="characters" autocomplete="off" ${attrs({ act: 'add-size', ...ids })} title="Введите размер и нажмите Enter">
    </div>`;

  const body = mob
    ? `
      <div class="color-cards">
        ${m.colors.map((c, ci) => `
          <div class="color-card">
            <div class="cc-head">
              <input class="input cc-name" list="dl-color" placeholder="Цвет" autocomplete="off" ${attrs({ f: 'color.name', ci, ...ids })} value="${esc(c.name)}">
              <button type="button" class="btn ghost icon danger" ${attrs({ act: 'del-color', ci, ...ids })} title="Удалить цвет">${ICON.trash}</button>
            </div>
            <input class="input art-input" placeholder="Артикул" autocomplete="off" ${attrs({ f: 'color.article', ci, ...ids })} value="${esc(c.article)}">
            <div class="cc-sizes" style="--n:${Math.min(m.sizes.length, 4)}">
              ${m.sizes.map((size, si) => `<label class="cc-size"><span>${esc(size)}</span>${cell(c, ci, size, si)}</label>`).join('')}
            </div>
            <div class="cc-foot">
              <button type="button" class="btn sm" ${attrs({ act: 'fill', ci, ...ids })}>= всем размерам</button>
              <span>Итого: <b data-total="color" ${attrs({ ci, ...ids })}>${fmt(colorTotal(c))}</b></span>
            </div>
          </div>`).join('')}
        <button type="button" class="add-row" ${attrs({ act: 'add-color', ...ids })}>+ Цвет</button>
      </div>`
    : `
      <div class="table-wrap" style="border:0">
        <table class="grid-ed">
          <thead><tr>
            <th class="size"></th>
            ${m.colors.map((c, ci) => `
              <th><div class="col-head">
                <input class="input" list="dl-color" placeholder="Цвет" autocomplete="off" ${attrs({ f: 'color.name', ci, ...ids })} value="${esc(c.name)}">
                <input class="input art-input" placeholder="Артикул" autocomplete="off" ${attrs({ f: 'color.article', ci, ...ids })} value="${esc(c.article)}">
                <div class="col-tools">
                  <button type="button" class="btn ghost" ${attrs({ act: 'fill', ci, ...ids })} title="Проставить одно число во все размеры">= всем</button>
                  <button type="button" class="btn ghost danger" ${attrs({ act: 'del-color', ci, ...ids })} title="Удалить цвет">×</button>
                </div>
              </div></th>`).join('')}
            <th rowspan="${m.sizes.length + 2}" style="vertical-align:top"><button type="button" class="add-col" ${attrs({ act: 'add-color', ...ids })}>+ цвет</button></th>
          </tr></thead>
          <tbody>
            ${m.sizes.map((size, si) => `
              <tr>
                <th class="size">${esc(size)}</th>
                ${m.colors.map((c, ci) => `<td>${cell(c, ci, size, si)}</td>`).join('')}
                <td class="rowtotal" data-total="row" ${attrs({ si, ...ids })}>${fmt(rowTotal(size))}</td>
              </tr>`).join('')}
          </tbody>
          <tfoot><tr>
            <td class="size muted" style="text-align:left">Общ:</td>
            ${m.colors.map((c, ci) => `<td data-total="color" ${attrs({ ci, ...ids })}>${fmt(colorTotal(c))}</td>`).join('')}
          </tr></tfoot>
        </table>
      </div>`;

  return `
    <div class="ed-model${m.kind === 'return' ? ' is-return' : ''}">
      ${head}
      ${sizes}
      ${body}
      <div data-chips="model" ${attrs(ids)}>${colorChips(b, m, bi, mi)}</div>
    </div>`;
}

const entities = () => (state.config && state.config.legalEntities) || [];
const entityOf = (owner) => entities().find((e) => e.owner === owner);

// «ИП НУРЛАНОВА А» → «нурланова а»; «ИП Темирова Ассоль» → фамилия + первая буква имени.
const ownerKey = (v) => String(v || '').toLowerCase().replace(/ё/g, 'е').replace(/^\s*ип(?![a-zа-я])/, '').replace(/[^a-zа-я0-9]+/g, ' ').trim();
const ownerShortKey = (v) => {
  const [surname, name = ''] = ownerKey(v).split(' ');
  return `${surname} ${name.charAt(0)}`.trim();
};

// Привязывает ИП из старых отправок к записи справочника (если однозначно похоже).
function matchEntity(owner) {
  if (!owner || entityOf(owner)) return entityOf(owner);
  const exact = entities().filter((e) => ownerKey(e.owner) === ownerKey(owner));
  if (exact.length === 1) return exact[0];
  const short = entities().filter((e) => ownerShortKey(e.owner) === ownerShortKey(owner));
  if (short.length === 1) return short[0];
  const surname = (v) => ownerKey(v).split(' ')[0];
  const bySurname = entities().filter((e) => surname(e.owner) === surname(owner));
  return bySurname.length === 1 ? bySurname[0] : null;
}

// ИП — только из справочника; бренд подставляется из справочника по ИП.
function brandFields(b, bi) {
  const list = entities();
  const known = entityOf(b.owner);
  const ownerOptions = [
    `<option value="" ${b.owner ? '' : 'selected'} disabled>Выберите ИП…</option>`,
    ...list.map((e) => `<option value="${esc(e.owner)}" ${e.owner === b.owner ? 'selected' : ''}>${esc(e.owner)}</option>`),
    // старые отправки могли быть с ИП не из списка — показываем как есть
    ...(b.owner && !known ? [`<option value="${esc(b.owner)}" selected>${esc(b.owner)} (нет в справочнике)</option>`] : []),
  ].join('');
  const owner = `<label class="field"><span>ИП</span><select class="input select" data-f="brand.owner" data-bi="${bi}">${ownerOptions}</select></label>`;

  let brand;
  if (known && known.brands.length > 1) {
    const opts = known.brands.map((x) => `<option value="${esc(x)}" ${x === b.name ? 'selected' : ''}>${esc(x)}</option>`);
    if (b.name && !known.brands.includes(b.name)) opts.push(`<option value="${esc(b.name)}" selected>${esc(b.name)}</option>`);
    brand = `<select class="input select" data-f="brand.name" data-bi="${bi}">${b.name ? '' : '<option value="" selected disabled>Выберите бренд…</option>'}${opts.join('')}</select>`;
  } else if (known && known.brands.length === 1) {
    brand = `<div class="input brand-fixed">${esc(b.name || known.brands[0])}</div>`;
  } else if (!b.owner) {
    brand = '<div class="input brand-fixed muted">Сначала выберите ИП</div>';
  } else {
    brand = `<input class="input" placeholder="Бренд (пока нет в справочнике)" autocomplete="off" data-f="brand.name" data-bi="${bi}" value="${esc(b.name)}">`;
  }
  return `${owner}<label class="field"><span>Бренд</span>${brand}</label>`;
}

function drawEditor(ed) {
  const { s } = ed;
  ed.mobile = MOBILE.matches;
  const mob = ed.mobile;
  const focusKey = document.activeElement && document.activeElement.dataset ? keyOf(document.activeElement) : null;
  const t = totals(s);
  const back = ed.id ? `#/s/${ed.id}` : '#/';
  const extra = `
      <label class="field title-field"><span>Название (так будет назван лист в таблице)</span><input class="input" data-f="title" autocomplete="off" placeholder="${esc(autoTitle(s.date, s.fulfillment))}" value="${esc(ed.titleAuto ? '' : s.title)}"></label>
      <label class="field comment-field"><span>Комментарий</span><input class="input" data-f="comment" autocomplete="off" placeholder="Накладная, номер машины, что угодно" value="${esc(s.comment)}"></label>`;
  $app.innerHTML = `
    ${datalists()}
    <a class="back" href="${back}">${ICON.back}${ed.id ? 'К отправке' : 'Все отправки'}</a>
    <div class="page-head"><div><h1>${ed.id ? 'Редактирование' : 'Новая отправка'}</h1>
      ${mob ? '' : '<div class="sub">Количество можно вставлять из Excel/Google Таблиц прямо в сетку (Ctrl+V)</div>'}</div></div>

    <section class="card meta-grid">
      <label class="field"><span>Дата</span><input class="input" type="date" data-f="date" value="${esc(s.date)}"></label>
      <label class="field"><span>Фулфилмент</span><input class="input" list="dl-ff" placeholder="Азамат ФФ" autocomplete="off" data-f="fulfillment" value="${esc(s.fulfillment)}"></label>
      ${mob ? '' : extra}
      <div class="field status-field"><span>Статус</span>
        <div class="segmented">${Object.entries(STATUS).map(([k, v]) => `<button type="button" class="${s.status === k ? 'on' : ''}" data-act="status" data-status="${k}">${v}</button>`).join('')}</div>
      </div>
      ${mob ? `<details class="more"${ed.moreOpen || !ed.titleAuto || s.comment ? ' open' : ''}><summary>Название листа и комментарий</summary><div class="more-body">${extra}</div></details>` : ''}
    </section>

    ${s.brands.map((b, bi) => `
      <section class="card ed-brand">
        <div class="ed-brand-head">
          ${brandFields(b, bi)}
          <div class="row brand-tools">
            <span class="muted">Итого: <b data-total="brand" data-bi="${bi}">${fmt(b.models.reduce((a, m) => a + modelTotal(m), 0))}</b></span>
            <button type="button" class="btn ghost icon danger" data-act="del-brand" data-bi="${bi}" title="Удалить бренд">${ICON.trash}</button>
          </div>
        </div>
        <div class="ed-brand-body">
          ${b.models.map((m, mi) => edModel(ed, b, m, bi, mi)).join('')}
          <div data-chips="brand" data-bi="${bi}">${modelChips(b, bi)}</div>
          <button type="button" class="add-row" data-act="add-model" data-bi="${bi}">+ Модель</button>
        </div>
      </section>`).join('')}
    <button type="button" class="add-row add-brand" data-act="add-brand">+ Бренд / ИП</button>

    <div class="savebar"><div class="savebar-inner">
      <div class="sum">
        <span>Отгрузка: <b id="sum-shipped">${fmt(t.shipped)}</b></span>
        <span class="${t.returned || !mob ? '' : 'hidden'}" id="sum-returned-wrap">Возвраты: <b id="sum-returned">${fmt(t.returned)}</b></span>
      </div>
      <div class="spacer"></div>
      <a class="btn ghost hide-sm" href="${back}">Отмена</a>
      <button type="button" class="btn primary save-btn" id="save">${ed.saving ? 'Сохраняю…' : 'Сохранить'}</button>
    </div></div>`;

  if (focusKey) {
    const el = [...$app.querySelectorAll('[data-f],[data-act="add-size"]')].find((x) => keyOf(x) === focusKey);
    if (el) el.focus({ preventScroll: true });
  }

  bindEditor(ed);
}

// Нижняя шторка для ввода одного числа — удобнее системного prompt() на телефоне.
function askNumber(title) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'sheet-backdrop';
    wrap.innerHTML = `
      <form class="sheet" role="dialog" aria-label="${esc(title)}">
        <div class="sheet-grip"></div>
        <h3>${esc(title)}</h3>
        <input class="input sheet-input" type="text" inputmode="numeric" pattern="[0-9]*" enterkeyhint="done" placeholder="0" autocomplete="off">
        <div class="chips quick">${[5, 10, 12, 15, 20, 25, 30, 50].map((n) => `<button type="button" class="chip" data-n="${n}">${n}</button>`).join('')}</div>
        <div class="row sheet-actions"><button type="button" class="btn ghost" data-cancel>Отмена</button><button class="btn primary">Готово</button></div>
      </form>`;
    const close = (v) => { wrap.remove(); resolve(v); };
    const input = wrap.querySelector('input');
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap || e.target.closest('[data-cancel]')) close(null);
      const q = e.target.closest('[data-n]');
      if (q) close(Number(q.dataset.n));
    });
    wrap.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      const n = parseInt(input.value, 10);
      close(Number.isFinite(n) ? n : null);
    };
    wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(null); });
    document.body.append(wrap);
    input.focus();
  });
}

const keyOf = (el) => ['f', 'act', 'bi', 'mi', 'ci', 'si'].map((k) => el.dataset[k] ?? '').join('|');
const num = (v) => (v === undefined ? undefined : Number(v));

function refreshTotals(ed) {
  const { s } = ed;
  $app.querySelectorAll('[data-total]').forEach((el) => {
    const b = s.brands[num(el.dataset.bi)];
    const m = b && b.models[num(el.dataset.mi)];
    switch (el.dataset.total) {
      case 'brand': el.textContent = fmt(b.models.reduce((a, x) => a + modelTotal(x), 0)); break;
      case 'model': el.textContent = fmt(modelTotal(m)); break;
      case 'color': el.textContent = fmt(colorTotal(m.colors[num(el.dataset.ci)])); break;
      case 'row': {
        const size = m.sizes[num(el.dataset.si)];
        el.textContent = fmt(m.colors.reduce((a, c) => a + (Number(c.qty[size]) || 0), 0));
        break;
      }
    }
  });
  const t = totals(s);
  document.getElementById('sum-shipped').textContent = fmt(t.shipped);
  document.getElementById('sum-returned').textContent = fmt(t.returned);
  if (t.returned) document.getElementById('sum-returned-wrap').classList.remove('hidden');
}

function refreshChips(ed, bi) {
  const b = ed.s.brands[bi];
  const box = $app.querySelector(`[data-chips="brand"][data-bi="${bi}"]`);
  if (box) box.innerHTML = modelChips(b, bi);
  $app.querySelectorAll(`[data-chips="model"][data-bi="${bi}"]`).forEach((el) => {
    const mi = num(el.dataset.mi);
    el.innerHTML = colorChips(b, b.models[mi], bi, mi);
  });
}

function setQty(m, ci, si, raw) {
  const n = parseInt(String(raw).replace(/\s/g, ''), 10);
  const size = m.sizes[si];
  if (Number.isFinite(n) && n > 0) m.colors[ci].qty[size] = n;
  else delete m.colors[ci].qty[size];
}

function bindEditor(ed) {
  const { s } = ed;
  const at = (el) => {
    const b = s.brands[num(el.dataset.bi)];
    const m = b && b.models[num(el.dataset.mi)];
    const c = m && m.colors[num(el.dataset.ci)];
    return { b, m, c };
  };

  $app.oninput = (e) => {
    const el = e.target;
    const f = el.dataset.f;
    if (!f) return;
    const { b, m, c } = at(el);
    switch (f) {
      case 'date':
      case 'fulfillment':
        s[f] = el.value;
        if (ed.titleAuto) {
          s.title = autoTitle(s.date, s.fulfillment);
          $app.querySelector('[data-f="title"]').placeholder = s.title;
        }
        return;
      case 'title':
        s.title = el.value;
        ed.titleAuto = !el.value.trim();
        if (ed.titleAuto) s.title = autoTitle(s.date, s.fulfillment);
        return;
      case 'comment': s.comment = el.value; return;
      case 'brand.name':
        b.name = el.value;
        refreshChips(ed, num(el.dataset.bi));
        return;
      case 'brand.owner': {
        b.owner = el.value;
        const known = entityOf(b.owner);
        if (known && known.brands.length === 1) b.name = known.brands[0];
        else if (known && !known.brands.includes(b.name)) b.name = '';
        drawEditor(ed);
        return;
      }
      case 'model.name': m.name = el.value; refreshChips(ed, num(el.dataset.bi)); return;
      case 'color.name': {
        c.name = el.value;
        const known = state.suggestions.colors.find((x) => x.brand === b.name && x.model === m.name && x.name === el.value);
        if (known && known.article && !c.article) {
          c.article = known.article;
          $app.querySelector(`[data-f="color.article"][data-bi="${el.dataset.bi}"][data-mi="${el.dataset.mi}"][data-ci="${el.dataset.ci}"]`).value = known.article;
        }
        refreshChips(ed, num(el.dataset.bi));
        return;
      }
      case 'color.article': c.article = el.value; return;
      case 'qty':
        el.value = el.value.replace(/\D/g, '');
        setQty(m, num(el.dataset.ci), num(el.dataset.si), el.value);
        refreshTotals(ed);
    }
  };

  // Вставка блока чисел из таблицы: заполняет сетку начиная с текущей ячейки.
  $app.onpaste = (e) => {
    const el = e.target;
    if (el.dataset.f !== 'qty') return;
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (!/[\t\n]/.test(text.trim())) return;
    e.preventDefault();
    const { m } = at(el);
    const ci0 = num(el.dataset.ci);
    const si0 = num(el.dataset.si);
    text.replace(/\r/g, '').replace(/\n$/, '').split('\n').forEach((line, dr) => {
      line.split('\t').forEach((v, dc) => {
        const si = si0 + dr;
        const ci = ci0 + dc;
        if (si < m.sizes.length && ci < m.colors.length) setQty(m, ci, si, v);
      });
    });
    drawEditor(ed);
  };

  $app.onkeydown = (e) => {
    const el = e.target;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      save(ed);
      return;
    }
    if (el.dataset.act === 'add-size' && e.key === 'Enter') {
      e.preventDefault();
      const { m } = at(el);
      const sizes = el.value.split(/[\s,;]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
      for (const size of sizes) if (!m.sizes.includes(size)) m.sizes.push(size);
      drawEditor(ed);
      return;
    }
    // Enter / стрелки — навигация по сетке как в таблице
    if (el.dataset.f === 'qty' && ['Enter', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      const d = { Enter: [1, 0], ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
      if ((e.key === 'ArrowLeft' && el.selectionStart > 0) || (e.key === 'ArrowRight' && el.selectionEnd < el.value.length)) return;
      const q = (si, ci) => $app.querySelector(
        `[data-f="qty"][data-bi="${el.dataset.bi}"][data-mi="${el.dataset.mi}"][data-si="${si}"][data-ci="${ci}"]`
      );
      const si = num(el.dataset.si);
      const ci = num(el.dataset.ci);
      // После последнего размера Enter переходит к первому размеру следующего цвета.
      const next = q(si + d[0], ci + d[1]) || (e.key === 'Enter' ? q(0, ci + 1) : null);
      if (next) {
        e.preventDefault();
        next.focus();
        next.select();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        el.blur(); // на телефоне прячет клавиатуру
      }
    }
  };

  $app.onclick = async (e) => {
    const summary = e.target.closest('details.more > summary');
    if (summary) ed.moreOpen = !summary.parentElement.open;
    const el = e.target.closest('[data-act]');
    if (!el || el.dataset.act === 'add-size') return;
    const { b, m } = at(el);
    const bi = num(el.dataset.bi);
    const mi = num(el.dataset.mi);
    const ci = num(el.dataset.ci);
    switch (el.dataset.act) {
      case 'status': s.status = el.dataset.status; break;
      case 'kind': m.kind = el.dataset.kind; break;
      case 'add-brand': s.brands.push(blankBrand()); break;
      case 'del-brand':
        if (b.models.some((x) => modelTotal(x)) && !confirm(`Удалить бренд «${b.name || 'без названия'}» со всеми моделями?`)) return;
        s.brands.splice(bi, 1);
        break;
      case 'toggle':
        if (ed.collapsed.has(m.id)) ed.collapsed.delete(m.id);
        else ed.collapsed.add(m.id);
        break;
      case 'add-model': {
        const last = b.models[b.models.length - 1];
        if (ed.mobile) b.models.forEach((x) => { if (x.name.trim()) ed.collapsed.add(x.id); });
        b.models.push(blankModel(last ? last.sizes : DEFAULT_SIZES));
        break;
      }
      case 'add-template': {
        const t = state.suggestions.templates[num(el.dataset.ti)];
        const model = {
          id: uid(),
          name: t.model,
          kind: t.kind,
          sizes: [...t.sizes],
          colors: t.colors.map((c) => ({ id: uid(), name: c.name, article: c.article, qty: {} })),
        };
        if (ed.mobile) b.models.forEach((x) => { if (x.name.trim()) ed.collapsed.add(x.id); });
        const isBlank = (x) => !x.name.trim() && !modelTotal(x) && x.colors.every((c) => !c.name.trim());
        if (b.models.length === 1 && isBlank(b.models[0])) b.models[0] = model;
        else b.models.push(model);
        drawEditor(ed);
        const first = $app.querySelector(`[data-f="qty"][data-bi="${bi}"][data-mi="${b.models.indexOf(model)}"][data-ci="0"][data-si="0"]`);
        if (first) first.closest('.ed-model').scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      case 'add-known-color': {
        const color = { id: uid(), name: el.dataset.name, article: el.dataset.article || '', qty: {} };
        const blank = m.colors.length === 1 && !m.colors[0].name.trim() && !colorTotal(m.colors[0]);
        if (blank) m.colors[0] = color;
        else m.colors.push(color);
        break;
      }
      case 'dup-model': {
        const copy = structuredClone(m);
        copy.id = uid();
        copy.colors.forEach((c) => { c.id = uid(); });
        b.models.splice(mi + 1, 0, copy);
        break;
      }
      case 'del-model':
        if (modelTotal(m) && !confirm(`Удалить модель «${m.name || 'без названия'}»?`)) return;
        b.models.splice(mi, 1);
        break;
      case 'add-color': m.colors.push(blankColor()); break;
      case 'del-color':
        if (colorTotal(m.colors[ci]) && !confirm(`Удалить цвет «${m.colors[ci].name || 'без названия'}»?`)) return;
        m.colors.splice(ci, 1);
        break;
      case 'del-size': {
        const size = m.sizes[num(el.dataset.si)];
        m.sizes.splice(num(el.dataset.si), 1);
        m.colors.forEach((c) => delete c.qty[size]);
        break;
      }
      case 'fill': {
        const v = await askNumber(`Всем размерам${m.colors[ci].name ? ` · ${m.colors[ci].name}` : ''}`);
        if (v === null) return;
        m.sizes.forEach((_, si) => setQty(m, ci, si, v));
        break;
      }
      default: return;
    }
    drawEditor(ed);
    if (el.dataset.act === 'add-color') {
      const heads = $app.querySelectorAll(`[data-f="color.name"][data-bi="${bi}"][data-mi="${mi}"]`);
      heads[heads.length - 1].focus();
    }
    if (el.dataset.act === 'add-model' || el.dataset.act === 'add-brand') {
      const sel = el.dataset.act === 'add-brand' ? '[data-f="brand.owner"]' : `[data-f="model.name"][data-bi="${bi}"]`;
      const all = $app.querySelectorAll(sel);
      if (all.length) all[all.length - 1].focus();
    }
    if (el.dataset.act === 'add-known-color' && ed.mobile) {
      const first = $app.querySelector(`[data-f="qty"][data-bi="${bi}"][data-mi="${mi}"][data-ci="${m.colors.length - 1}"][data-si="0"]`);
      if (first) first.focus();
    }
  };

  document.getElementById('save').onclick = () => save(ed);
}

// Перед сохранением выбрасываем пустые цвета и модели, чтобы не засорять таблицу.
function cleanForSave(s) {
  const out = structuredClone(s);
  for (const b of out.brands) {
    for (const m of b.models) m.colors = m.colors.filter((c) => c.name.trim() || colorTotal(c));
    b.models = b.models.filter((m) => m.name.trim() || m.colors.length);
  }
  out.brands = out.brands.filter((b) => b.name.trim() || b.owner || b.models.length);
  for (const b of out.brands) {
    for (const m of b.models) {
      m.colors.forEach((c, i) => { if (!c.name.trim()) c.name = `Цвет ${i + 1}`; });
    }
  }
  return out;
}

async function save(ed) {
  if (ed.saving) return;
  const body = cleanForSave(ed.s);
  if (!body.brands.length) {
    toast('Добавьте хотя бы один бренд', true);
    return;
  }
  const noOwner = body.brands.find((b) => !b.owner);
  if (noOwner) {
    toast('Выберите ИП для каждого бренда', true);
    return;
  }
  const noName = body.brands.find((b) => !b.name.trim());
  if (noName) {
    toast(`Укажите бренд для ${noName.owner}`, true);
    return;
  }
  ed.saving = true;
  const btn = document.getElementById('save');
  btn.disabled = true;
  btn.textContent = 'Сохраняю…';
  try {
    const saved = ed.id
      ? await api(`/shipments/${ed.id}`, { method: 'PUT', body })
      : await api('/shipments', { method: 'POST', body });
    state.list = null;
    leaveGuard = null;
    if (saved.syncError) toast(`Сохранено, но таблица не обновилась: ${saved.syncError}`, true);
    else toast(state.config.sheets.enabled ? 'Сохранено и отправлено в таблицу' : 'Сохранено');
    go(`/s/${saved.id}`);
  } catch (e) {
    toast(e.message, true);
    ed.saving = false;
    btn.disabled = false;
    btn.textContent = 'Сохранить';
  }
}

// ============================================================

async function boot() {
  const me = await fetch('/api/me').then((r) => r.json());
  state.passwordRequired = me.passwordRequired;
  if (!me.authed) return renderLogin();
  state.config = await api('/config');
  route();
}

boot().catch((e) => {
  $app.innerHTML = `<div class="card empty"><h2>Сервер недоступен</h2><p>${esc(e.message)}</p></div>`;
});
