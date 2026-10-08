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
  $app.oninput = $app.onclick = $app.onkeydown = $app.onpaste = null;
  window.scrollTo(0, 0);
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
                ${m.colors.length ? qtyTable(m) : '<div class="muted">Цвета не добавлены</div>'}
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

  // Заголовок считается «авто», пока его не трогали руками.
  const titleAuto = !s.title || s.title === autoTitle(s.date, s.fulfillment);
  if (titleAuto) s.title = autoTitle(s.date, s.fulfillment);
  const ed = { s, id, titleAuto, initial: JSON.stringify(s), saving: false };
  leaveGuard = () => !ed.saving && JSON.stringify(ed.s) !== ed.initial;
  drawEditor(ed);
}

function datalists() {
  const sg = state.suggestions || { fulfillments: [], brands: [], models: [], colors: [] };
  const uniq = (arr) => [...new Set(arr)];
  return `
    <datalist id="dl-ff">${sg.fulfillments.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
    <datalist id="dl-brand">${sg.brands.map((x) => `<option value="${esc(x.name)}">${esc(x.owner)}</option>`).join('')}</datalist>
    <datalist id="dl-owner">${uniq(sg.brands.map((x) => x.owner).filter(Boolean)).map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
    <datalist id="dl-model">${sg.models.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
    <datalist id="dl-color">${uniq(sg.colors.map((x) => x.name)).map((x) => `<option value="${esc(x)}">`).join('')}</datalist>`;
}

function edModel(m, bi, mi) {
  const rowTotal = (size) => m.colors.reduce((a, c) => a + (Number(c.qty[size]) || 0), 0);
  return `
    <div class="ed-model${m.kind === 'return' ? ' is-return' : ''}" data-bi="${bi}" data-mi="${mi}">
      <div class="ed-model-head">
        <input class="input" list="dl-model" placeholder="Модель, например «Вилка однотон»" data-f="model.name" data-bi="${bi}" data-mi="${mi}" value="${esc(m.name)}">
        <div class="segmented">
          ${Object.entries(KIND).map(([k, v]) => `<button type="button" class="${m.kind === k ? 'on' : ''}" data-act="kind" data-kind="${k}" data-bi="${bi}" data-mi="${mi}">${v}</button>`).join('')}
        </div>
        <span class="model-total">Общ. кол-во: <b data-total="model" data-bi="${bi}" data-mi="${mi}">${fmt(modelTotal(m))}</b> ед.</span>
        <button type="button" class="btn ghost sm" data-act="dup-model" data-bi="${bi}" data-mi="${mi}" title="Дублировать модель">${ICON.copy}</button>
        <button type="button" class="btn ghost sm danger" data-act="del-model" data-bi="${bi}" data-mi="${mi}" title="Удалить модель">${ICON.trash}</button>
      </div>
      <div class="sizes">
        <span class="muted" style="font-size:12px;font-weight:500">Размеры:</span>
        ${m.sizes.map((size, si) => `<span class="size-chip">${esc(size)}<button type="button" data-act="del-size" data-bi="${bi}" data-mi="${mi}" data-si="${si}" title="Убрать размер">×</button></span>`).join('')}
        <input class="size-add" placeholder="+ размер" data-act="add-size" data-bi="${bi}" data-mi="${mi}" title="Введите размер и нажмите Enter">
      </div>
      <div class="table-wrap" style="border:0">
        <table class="grid-ed">
          <thead><tr>
            <th class="size"></th>
            ${m.colors.map((c, ci) => `
              <th><div class="col-head">
                <input class="input" list="dl-color" placeholder="Цвет" data-f="color.name" data-bi="${bi}" data-mi="${mi}" data-ci="${ci}" value="${esc(c.name)}">
                <input class="input art-input" placeholder="Артикул" data-f="color.article" data-bi="${bi}" data-mi="${mi}" data-ci="${ci}" value="${esc(c.article)}">
                <div class="col-tools">
                  <button type="button" class="btn ghost" data-act="fill" data-bi="${bi}" data-mi="${mi}" data-ci="${ci}" title="Проставить одно число во все размеры">= всем</button>
                  <button type="button" class="btn ghost danger" data-act="del-color" data-bi="${bi}" data-mi="${mi}" data-ci="${ci}" title="Удалить цвет">×</button>
                </div>
              </div></th>`).join('')}
            <th rowspan="${m.sizes.length + 2}" style="vertical-align:top"><button type="button" class="add-col" data-act="add-color" data-bi="${bi}" data-mi="${mi}">+ цвет</button></th>
          </tr></thead>
          <tbody>
            ${m.sizes.map((size, si) => `
              <tr>
                <th class="size">${esc(size)}</th>
                ${m.colors.map((c, ci) => `<td><input class="cell" inputmode="numeric" placeholder="·" data-f="qty" data-bi="${bi}" data-mi="${mi}" data-ci="${ci}" data-si="${si}" value="${c.qty[size] || ''}"></td>`).join('')}
                <td class="rowtotal" data-total="row" data-bi="${bi}" data-mi="${mi}" data-si="${si}">${fmt(rowTotal(size))}</td>
              </tr>`).join('')}
          </tbody>
          <tfoot><tr>
            <td class="size muted" style="text-align:left">Общ:</td>
            ${m.colors.map((c, ci) => `<td data-total="color" data-bi="${bi}" data-mi="${mi}" data-ci="${ci}">${fmt(colorTotal(c))}</td>`).join('')}
          </tr></tfoot>
        </table>
      </div>
    </div>`;
}

function drawEditor(ed) {
  const { s } = ed;
  const focusKey = document.activeElement && document.activeElement.dataset ? keyOf(document.activeElement) : null;
  const t = totals(s);
  $app.innerHTML = `
    ${datalists()}
    <a class="back" href="${ed.id ? `#/s/${ed.id}` : '#/'}">${ICON.back}${ed.id ? 'К отправке' : 'Все отправки'}</a>
    <div class="page-head"><div><h1>${ed.id ? 'Редактирование отправки' : 'Новая отправка'}</h1>
      <div class="sub">Количество можно вставлять из Excel/Google Таблиц прямо в сетку (Ctrl+V)</div></div></div>

    <section class="card meta-grid">
      <label class="field"><span>Дата</span><input class="input" type="date" data-f="date" value="${esc(s.date)}"></label>
      <label class="field"><span>Фулфилмент</span><input class="input" list="dl-ff" placeholder="Азамат ФФ" data-f="fulfillment" value="${esc(s.fulfillment)}"></label>
      <label class="field title-field"><span>Название (так будет назван лист в таблице)</span><input class="input" data-f="title" placeholder="${esc(autoTitle(s.date, s.fulfillment))}" value="${esc(ed.titleAuto ? '' : s.title)}"></label>
      <div class="field status-field"><span>Статус</span>
        <div class="segmented">${Object.entries(STATUS).map(([k, v]) => `<button type="button" class="${s.status === k ? 'on' : ''}" data-act="status" data-status="${k}">${v}</button>`).join('')}</div>
      </div>
      <label class="field comment-field"><span>Комментарий</span><input class="input" data-f="comment" placeholder="Накладная, номер машины, что угодно" value="${esc(s.comment)}"></label>
    </section>

    ${s.brands.map((b, bi) => `
      <section class="card ed-brand">
        <div class="ed-brand-head">
          <label class="field"><span>Бренд</span><input class="input" list="dl-brand" placeholder="AESTA" data-f="brand.name" data-bi="${bi}" value="${esc(b.name)}"></label>
          <label class="field"><span>ИП / владелец</span><input class="input" list="dl-owner" placeholder="ИП Нурланова А." data-f="brand.owner" data-bi="${bi}" value="${esc(b.owner)}"></label>
          <div class="row">
            <span class="muted hide-sm">Итого: <b data-total="brand" data-bi="${bi}">${fmt(b.models.reduce((a, m) => a + modelTotal(m), 0))}</b></span>
            <button type="button" class="btn ghost danger" data-act="del-brand" data-bi="${bi}" title="Удалить бренд">${ICON.trash}</button>
          </div>
        </div>
        <div class="ed-brand-body">
          ${b.models.map((m, mi) => edModel(m, bi, mi)).join('')}
          <button type="button" class="add-row" data-act="add-model" data-bi="${bi}">+ Модель</button>
        </div>
      </section>`).join('')}
    <button type="button" class="add-row add-brand" data-act="add-brand">+ Бренд / ИП</button>

    <div class="savebar"><div class="savebar-inner">
      <div class="sum"><span>Отгрузка: <b id="sum-shipped">${fmt(t.shipped)}</b></span><span>Возвраты: <b id="sum-returned">${fmt(t.returned)}</b></span></div>
      <div class="spacer"></div>
      <a class="btn ghost" href="${ed.id ? `#/s/${ed.id}` : '#/'}">Отмена</a>
      <button type="button" class="btn primary" id="save">${ed.saving ? 'Сохраняю…' : 'Сохранить'}</button>
    </div></div>`;

  if (focusKey) {
    const el = [...$app.querySelectorAll('[data-f],[data-act="add-size"]')].find((x) => keyOf(x) === focusKey);
    if (el) el.focus();
  }

  bindEditor(ed);
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
      case 'brand.name': {
        b.name = el.value;
        const known = state.suggestions.brands.find((x) => x.name === el.value);
        if (known && !b.owner) {
          b.owner = known.owner;
          $app.querySelector(`[data-f="brand.owner"][data-bi="${el.dataset.bi}"]`).value = known.owner;
        }
        return;
      }
      case 'brand.owner': b.owner = el.value; return;
      case 'model.name': m.name = el.value; return;
      case 'color.name': {
        c.name = el.value;
        const known = state.suggestions.colors.find((x) => x.brand === b.name && x.model === m.name && x.name === el.value);
        if (known && known.article && !c.article) {
          c.article = known.article;
          $app.querySelector(`[data-f="color.article"][data-bi="${el.dataset.bi}"][data-mi="${el.dataset.mi}"][data-ci="${el.dataset.ci}"]`).value = known.article;
        }
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
      const next = $app.querySelector(
        `[data-f="qty"][data-bi="${el.dataset.bi}"][data-mi="${el.dataset.mi}"][data-si="${num(el.dataset.si) + d[0]}"][data-ci="${num(el.dataset.ci) + d[1]}"]`
      );
      if (next) {
        e.preventDefault();
        next.focus();
        next.select();
      }
    }
  };

  $app.onclick = (e) => {
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
      case 'add-model': {
        const last = b.models[b.models.length - 1];
        b.models.push(blankModel(last ? last.sizes : DEFAULT_SIZES));
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
      case 'del-color': m.colors.splice(ci, 1); break;
      case 'del-size': {
        const size = m.sizes[num(el.dataset.si)];
        m.sizes.splice(num(el.dataset.si), 1);
        m.colors.forEach((c) => delete c.qty[size]);
        break;
      }
      case 'fill': {
        const v = prompt('Сколько единиц поставить во все размеры этого цвета?');
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
      const sel = el.dataset.act === 'add-brand' ? '[data-f="brand.name"]' : `[data-f="model.name"][data-bi="${bi}"]`;
      const all = $app.querySelectorAll(sel);
      all[all.length - 1].focus();
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
  out.brands = out.brands.filter((b) => b.name.trim() || b.models.length);
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
