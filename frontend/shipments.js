// ── Отправки: список, просмотр, редактор, импорт ──

const STATUS = { draft: 'Черновик', sent: 'Отправлено', accepted: 'Принято' };
const SIZE_PRESETS = [['XS', 'S', 'M', 'L'], ['S', 'M'], ['S', 'M', 'L', 'XL'], ['42', '44', '46', '48', '50']];

const S = {
  list: [],
  google: { configured: false },
  filter: { q: '', ff: '', status: '' },
  draft: null,       // редактируемая отправка
  editingId: null,
  dirty: false,
  titleAuto: false,
  imports: [],       // разобранные из Excel
  importIdx: null,   // какой импорт открыт в редакторе
  collapsed: new Set(), // свёрнутые бренды в редакторе (телефон)
};

// Телефон: отдельная раскладка редактора (карточка на каждый цвет)
const MQ = window.matchMedia('(max-width: 640px)');
const isMobile = () => MQ.matches;
const DRAFT_KEY = 'shipment_draft';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => (+n || 0).toLocaleString('ru-RU');
const clone = o => JSON.parse(JSON.stringify(o));

function toDate(iso) { return iso ? new Date(`${String(iso).slice(0, 10)}T00:00:00`) : null; }
function fmtDate(iso, opts = { day: 'numeric', month: 'long', year: 'numeric' }) {
  const d = toDate(iso);
  return d && !isNaN(d) ? d.toLocaleDateString('ru-RU', opts) : '';
}
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function autoTitle(d) {
  const day = fmtDate(d.ship_date, { day: 'numeric', month: 'long' });
  return [day ? `от ${day}` : 'Отправка', d.fulfillment ? `(${d.fulfillment})` : ''].filter(Boolean).join(' ');
}

// ── Подсчёты ──
const itemSum = it => Object.values(it.qty || {}).reduce((a, b) => a + (+b || 0), 0);
const groupSum = g => (g.items || []).reduce((a, it) => a + itemSum(it), 0);
function brandSums(b) {
  let ship = 0, ret = 0;
  for (const g of b.groups || []) (g.kind === 'return' ? (ret += groupSum(g)) : (ship += groupSum(g)));
  return { ship, ret };
}
function shipSums(sh) {
  return (sh.blocks || []).reduce((acc, b) => { const s = brandSums(b); acc.ship += s.ship; acc.ret += s.ret; return acc; }, { ship: 0, ret: 0 });
}

function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), kind === 'err' ? 7000 : 3500);
}

function openOv(id) { $(id).classList.add('show'); document.body.style.overflow = 'hidden'; }
function closeOv(id) {
  $(id).classList.remove('show');
  if (!document.querySelector('.overlay.show')) document.body.style.overflow = '';
}

// ── Загрузка ──
async function load() {
  try {
    S.list = await API.get('/shipments') || [];
  } catch (e) {
    toast('Не удалось загрузить отправки: ' + e.message, 'err');
    S.list = [];
  }
  fillDatalists();
  renderFfFilter();
  renderList();
}

async function loadGoogle() {
  try { S.google = await API.get('/shipments/google/status') || { configured: false }; }
  catch { S.google = { configured: false }; }
  const pill = $('g-pill');
  if (S.google.configured) {
    pill.className = 'gpill ok';
    pill.href = S.google.spreadsheet_url;
    pill.title = 'Открыть таблицу «Отправки»';
    $('g-pill-t').textContent = 'Google Таблица подключена';
    if (isAdmin()) document.querySelectorAll('.admin-only').forEach(el => (el.style.display = ''));
  } else {
    pill.className = 'gpill off';
    pill.removeAttribute('href');
    $('g-pill-t').textContent = 'Google Таблица не подключена';
    pill.onclick = e => { e.preventDefault(); renderHelp(); };
  }
}

function fillDatalists() {
  const sets = { brand: new Set(), owner: new Set(), model: new Set(), color: new Set(), ff: new Set() };
  for (const sh of S.list) {
    if (sh.fulfillment) sets.ff.add(sh.fulfillment);
    for (const b of sh.blocks || []) {
      if (b.brand) sets.brand.add(b.brand);
      if (b.owner) sets.owner.add(b.owner);
      for (const g of b.groups || []) {
        if (g.model) sets.model.add(g.model);
        for (const it of g.items || []) if (it.color) sets.color.add(it.color);
      }
    }
  }
  for (const [k, set] of Object.entries(sets)) {
    $(`dl-${k}`).innerHTML = [...set].sort((a, b) => a.localeCompare(b, 'ru')).map(v => `<option value="${esc(v)}">`).join('');
  }
}

function renderFfFilter() {
  const ffs = [...new Set(S.list.map(s => s.fulfillment).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  const sel = $('f-ff');
  sel.innerHTML = '<option value="">Все фулфилменты</option>' + ffs.map(f => `<option ${f === S.filter.ff ? 'selected' : ''}>${esc(f)}</option>`).join('');
}

// ── Список ──
function searchBlob(sh) {
  if (!sh._blob) {
    const parts = [sh.title, sh.fulfillment, sh.comment];
    for (const b of sh.blocks || []) {
      parts.push(b.brand, b.owner);
      for (const g of b.groups || []) {
        parts.push(g.model);
        for (const it of g.items || []) parts.push(it.color, it.article);
      }
    }
    sh._blob = parts.filter(Boolean).join(' ').toLowerCase();
  }
  return sh._blob;
}

function filtered() {
  const q = S.filter.q.trim().toLowerCase();
  return S.list.filter(sh =>
    (!S.filter.ff || sh.fulfillment === S.filter.ff) &&
    (!S.filter.status || sh.status === S.filter.status) &&
    (!q || q.split(/\s+/).every(w => searchBlob(sh).includes(w))));
}

function renderKpis(list) {
  const brands = new Set();
  let units = 0, ret = 0, last30 = 0;
  const border = Date.now() - 30 * 864e5;
  for (const sh of list) {
    units += sh.total_qty || 0;
    ret += sh.return_qty || 0;
    if (sh.ship_date && toDate(sh.ship_date) >= border) last30 += sh.total_qty || 0;
    (sh.blocks || []).forEach(b => b.brand && brands.add(b.brand.toLowerCase()));
  }
  const last = list.find(s => s.ship_date);
  $('kpis').innerHTML = `
    <div class="kpi"><div class="kpi-l">Отправок</div><div class="kpi-v">${num(list.length)}</div><div class="kpi-s">${last ? 'последняя ' + fmtDate(last.ship_date, { day: 'numeric', month: 'short' }) : '—'}</div></div>
    <div class="kpi"><div class="kpi-l">Единиц отправлено</div><div class="kpi-v">${num(units)}</div><div class="kpi-s">${ret ? `возвратов: ${num(ret)}` : 'без возвратов'}</div></div>
    <div class="kpi"><div class="kpi-l">За 30 дней</div><div class="kpi-v">${num(last30)}</div><div class="kpi-s">единиц</div></div>
    <div class="kpi"><div class="kpi-l">Брендов</div><div class="kpi-v">${num(brands.size)}</div><div class="kpi-s">в выборке</div></div>`;
}

function syncBadge(sh) {
  if (!S.google.configured) return '';
  if (sh.sync_error) return `<span class="sync err" title="${esc(sh.sync_error)}">⚠ не выгружено</span>`;
  if (sh.synced_at) return `<span class="sync ok" title="Выгружено ${esc(new Date(sh.synced_at).toLocaleString('ru-RU'))}">✓ в Google</span>`;
  return '<span class="sync">○ не выгружено</span>';
}

function renderList() {
  const list = filtered();
  renderKpis(list);
  const root = $('list');
  if (!S.list.length) {
    root.innerHTML = `<div class="empty"><div class="empty-ico">📦</div><h3>Пока нет ни одной отправки</h3>
      <p>Загрузите Excel от бухгалтера — сервис сам разберёт бренды, модели, цвета и размеры.<br>Или создайте отправку вручную.</p>
      <label class="btn btn-primary">📄 Загрузить Excel<input type="file" accept=".xlsx,.xls" onchange="importFile(this)"></label></div>`;
    return;
  }
  if (!list.length) { root.innerHTML = '<div class="empty"><div class="empty-ico">🔍</div><h3>Ничего не найдено</h3><p>Измените поиск или фильтры</p></div>'; return; }

  const months = new Map();
  for (const sh of list) {
    const key = sh.ship_date ? sh.ship_date.slice(0, 7) : '';
    if (!months.has(key)) months.set(key, []);
    months.get(key).push(sh);
  }
  let html = '';
  for (const [key, items] of months) {
    const label = key ? toDate(`${key}-01`).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) : 'Без даты';
    const units = items.reduce((a, s) => a + (s.total_qty || 0), 0);
    html += `<div class="month">${esc(label)} <span>· ${items.length} отпр. · ${num(units)} ед.</span></div><div class="list">`;
    for (const sh of items) {
      const d = toDate(sh.ship_date);
      const brands = (sh.blocks || []).map(b => `<span class="chip"><b>${esc(b.brand || '—')}</b> ${num(brandSums(b).ship)}</span>`).join('');
      html += `<div class="ship" data-id="${sh.id}">
        <div class="ship-date">${d ? `<div class="ship-day">${d.getDate()}</div><div class="ship-mon">${esc(d.toLocaleDateString('ru-RU', { month: 'short' }).replace('.', ''))}</div>` : '<div class="ship-day">—</div>'}</div>
        <div class="ship-main">
          <div class="ship-title">${esc(sh.title)} ${sh.fulfillment ? `<span class="badge ff">${esc(sh.fulfillment)}</span>` : ''}</div>
          <div class="ship-brands">${brands || '<span class="chip">пусто</span>'}</div>
        </div>
        <div class="ship-right">
          <div class="ship-qty">${num(sh.total_qty)} <small>ед.</small></div>
          <div class="badges">${sh.return_qty ? `<span class="badge ret">↩ ${num(sh.return_qty)}</span>` : ''}<span class="badge st-${sh.status}">${STATUS[sh.status] || sh.status}</span>${syncBadge(sh)}</div>
        </div>
      </div>`;
    }
    html += '</div>';
  }
  root.innerHTML = html;
}

// ── Просмотр ──
// Телефон: цвета строками, размеры колонками — помещается в ширину экрана
function matrixHtmlMobile(g) {
  const sizes = g.sizes || [];
  const head = sizes.map(sz => `<th>${esc(sz)}</th>`).join('');
  const rows = g.items.map(it => `<tr><td><span class="clr">${esc(it.color || '—')}</span>${it.article ? `<span class="art">${esc(it.article)}</span>` : ''}</td>
    ${sizes.map(sz => { const q = +it.qty?.[sz] || 0; return `<td class="${q ? '' : 'zero'}">${q || '—'}</td>`; }).join('')}
    <td class="rt">${num(itemSum(it))}</td></tr>`).join('');
  const tot = sizes.map(sz => `<td>${num(g.items.reduce((a, it) => a + (+it.qty?.[sz] || 0), 0))}</td>`).join('');
  return `<table class="mx mx-m"><thead><tr><th>Цвет</th>${head}<th>Σ</th></tr></thead>
    <tbody>${rows}<tr class="tot"><td>Общ:</td>${tot}<td class="rt">${num(groupSum(g))}</td></tr></tbody></table>`;
}

function matrixHtml(g) {
  if (isMobile()) return matrixHtmlMobile(g);
  const sizes = g.sizes || [];
  const head = g.items.map(it => `<th><span class="clr">${esc(it.color || '—')}</span>${it.article ? `<span class="art">Арт. ${esc(it.article)}</span>` : ''}</th>`).join('');
  const rows = sizes.map(sz => {
    let rt = 0;
    const cells = g.items.map(it => { const q = +it.qty?.[sz] || 0; rt += q; return `<td class="${q ? '' : 'zero'}">${q || '—'}</td>`; }).join('');
    return `<tr><td>${esc(sz)}</td>${cells}<td class="rt">${rt || '—'}</td></tr>`;
  }).join('');
  const tot = g.items.map(it => `<td>${num(itemSum(it))}</td>`).join('');
  return `<div class="mx-wrap"><table class="mx"><thead><tr><th>Размер</th>${head}<th>Итого</th></tr></thead>
    <tbody>${rows}<tr class="tot"><td>Общ:</td>${tot}<td class="rt">${num(groupSum(g))}</td></tr></tbody></table></div>`;
}

function openView(id) {
  const sh = S.list.find(s => s.id === id);
  if (!sh) return;
  S.viewId = id;
  const sums = shipSums(sh);
  const gLink = S.google.configured && sh.sheet_gid !== null && sh.sheet_gid !== undefined
    ? `${S.google.spreadsheet_url}#gid=${sh.sheet_gid}` : null;
  const brands = (sh.blocks || []).map(b => {
    const bs = brandSums(b);
    const groups = (b.groups || []).map(g => `<div class="grp">
        <div class="grp-title">${g.kind === 'return' ? '<span class="badge ret">Возврат</span>' : ''}${esc(g.model || 'Модель')}<span class="sum">${num(groupSum(g))} ед.</span></div>
        ${matrixHtml(g)}</div>`).join('');
    return `<div class="brand-sec">
      <div class="brand-head"><div><div class="brand-name">${esc(b.brand || 'Без бренда')}</div><div class="brand-owner">${esc(b.owner || '')}${b.date && b.date !== sh.ship_date ? ' · ' + fmtDate(b.date) : ''}</div></div>
      <div class="brand-total"><b>${num(bs.ship)}</b> ед.${bs.ret ? ` · ↩ ${num(bs.ret)}` : ''}</div></div>${groups}</div>`;
  }).join('');

  $('view-box').innerHTML = `
    <div class="m-head"><div>
      <h2>${esc(sh.title)}</h2>
      <div class="m-sub">${sh.ship_date ? `📅 ${fmtDate(sh.ship_date)}` : ''}
        ${sh.fulfillment ? `<span class="badge ff">${esc(sh.fulfillment)}</span>` : ''}
        <span class="badge st-${sh.status}">${STATUS[sh.status] || ''}</span> ${syncBadge(sh)}
        ${sh.created_by_name ? `<span class="desk-only">· создал ${esc(sh.created_by_name)}</span>` : ''}</div>
    </div><button class="m-close" data-close="ov-view">×</button></div>
    <div class="m-body">
      ${sh.sync_error ? `<div class="err-box">Не удалось выгрузить в Google: ${esc(sh.sync_error)}</div>` : ''}
      ${sh.comment ? `<div class="comment">${esc(sh.comment)}</div>` : ''}
      ${brands || '<div class="empty">Пустая отправка</div>'}
    </div>
    <div class="m-foot">
      ${isAdmin() ? `<button class="btn btn-danger btn-sm" id="v-del">Удалить</button>` : ''}
      <div class="grow"></div>
      <span class="total-big">Итого:<b>${num(sums.ship)} ед.</b>${sums.ret ? ` · возвраты ${num(sums.ret)}` : ''}</span>
      ${gLink ? `<a class="btn btn-ghost" href="${gLink}" target="_blank" rel="noopener">Открыть лист ↗</a>` : ''}
      ${S.google.configured ? `<button class="btn btn-ghost" id="v-sync">⟳ В Google</button>` : ''}
      <button class="btn btn-ghost" id="v-dup">Дублировать</button>
      <button class="btn btn-primary" id="v-edit">Редактировать</button>
    </div>`;
  openOv('ov-view');

  $('v-edit').onclick = () => { closeOv('ov-view'); openEditor(sh); };
  $('v-dup').onclick = () => {
    const copy = clone(sh);
    copy.ship_date = todayIso();
    copy.status = 'draft';
    for (const b of copy.blocks || []) { b.date = null; for (const g of b.groups) for (const it of g.items) it.qty = {}; }
    closeOv('ov-view');
    openEditor(copy, { asNew: true, autoTitle: true });
    toast('Скопированы бренды, модели и цвета — заполните количество');
  };
  if ($('v-sync')) $('v-sync').onclick = async e => {
    e.target.disabled = true; e.target.innerHTML = '<span class="spin"></span> Выгрузка';
    try {
      const row = await API.post(`/shipments/${sh.id}/sync`);
      replaceRow(row);
      toast(row.sync_error ? 'Ошибка: ' + row.sync_error : 'Лист в Google обновлён', row.sync_error ? 'err' : 'ok');
      openView(sh.id);
    } catch (err) { toast(err.message, 'err'); e.target.disabled = false; }
  };
  if ($('v-del')) $('v-del').onclick = async () => {
    if (!confirm(`Удалить отправку «${sh.title}»?`)) return;
    const withSheet = gLink && confirm('Удалить и лист этой отправки в Google Таблице?\n\nОК — удалить лист, Отмена — оставить лист в таблице.');
    try {
      await API.delete(`/shipments/${sh.id}${withSheet ? '?sheet=1' : ''}`);
      S.list = S.list.filter(s => s.id !== sh.id);
      closeOv('ov-view'); renderFfFilter(); renderList();
      toast('Отправка удалена', 'ok');
    } catch (err) { toast(err.message, 'err'); }
  };
}

function replaceRow(row) {
  const i = S.list.findIndex(s => s.id === row.id);
  if (i >= 0) S.list[i] = row; else S.list.unshift(row);
  S.list.sort((a, b) => (b.ship_date || '').localeCompare(a.ship_date || '') || (b.created_at || '').localeCompare(a.created_at || ''));
}

// ── Редактор ──
const newItem = () => ({ color: '', article: '', qty: {} });
const newGroup = () => ({ model: '', kind: 'ship', sizes: ['XS', 'S', 'M', 'L'], items: [newItem()] });
const newBrand = () => ({ brand: '', owner: '', date: null, groups: [newGroup()] });

function openEditor(sh, { asNew = false, autoTitle: auto = false } = {}) {
  S.editingId = sh && !asNew ? sh.id : null;
  S.draft = sh ? clone(sh) : { title: '', ship_date: todayIso(), fulfillment: '', status: 'sent', comment: '', blocks: [newBrand()] };
  delete S.draft._blob;
  if (!S.draft.blocks || !S.draft.blocks.length) S.draft.blocks = [newBrand()];
  S.titleAuto = !sh || auto;
  if (S.titleAuto) S.draft.title = autoTitle(S.draft);
  S.dirty = false;
  S.collapsed = new Set();

  // Восстановление черновика, если вкладку закрыли/перезагрузили, не сохранив
  const saved = readLocalDraft();
  if (saved && saved.id === S.editingId && Date.now() - saved.ts < 3 * 864e5 &&
      confirm(`Найден несохранённый черновик «${saved.draft.title || 'Отправка'}» от ${new Date(saved.ts).toLocaleString('ru-RU')}. Восстановить?`)) {
    S.draft = saved.draft;
    S.titleAuto = false;
    S.dirty = true;
  } else if (saved && saved.id === S.editingId) {
    clearLocalDraft();
  }
  renderEditor();
  openOv('ov-edit');
}

function readLocalDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { return null; }
}
function clearLocalDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch {}
}
let draftTimer;
function storeLocalDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    if (!S.draft || !S.dirty) return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ id: S.editingId, ts: Date.now(), draft: S.draft })); } catch {}
  }, 400);
}

function renderEditor() {
  const d = S.draft;
  const brands = d.blocks.map((b, bi) => {
    const groups = b.groups.map((g, gi) => (isMobile() ? editorGroupMobile : editorGroup)(g, bi, gi)).join('');
    return `<div class="ed-brand ${S.collapsed.has(bi) ? 'collapsed' : ''}">
      <button class="ed-brand-bar" data-act="toggle-brand" data-b="${bi}">
        <span class="chev">▾</span><span class="bb-name">${esc(b.brand || 'Новый бренд')}</span>
        <span class="bb-sum"><b data-bt="${bi}">0</b> ед.</span></button>
      <div class="ed-brand-top">
        <div class="field"><label>Бренд</label><input class="inp" list="dl-brand" data-bf="brand" data-b="${bi}" value="${esc(b.brand)}" placeholder="AESTA"></div>
        <div class="field"><label>Владелец (ИП)</label><input class="inp" list="dl-owner" data-bf="owner" data-b="${bi}" value="${esc(b.owner)}" placeholder="ИП Нурланова А."></div>
        <div class="field"><label>Дата (если другая)</label><input class="inp" type="date" data-bf="date" data-b="${bi}" value="${esc(b.date || '')}"></div>
        <div style="display:flex;gap:4px;align-items:center;padding-bottom:4px">
          <span class="total-big desk-only" style="white-space:nowrap"><b data-bt="${bi}">0</b> ед.</span>
          <button class="icon-btn" title="Дублировать бренд" data-act="dup-brand" data-b="${bi}" style="color:var(--g)">⧉</button>
          <button class="icon-btn" title="Удалить бренд" data-act="del-brand" data-b="${bi}">🗑</button>
        </div>
      </div>
      ${groups}
      <div class="add-row"><button class="add-dashed" data-act="add-group" data-b="${bi}">+ Модель</button></div>
    </div>`;
  }).join('');

  $('edit-box').innerHTML = `
    <div class="m-head"><div><h2>${S.editingId ? 'Редактирование отправки' : 'Новая отправка'}</h2>
      <div class="m-sub">${S.google.configured ? 'После сохранения лист в Google Таблице обновится автоматически' : 'Google Таблица не подключена — данные сохранятся только в сервисе'}</div></div>
      <button class="m-close" data-act="close">×</button></div>
    <div class="m-body">
      ${(d.warnings || []).length ? `<div class="warn"><b>⚠ Расхождения в файле бухгалтера</b>${d.warnings.map(esc).join('<br>')}</div>` : ''}
      <div class="fgrid">
        <div class="field"><label>Название (имя листа)</label><input class="inp" data-top="title" value="${esc(d.title)}"></div>
        <div class="field"><label>Дата отправки</label><input class="inp" type="date" data-top="ship_date" value="${esc(d.ship_date || '')}"></div>
        <div class="field"><label>Фулфилмент</label><input class="inp" list="dl-ff" data-top="fulfillment" value="${esc(d.fulfillment)}" placeholder="Азамат ФФ"></div>
        <div class="field"><label>Статус</label><select class="inp" data-top="status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${d.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label>Комментарий</label><input class="inp" data-top="comment" value="${esc(d.comment)}" placeholder="Накладная, водитель, примечания…"></div>
      ${brands}
      <div class="add-row"><button class="add-dashed" data-act="add-brand">+ Бренд / ИП</button></div>
    </div>
    <div class="m-foot">
      <button class="btn btn-ghost desk-only" data-act="close">Отмена</button>
      <div class="grow desk-only"></div>
      <span class="total-big"><span class="desk-only">Итого к отправке:</span><span class="mob-only">Итого</span><b id="ed-total">0</b></span>
      <button class="btn btn-primary" data-act="save" id="ed-save">Сохранить</button>
    </div>`;
  updateTotals();
}

function editorGroup(g, bi, gi) {
  const k = `data-b="${bi}" data-g="${gi}"`;
  const heads = g.items.map((it, ii) => `<th><div class="colhead">
      <input class="inp c" list="dl-color" placeholder="Цвет" data-if="color" ${k} data-i="${ii}" value="${esc(it.color)}">
      <input class="inp" placeholder="Артикул" data-if="article" ${k} data-i="${ii}" value="${esc(it.article)}">
      <button class="icon-btn" title="Удалить цвет" data-act="del-col" ${k} data-i="${ii}">×</button></div></th>`).join('');
  const rows = g.sizes.map((sz, si) => `<tr><td>${esc(sz)}</td>${g.items.map((it, ii) =>
      `<td><input class="inp q" type="number" min="0" inputmode="numeric" placeholder="—" data-q="${esc(sz)}" data-si="${si}" ${k} data-i="${ii}" value="${it.qty?.[sz] || ''}"></td>`).join('')}
      <td class="rt" data-rt="${bi}-${gi}-${si}">0</td><td></td></tr>`).join('');
  const tots = g.items.map((_, ii) => `<td data-ct="${bi}-${gi}-${ii}">0</td>`).join('');
  return `<div class="ed-grp ${g.kind === 'return' ? 'is-ret' : ''}">
    <div class="ed-grp-top">
      <input class="inp" list="dl-model" placeholder="Модель (напр. «2-х лямка цветок»)" data-gf="model" ${k} value="${esc(g.model)}">
      <div class="seg"><button class="${g.kind !== 'return' ? 'on' : ''}" data-act="kind" data-kind="ship" ${k}>Отгрузка</button><button class="${g.kind === 'return' ? 'on' : ''}" data-act="kind" data-kind="return" ${k}>Возврат</button></div>
      <span class="total-big"><b data-gt="${bi}-${gi}">0</b> ед.</span>
      <button class="icon-btn" title="Удалить модель" data-act="del-group" ${k}>🗑</button>
    </div>
    ${sizesRowHtml(g, k)}
    <div class="mx-wrap"><table class="ed"><thead><tr><th>Размер</th>${heads}<th>Итого</th><th><button class="addcol" data-act="add-col" ${k} title="Добавить цвет">+</button></th></tr></thead>
      <tbody>${rows}<tr class="tot"><td>Общ:</td>${tots}<td class="rt" data-gt2="${bi}-${gi}">0</td><td></td></tr></tbody></table></div>
  </div>`;
}

function sizesRowHtml(g, k) {
  return `<div class="sizes-row">Размеры:
      ${g.sizes.map(s => `<span class="sz">${esc(s)}<button data-act="del-size" data-s="${esc(s)}" ${k} title="Убрать размер">×</button></span>`).join('')}
      <input class="inp sz-add" placeholder="+ размер" data-addsize ${k} enterkeyhint="done" autocapitalize="characters">
      ${SIZE_PRESETS.map(p => `<button class="preset" data-act="preset" data-sizes="${p.join(',')}" ${k}>${p[0]}–${p[p.length - 1]}</button>`).join('')}
    </div>`;
}

// Телефон: каждый цвет — карточка с полями размеров в сетке
function editorGroupMobile(g, bi, gi) {
  const k = `data-b="${bi}" data-g="${gi}"`;
  const cards = g.items.map((it, ii) => `<div class="mc">
      <div class="mc-top">
        <input class="inp c" list="dl-color" placeholder="Цвет" data-if="color" ${k} data-i="${ii}" value="${esc(it.color)}" enterkeyhint="next">
        <button class="icon-btn mc-del" title="Удалить цвет" data-act="del-col" ${k} data-i="${ii}">×</button>
        <input class="inp mc-art" placeholder="Артикул" data-if="article" ${k} data-i="${ii}" value="${esc(it.article)}" enterkeyhint="next">
      </div>
      <div class="mc-sizes">${g.sizes.map((sz, si) => `<label class="mq"><span>${esc(sz)}</span>
        <input class="inp q" type="number" min="0" inputmode="numeric" pattern="[0-9]*" enterkeyhint="next" placeholder="—" data-q="${esc(sz)}" data-si="${si}" ${k} data-i="${ii}" value="${it.qty?.[sz] || ''}"></label>`).join('')}</div>
      <div class="mc-foot">
        <input class="inp mc-fill" type="number" min="0" inputmode="numeric" pattern="[0-9]*" placeholder="Всем размерам…" data-fill ${k} data-i="${ii}" enterkeyhint="done">
        ${ii ? `<button class="btn btn-soft btn-sm" data-act="copy-prev" ${k} data-i="${ii}" title="Скопировать количество из цвета выше">⧉ как выше</button>` : ''}
        <span class="mc-sum">Σ <b data-ct="${bi}-${gi}-${ii}">0</b></span>
      </div>
    </div>`).join('');
  return `<div class="ed-grp ${g.kind === 'return' ? 'is-ret' : ''}">
    <div class="ed-grp-top">
      <input class="inp" list="dl-model" placeholder="Модель (напр. «2-х лямка цветок»)" data-gf="model" ${k} value="${esc(g.model)}">
      <div class="seg"><button class="${g.kind !== 'return' ? 'on' : ''}" data-act="kind" data-kind="ship" ${k}>Отгрузка</button><button class="${g.kind === 'return' ? 'on' : ''}" data-act="kind" data-kind="return" ${k}>Возврат</button></div>
      <span class="total-big"><b data-gt="${bi}-${gi}">0</b> ед.</span>
      <button class="icon-btn" title="Удалить модель" data-act="del-group" ${k}>🗑</button>
    </div>
    ${sizesRowHtml(g, k)}
    ${cards}
    <button class="add-dashed mc-add" data-act="add-col" ${k}>+ Цвет</button>
  </div>`;
}

function updateTotals() {
  const box = $('edit-box');
  let total = 0;
  S.draft.blocks.forEach((b, bi) => {
    const bs = brandSums(b);
    total += bs.ship;
    box.querySelectorAll(`[data-bt="${bi}"]`).forEach(el => (el.textContent = num(bs.ship) + (bs.ret ? ` (+↩${num(bs.ret)})` : '')));
    b.groups.forEach((g, gi) => {
      const gs = num(groupSum(g));
      box.querySelectorAll(`[data-gt="${bi}-${gi}"],[data-gt2="${bi}-${gi}"]`).forEach(el => (el.textContent = gs));
      g.items.forEach((it, ii) => { const el = box.querySelector(`[data-ct="${bi}-${gi}-${ii}"]`); if (el) el.textContent = num(itemSum(it)); });
      g.sizes.forEach((sz, si) => {
        const el = box.querySelector(`[data-rt="${bi}-${gi}-${si}"]`);
        if (el) el.textContent = num(g.items.reduce((a, it) => a + (+it.qty?.[sz] || 0), 0));
      });
    });
  });
  $('ed-total').textContent = num(total) + ' ед.';
}

// Подсказки по истории: владелец бренда и последний состав модели
function knownOwner(brand) {
  const key = brand.trim().toLowerCase();
  for (const sh of S.list) for (const b of sh.blocks || []) if (b.brand.toLowerCase() === key && b.owner) return b.owner;
  return '';
}
function lastGroup(brand, model) {
  const bk = brand.trim().toLowerCase(), mk = model.trim().toLowerCase();
  let fallback = null;
  for (const sh of S.list) for (const b of sh.blocks || []) for (const g of b.groups || []) {
    if (g.model.toLowerCase() !== mk || !g.items.length) continue;
    if (b.brand.toLowerCase() === bk) return g;
    fallback = fallback || g;
  }
  return fallback;
}

function editorInput(e) {
  const t = e.target, d = S.draft, ds = t.dataset;
  const b = ds.b !== undefined ? d.blocks[+ds.b] : null;
  const g = b && ds.g !== undefined ? b.groups[+ds.g] : null;
  if (ds.top) {
    d[ds.top] = t.value;
    if (ds.top === 'title') S.titleAuto = false;
    if (S.titleAuto && (ds.top === 'ship_date' || ds.top === 'fulfillment')) {
      d.title = autoTitle(d);
      $('edit-box').querySelector('[data-top="title"]').value = d.title;
    }
  } else if (ds.bf) {
    b[ds.bf] = t.value || (ds.bf === 'date' ? null : '');
    if (ds.bf === 'brand') t.closest('.ed-brand').querySelector('.bb-name').textContent = t.value || 'Новый бренд';
  } else if (ds.gf) {
    g[ds.gf] = t.value;
  } else if (ds.if) {
    g.items[+ds.i][ds.if] = t.value;
  } else if (ds.q !== undefined) {
    const v = Math.max(0, Math.round(+t.value || 0));
    const qty = g.items[+ds.i].qty;
    if (v) qty[ds.q] = v; else delete qty[ds.q];
    updateTotals();
  } else if (ds.fill !== undefined) {
    const v = Math.max(0, Math.round(+t.value || 0));
    const it = g.items[+ds.i];
    it.qty = {};
    g.sizes.forEach(sz => { if (v) it.qty[sz] = v; });
    $('edit-box').querySelectorAll(`[data-q][data-b="${ds.b}"][data-g="${ds.g}"][data-i="${ds.i}"]`).forEach(el => (el.value = v || ''));
    updateTotals();
  } else return;
  S.dirty = true;
  storeLocalDraft();
}

function editorChange(e) {
  const t = e.target, ds = t.dataset, d = S.draft;
  if (ds.bf === 'brand') {
    const b = d.blocks[+ds.b];
    if (!b.owner && b.brand) {
      const o = knownOwner(b.brand);
      if (o) { b.owner = o; $('edit-box').querySelector(`[data-bf="owner"][data-b="${ds.b}"]`).value = o; }
    }
  }
  if (ds.gf === 'model') {
    const b = d.blocks[+ds.b], g = b.groups[+ds.g];
    const empty = g.items.every(it => !it.color && !it.article && !itemSum(it));
    const prev = empty && g.model && lastGroup(b.brand, g.model);
    if (prev) {
      g.sizes = [...prev.sizes];
      g.items = prev.items.map(it => ({ color: it.color, article: it.article, qty: {} }));
      renderEditor();
      toast('Цвета, артикулы и размеры подставлены из прошлой отправки');
    }
  }
}

function editorKey(e) {
  const t = e.target;
  if (t.dataset.addsize !== undefined && e.key === 'Enter') {
    e.preventDefault();
    const g = S.draft.blocks[+t.dataset.b].groups[+t.dataset.g];
    const vals = t.value.split(/[,;\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
    for (const v of vals) if (!g.sizes.includes(v)) g.sizes.push(v);
    S.dirty = true;
    renderEditor();
    const again = $('edit-box').querySelector(`[data-addsize][data-b="${t.dataset.b}"][data-g="${t.dataset.g}"]`);
    if (again) again.focus();
    return;
  }
  // Навигация по матрице: Enter/↓ — вниз, ↑ — вверх
  if (t.dataset.q !== undefined && ['Enter', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
    e.preventDefault();
    const si = +t.dataset.si + (e.key === 'ArrowUp' ? -1 : 1);
    const sel = (i, s) => $('edit-box').querySelector(`[data-q][data-b="${t.dataset.b}"][data-g="${t.dataset.g}"][data-i="${i}"][data-si="${s}"]`);
    // Конец столбца → первый размер следующего цвета
    const next = sel(t.dataset.i, si) || (e.key !== 'ArrowUp' && sel(+t.dataset.i + 1, 0));
    if (next) { next.focus(); next.select(); } else t.blur();
  }
  if (t.dataset.fill !== undefined && e.key === 'Enter') { e.preventDefault(); t.blur(); }
}

function editorClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act, d = S.draft;
  const bi = +el.dataset.b, gi = +el.dataset.g;
  const g = d.blocks[bi]?.groups[gi];
  switch (act) {
    case 'close': return closeEditor();
    case 'save': return saveDraft();
    case 'add-brand':
      // На телефоне сворачиваем заполненные бренды, чтобы не листать
      if (isMobile()) d.blocks.forEach((_, i) => S.collapsed.add(i));
      d.blocks.push(newBrand());
      break;
    case 'dup-brand': {
      const copy = clone(d.blocks[bi]);
      copy.brand = ''; copy.owner = '';
      for (const gg of copy.groups) for (const it of gg.items) it.qty = {};
      d.blocks.splice(bi + 1, 0, copy);
      toast('Модели и цвета скопированы — укажите бренд и количество');
      break;
    }
    case 'del-brand':
      if (d.blocks[bi].groups.some(x => groupSum(x)) && !confirm(`Удалить бренд «${d.blocks[bi].brand || 'без названия'}» со всеми моделями?`)) return;
      d.blocks.splice(bi, 1);
      S.collapsed = new Set();
      if (!d.blocks.length) d.blocks.push(newBrand());
      break;
    case 'add-group': d.blocks[bi].groups.push(newGroup()); break;
    case 'del-group':
      if (groupSum(g) && !confirm(`Удалить модель «${g.model || 'без названия'}»?`)) return;
      d.blocks[bi].groups.splice(gi, 1);
      break;
    case 'kind': g.kind = el.dataset.kind; break;
    case 'add-col': g.items.push(newItem()); break;
    case 'del-col':
      if (itemSum(g.items[+el.dataset.i]) && !confirm('Удалить цвет вместе с количеством?')) return;
      g.items.splice(+el.dataset.i, 1);
      if (!g.items.length) g.items.push(newItem());
      break;
    case 'del-size': {
      const s = el.dataset.s;
      g.sizes = g.sizes.filter(x => x !== s);
      g.items.forEach(it => delete it.qty[s]);
      break;
    }
    case 'preset': {
      const ps = el.dataset.sizes.split(',');
      const extra = g.sizes.filter(s => !ps.includes(s) && g.items.some(it => it.qty[s]));
      g.sizes = [...ps, ...extra];
      break;
    }
    case 'toggle-brand':
      S.collapsed.has(bi) ? S.collapsed.delete(bi) : S.collapsed.add(bi);
      renderEditor();
      return;
    case 'copy-prev': {
      const ii = +el.dataset.i;
      g.items[ii].qty = { ...g.items[ii - 1].qty };
      break;
    }
    default: return;
  }
  S.dirty = true;
  storeLocalDraft();
  renderEditor();
  if (act === 'add-brand') {
    const cards = $('edit-box').querySelectorAll('.ed-brand');
    cards[cards.length - 1].scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  if (act === 'add-col') {
    const heads = $('edit-box').querySelectorAll(`[data-if="color"][data-b="${bi}"][data-g="${gi}"]`);
    const last = heads[heads.length - 1];
    if (last) { last.focus(); last.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }
}

function closeEditor() {
  if (S.dirty && !confirm('Закрыть без сохранения? Изменения будут потеряны.')) return;
  clearTimeout(draftTimer);
  clearLocalDraft();
  closeOv('ov-edit');
  S.draft = null;
  if (S.importIdx !== null) { S.importIdx = null; if (S.imports.length) renderImport(); }
}

async function saveDraft() {
  const d = S.draft;
  const hasQty = d.blocks.some(b => b.groups.some(g => groupSum(g)));
  if (!hasQty && !confirm('В отправке нет ни одной единицы. Всё равно сохранить?')) return;
  const btn = $('ed-save');
  btn.disabled = true;
  btn.innerHTML = `<span class="spin"></span> ${S.google.configured ? 'Сохранение и выгрузка…' : 'Сохранение…'}`;
  const body = { title: d.title, ship_date: d.ship_date, fulfillment: d.fulfillment, status: d.status, comment: d.comment, blocks: d.blocks };
  try {
    const row = S.editingId ? await API.put(`/shipments/${S.editingId}`, body) : await API.post('/shipments', body);
    replaceRow(row);
    S.dirty = false;
    clearTimeout(draftTimer);
    clearLocalDraft();
    closeOv('ov-edit');
    if (S.importIdx !== null) { S.imports.splice(S.importIdx, 1); S.importIdx = null; }
    fillDatalists(); renderFfFilter(); renderList();
    if (row.sync_error) toast('Сохранено, но не выгружено в Google: ' + row.sync_error, 'err');
    else toast(S.google.configured ? 'Сохранено и выгружено в Google Таблицу' : 'Сохранено', 'ok');
    if (S.imports.length) renderImport(); else openView(row.id);
  } catch (err) {
    toast(err.message, 'err');
    btn.disabled = false; btn.textContent = 'Сохранить';
  }
}

// ── Импорт из Excel ──
async function importFile(input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  toast('Разбираю файл…');
  try {
    const parsed = await API.upload('/shipments/parse', fd);
    S.imports = parsed.map(p => {
      const dup = S.list.some(s => s.title.trim().toLowerCase() === p.title.trim().toLowerCase() && (s.ship_date || '') === (p.ship_date || ''));
      return { ...p, status: 'sent', comment: '', dup, selected: !dup };
    });
    renderImport();
  } catch (err) { toast(err.message, 'err'); }
}
window.importFile = importFile;

function renderImport() {
  const items = S.imports.map((p, i) => `<div class="imp">
      <input type="checkbox" data-imp="${i}" ${p.selected ? 'checked' : ''}>
      <div class="imp-main">
        <div class="imp-title">${esc(p.title)} ${p.dup ? '<span class="badge st-draft">уже есть в сервисе</span>' : ''}</div>
        <div class="imp-meta">${p.ship_date ? fmtDate(p.ship_date) + ' · ' : ''}${p.fulfillment ? esc(p.fulfillment) + ' · ' : ''}<b>${num(p.total_qty)} ед.</b>${p.return_qty ? ` · ↩ ${num(p.return_qty)}` : ''}</div>
        <div class="ship-brands">${p.blocks.map(b => `<span class="chip"><b>${esc(b.brand)}</b> ${num(brandSums(b).ship)}</span>`).join('')}</div>
        ${p.warnings.length ? `<div class="warn"><b>⚠ Проверьте — в файле не сходятся итоги:</b>${p.warnings.map(esc).join('<br>')}</div>` : ''}
      </div>
      <button class="btn btn-soft btn-sm" data-impedit="${i}">Проверить и изменить</button>
    </div>`).join('');
  const n = S.imports.filter(p => p.selected).length;
  $('import-box').innerHTML = `
    <div class="m-head"><div><h2>Импорт из Excel</h2><div class="m-sub">Найдено отправок: ${S.imports.length}. Каждый лист файла — отдельная отправка.</div></div>
      <button class="m-close" data-close="ov-import">×</button></div>
    <div class="m-body">${items || '<div class="empty">Всё импортировано 🎉</div>'}</div>
    <div class="m-foot"><button class="btn btn-ghost" data-close="ov-import">Закрыть</button><div class="grow"></div>
      <button class="btn btn-primary" id="imp-go" ${n ? '' : 'disabled'}>Импортировать выбранные (${n})</button></div>`;
  openOv('ov-import');
  $('import-box').querySelectorAll('[data-imp]').forEach(cb => cb.onchange = () => { S.imports[+cb.dataset.imp].selected = cb.checked; renderImport(); });
  $('import-box').querySelectorAll('[data-impedit]').forEach(btn => btn.onclick = () => {
    const i = +btn.dataset.impedit;
    closeOv('ov-import');
    openEditor(S.imports[i], { asNew: true });
    S.importIdx = i;
  });
  $('imp-go').onclick = async () => {
    const btn = $('imp-go');
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> Импорт…';
    let ok = 0;
    for (const p of S.imports.filter(x => x.selected)) {
      try {
        const row = await API.post('/shipments', { title: p.title, ship_date: p.ship_date, fulfillment: p.fulfillment, status: p.status, comment: p.comment, blocks: p.blocks });
        replaceRow(row); ok++;
        p.done = true;
        if (row.sync_error) toast(`«${row.title}» не выгружена в Google: ${row.sync_error}`, 'err');
      } catch (err) { toast(`«${p.title}»: ${err.message}`, 'err'); }
    }
    S.imports = S.imports.filter(p => !p.done);
    fillDatalists(); renderFfFilter(); renderList();
    toast(`Импортировано отправок: ${ok}`, 'ok');
    if (S.imports.length) renderImport(); else closeOv('ov-import');
  };
}

// ── Google: справка, синхронизация, импорт ──
function renderHelp() {
  $('help-box').innerHTML = `
    <div class="m-head"><div><h2>Подключение Google Таблицы</h2><div class="m-sub">Один раз, ~5 минут. Делает администратор сервера.</div></div>
      <button class="m-close" data-close="ov-help">×</button></div>
    <div class="m-body help">
      <ol>
        <li>Откройте <a href="https://console.cloud.google.com/" target="_blank" rel="noopener">Google Cloud Console</a>, создайте проект и включите <b>Google Sheets API</b>.</li>
        <li>IAM → <b>Сервисные аккаунты</b> → создать → вкладка «Ключи» → «Добавить ключ» → JSON. Скачается файл.</li>
        <li>Откройте таблицу «Отправки» → «Настройки доступа» → добавьте e-mail сервисного аккаунта (<code>…@….iam.gserviceaccount.com</code>) с ролью <b>Редактор</b>.</li>
        <li>На сервере задайте переменные окружения:<br>
          <code>GOOGLE_SERVICE_ACCOUNT_JSON</code> — содержимое JSON-ключа (целиком или в base64)<br>
          <code>GOOGLE_SHEETS_SHIPMENTS_ID</code> — ID таблицы (по умолчанию: <code>${esc(S.google.spreadsheet_id || '')}</code>)</li>
        <li>Перезапустите бэкенд — индикатор станет зелёным.</li>
      </ol>
    </div>
    <div class="m-foot"><div class="grow"></div><button class="btn btn-primary" data-close="ov-help">Понятно</button></div>`;
  openOv('ov-help');
}

async function googleSyncAll(btn) {
  if (!confirm('Перезаписать листы всех отправок в Google Таблице данными из сервиса?')) return;
  btn.disabled = true; const label = btn.textContent; btn.innerHTML = '<span class="spin"></span> Синхронизация…';
  try {
    const r = await API.post('/shipments/google/sync-all');
    toast(`Обновлено листов: ${r.ok}${r.errors.length ? `, ошибок: ${r.errors.length}` : ''}`, r.errors.length ? 'err' : 'ok');
    await load();
  } catch (err) { toast(err.message, 'err'); }
  btn.disabled = false; btn.textContent = label;
}

async function googleImport(btn) {
  if (!confirm('Создать отправки из листов Google Таблицы, которых ещё нет в сервисе?\nЛисты будут привязаны: при редактировании в сервисе они перезапишутся в едином формате.')) return;
  btn.disabled = true; const label = btn.textContent; btn.innerHTML = '<span class="spin"></span> Читаю таблицу…';
  try {
    const r = await API.post('/shipments/google/import');
    const warns = r.created.flatMap(c => c.warnings || []);
    toast(`Добавлено отправок: ${r.created.length}${r.skipped.length ? `, пропущено листов: ${r.skipped.length}` : ''}`, 'ok');
    if (warns.length) toast('Расхождения в итогах: ' + warns.slice(0, 3).join('; ') + (warns.length > 3 ? '…' : ''), 'err');
    await load();
  } catch (err) { toast(err.message, 'err'); }
  btn.disabled = false; btn.textContent = label;
}

// ── Инициализация ──
document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;
  const user = getUser();
  $('nav-user-name').textContent = user?.username || '';
  if (isAdmin()) $('nav-admin').style.display = '';
  $('btn-theme').onclick = () => localStorage.setItem('theme', document.documentElement.classList.toggle('dark') ? 'dark' : 'light');
  $('btn-logout').onclick = logout;

  $('btn-new').onclick = () => openEditor(null);
  $('file-import').onchange = e => importFile(e.target);
  $('btn-gsync').onclick = e => googleSyncAll(e.currentTarget);
  $('btn-gimport').onclick = e => googleImport(e.currentTarget);

  let tm;
  $('f-search').oninput = e => { clearTimeout(tm); tm = setTimeout(() => { S.filter.q = e.target.value; renderList(); }, 120); };
  $('f-ff').onchange = e => { S.filter.ff = e.target.value; renderList(); };
  $('f-status').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    S.filter.status = b.dataset.v;
    $('f-status').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    renderList();
  };
  $('list').onclick = e => { const card = e.target.closest('.ship'); if (card) openView(card.dataset.id); };

  const eb = $('edit-box');
  eb.addEventListener('input', editorInput);
  eb.addEventListener('change', editorChange);
  eb.addEventListener('keydown', editorKey);
  eb.addEventListener('click', editorClick);

  // Закрытие модалок: крестик / клик по фону / Esc
  document.addEventListener('click', e => {
    const c = e.target.closest('[data-close]');
    if (c) closeOv(c.dataset.close);
    if (e.target.classList.contains('overlay')) e.target.id === 'ov-edit' ? closeEditor() : closeOv(e.target.id);
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const open = [...document.querySelectorAll('.overlay.show')].pop();
    if (open) open.id === 'ov-edit' ? closeEditor() : closeOv(open.id);
  });
  window.addEventListener('beforeunload', e => { if (S.draft && S.dirty) { e.preventDefault(); e.returnValue = ''; } });

  MQ.addEventListener('change', () => {
    if (S.draft && $('ov-edit').classList.contains('show')) renderEditor();
    if (S.viewId && $('ov-view').classList.contains('show')) openView(S.viewId);
  });

  await loadGoogle();
  await load();
});
