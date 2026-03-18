// ─── METRICS ───
const METRICS = [
  { key: 'CTR, %',          col: 'CTR',                                    fmt: 'pct', defPos: 0  },
  { key: 'Конв. в корзину', col: 'Конверсия в корзину, %',                 fmt: 'pct', defPos: 1  },
  { key: 'Конв. в заказ',   col: 'Конверсия в заказ, %',                   fmt: 'pct', defPos: 2  },
  { key: '% выкупа',        col: 'Процент выкупа',                         fmt: 'pct', defPos: 3  },
  { key: 'Показы',          col: 'Показы',                                 fmt: 'n',   defPos: 4  },
  { key: 'Переходы',        col: 'Переходы в карточку',                    fmt: 'n',   defPos: 5  },
  { key: 'В корзину',       col: 'Положили в корзину',                     fmt: 'n',   defPos: 6  },
  { key: 'Заказали, шт',    col: 'Заказали, шт',                           fmt: 'n',   defPos: 7  },
  { key: 'Выкупили, шт',    col: 'Выкупили, шт',                           fmt: 'n',   defPos: 8  },
  { key: 'Отменили, шт',    col: 'Отменили, шт',                           fmt: 'n',   defPos: 9  },
  { key: 'Сумма заказов',   col: 'Заказали на сумму, ₽',                  fmt: 'rub', defPos: 10 },
  { key: 'Выкупили сумма',  col: 'Выкупили на сумму, ₽',                  fmt: 'rub', defPos: 11 },
  { key: 'Динамика заказов',col: 'Динамика суммы заказов, ₽',             fmt: 'rub', defPos: 12 },
  { key: 'Средняя цена',    col: 'Средняя цена, ₽',                       fmt: 'rub', defPos: 13 },
  { key: 'Заказов в день',  col: 'Среднее количество заказов в день, шт',  fmt: 'f1',  defPos: 14 },
];

const COLORS = ['#7C3AED','#F97316','#16A34A','#2563EB','#DB2777','#0891B2','#CA8A04'];

// ─── STATE ───
const S = {
  weeks: [], selW: [],
  selS: new Set(['CTR, %','Конв. в корзину','Конв. в заказ','% выкупа','Показы','Заказали, шт']),
  selC: new Set(['CTR, %','Конв. в корзину','Заказали, шт','Сумма заказов']),
  selG: new Set(['CTR, %','Конв. в корзину','Конв. в заказ','Заказали, шт','% выкупа']),
  colOrder: METRICS.map(m => m.key),
  sortKey: null, sortDir: -1,
  artFilter: null,   // null = все; Set = конкретные артикулы
  allArts: [],
};

// ─── FORMAT ───
function fmt(v, type) {
  if (v === null || v === undefined || v === '') return '—';
  const n = parseFloat(v);
  if (isNaN(n)) return String(v);
  if (type === 'pct') return n.toFixed(1) + '%';
  if (type === 'rub') {
    const a = Math.abs(n), s = n < 0 ? '−' : '';
    return s + (a >= 1e6 ? (a/1e6).toFixed(1)+' млн' : a >= 1e3 ? (a/1e3).toFixed(0)+' тыс' : a.toFixed(0)) + ' ₽';
  }
  if (type === 'f1') return n.toFixed(1);
  if (type === 'n')  return n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(0)+'K' : n.toFixed(0);
  return String(v);
}

// ─── DELTA ───
// pct-метрики → абсолютная разница (в %); числовые → относительное изменение (в %)
function calcDelta(cur, prev, mfmt) {
  const c = parseFloat(cur), p = parseFloat(prev);
  if (isNaN(c) || isNaN(p)) return null;
  if (mfmt === 'pct') return { value: +(c - p).toFixed(10) };
  if (p === 0) return null;
  return { value: +((c - p) / Math.abs(p) * 100).toFixed(10) };
}

function tagHtml(d, title = '') {
  if (d === null) return '';
  const v = d.value, z = Math.abs(v) < 0.005;
  const cls = z ? 'zero' : v > 0 ? 'up' : 'dn';
  const arr = z ? '=' : v > 0 ? '▲' : '▼';
  const abs = Math.abs(v);
  const num = abs < 0.1 && !z ? abs.toFixed(2) : abs % 1 < 0.05 ? abs.toFixed(0) : abs.toFixed(1);
  return `<span class="tag ${cls}" title="${title}">${z ? '= 0%' : arr + num + '%'}</span>`;
}

// ─── PARSE ───
function parseSummary(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  let hi = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].some(c => String(c).trim() === 'Показы')) { hi = i; break; }
  }
  if (hi < 0) return null;
  const h = rows[hi].map(c => String(c).trim()), d = rows[hi + 1] || [], o = {};
  h.forEach((k, i) => { if (k) o[k.replace(/[\u20A0-\u20CF]/g, '₽')] = d[i]; });
  return o;
}

function parseGoods(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  let hi = -1;
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).includes('Артикул')) { hi = i; break; }
  }
  if (hi < 0) return { h: [], rows: [] };
  return {
    h: rows[hi].map(c => String(c).trim()),
    rows: rows.slice(hi + 1).filter(r => r.some(c => String(c).trim()))
  };
}

function getPeriod(wb) {
  const ws = wb.Sheets['Общая информация'];
  if (!ws) return 'Нед.' + (S.weeks.length + 1);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  for (const r of rows) {
    const s = String(r[1] || '');
    const m = s.match(/\d{4}-\d{2}-\d{2}/g);
    if (m && m.length >= 2) {
      const f = d => { const p = d.split('-'); return p[2] + '.' + p[1]; };
      return f(m[0]) + ' — ' + f(m[1]);
    }
  }
  return 'Нед.' + (S.weeks.length + 1);
}

function rebuildAllArts() {
  const map = new Map();
  S.weeks.forEach(week => {
    if (!week.goods?.rows.length) return;
    const h = week.goods.h;
    week.goods.rows.forEach(row => {
      const art   = String(row[h.indexOf('Артикул продавца')] || '').trim();
      const name  = String(row[h.indexOf('Название')]        || '').trim();
      const wbArt = String(row[h.indexOf('Артикул WB')]      || '').trim();
      if (art && !map.has(art)) map.set(art, { art, name, wbArt });
    });
  });
  S.allArts = [...map.values()].sort((a, b) => a.art.localeCompare(b.art, 'ru'));
  S.artFilter = null;
}

async function loadFile(file) {
  const buf = await file.arrayBuffer();
  const wb  = XLSX.read(buf, { type: 'array' });
  const period = getPeriod(wb);
  let label = period, n = 2;
  while (S.weeks.find(w => w.label === label)) label = period + '(' + n++ + ')';

  S.weeks.push({
    label,
    summary: wb.Sheets['Фильтры']  ? parseSummary(wb.Sheets['Фильтры'])  : null,
    goods:   wb.Sheets['Товары']   ? parseGoods(wb.Sheets['Товары'])     : { h: [], rows: [] },
  });
  S.selW = S.weeks.map(w => w.label);
  document.getElementById('period-lbl').textContent = label;
  document.getElementById('landing').style.display  = 'none';
  document.getElementById('dash').style.display     = 'block';
  rebuildAllArts();
  renderAll();
}

// ─── CHIPS ───
function buildChips(id, set, cb) {
  const el = document.getElementById(id);
  if (el.children.length === METRICS.length) {
    Array.from(el.children).forEach((btn, i) => {
      btn.className = 'chip' + (set.has(METRICS[i].key) ? ' on' : '');
    });
    return;
  }
  el.innerHTML = '';
  METRICS.forEach(m => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (set.has(m.key) ? ' on' : '');
    btn.textContent = m.key;
    btn.addEventListener('click', () => {
      set.has(m.key) ? set.delete(m.key) : set.add(m.key);
      btn.className = 'chip' + (set.has(m.key) ? ' on' : '');
      cb();
    });
    el.appendChild(btn);
  });
}

// ─── WEEKS ───
function renderWeeks() {
  const wr = document.getElementById('wrow');
  wr.innerHTML = '';
  S.weeks.forEach((w, i) => {
    const p = document.createElement('div');
    p.className = 'wpill' + (S.selW.includes(w.label) ? ' on' : '');
    p.innerHTML = w.label + '&nbsp;<span class="x">✕</span>';
    p.onclick = e => {
      if (e.target.classList.contains('x')) {
        S.weeks.splice(i, 1);
        S.selW = S.weeks.map(w => w.label);
        rebuildAllArts(); renderAll(); return;
      }
      const idx = S.selW.indexOf(w.label);
      idx >= 0 ? S.selW.splice(idx, 1) : S.selW.push(w.label);
      renderWeeks(); renderSummary(); renderCharts(); renderGoods();
    };
    wr.appendChild(p);
  });
}

// ─── SUMMARY ───
function renderSummary() {
  const active = S.weeks.filter(w => S.selW.includes(w.label));
  const el = document.getElementById('scards');
  el.innerHTML = '';
  if (!active.length) { el.innerHTML = '<div class="empty">Нет выбранных недель</div>'; return; }
  if (!S.selS.size)   { el.innerHTML = '<div class="empty">Выберите метрики выше</div>'; return; }

  [...S.selS].forEach(key => {
    const meta = METRICS.find(m => m.key === key); if (!meta) return;
    const div  = document.createElement('div'); div.className = 'grp';
    let html   = `<div class="slabel">${meta.key}</div><div class="srow">`;
    active.forEach(w => {
      const cv = w.summary?.[meta.col];
      const pv = w.summary?.[meta.col + ' (предыдущий период)'];
      const d  = calcDelta(cv, pv, meta.fmt);
      const z  = d && Math.abs(d.value) < 0.005;
      const cls = !d ? 'neu' : z ? 'neu' : d.value > 0 ? 'pos' : 'neg';
      let dLabel = '';
      if (d) {
        const abs = Math.abs(d.value);
        const num = abs < 0.1 && !z ? abs.toFixed(2) : abs % 1 < 0.05 ? abs.toFixed(0) : abs.toFixed(1);
        dLabel = z ? '= 0%' : (d.value > 0 ? '▲' : '▼') + num + '%';
      }
      html += `<div class="sc">
        <div class="sc-lbl">${w.label}</div>
        <div class="sc-val">${fmt(cv, meta.fmt)}</div>
        ${d ? `<div class="sc-delta ${cls}">${dLabel} vs пред. период</div>` : ''}
        ${pv !== undefined && pv !== '' ? `<div class="sc-sub">пред: ${fmt(pv, meta.fmt)}</div>` : ''}
      </div>`;
    });
    html += '</div>'; div.innerHTML = html; el.appendChild(div);
  });
}

// ─── CHARTS ───
function renderCharts() {
  const active = S.weeks.filter(w => S.selW.includes(w.label));
  const cg = document.getElementById('cgrid');
  cg.querySelectorAll('canvas').forEach(c => Chart.getChart(c)?.destroy());
  cg.innerHTML = '';
  if (!active.length || !S.selC.size) { cg.innerHTML = '<div class="empty">Нет данных</div>'; return; }
  const labels = active.map(w => w.label);

  [...S.selC].forEach((key, mi) => {
    const meta = METRICS.find(m => m.key === key); if (!meta) return;
    const cur  = active.map(w => parseFloat(w.summary?.[meta.col]) || 0);
    const prv  = active.map(w => parseFloat(w.summary?.[meta.col + ' (предыдущий период)']) || 0);
    const col  = COLORS[mi % COLORS.length];
    const div  = document.createElement('div'); div.className = 'cc';
    div.innerHTML = `<div class="cc-t">${meta.key}<div class="cc-leg">
      <span><svg width="14" height="2"><line x1="0" y1="1" x2="14" y2="1" stroke="${col}" stroke-width="2"/></svg>Тек.</span>
      <span><svg width="14" height="2"><line x1="0" y1="1" x2="14" y2="1" stroke="${col}" stroke-width="1.5" stroke-dasharray="3 2"/></svg>Пред.</span>
    </div></div><div class="ch-w"><canvas id="cht${mi}"></canvas></div>`;
    cg.appendChild(div);
    setTimeout(() => {
      const ctx = document.getElementById('cht' + mi); if (!ctx) return;
      new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [
          { data: cur, borderColor: col, backgroundColor: col+'18', borderWidth: 2, tension: .35, pointRadius: 3, pointBackgroundColor: col, fill: true },
          { data: prv, borderColor: col+'77', backgroundColor: 'transparent', borderWidth: 1.5, borderDash: [3, 2], tension: .35, pointRadius: 2, fill: false }
        ]},
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { font: { size: 10 }, color: '#888' }, grid: { display: false } },
            y: { ticks: { font: { size: 10 }, color: '#888', callback: v => fmt(v, meta.fmt) }, grid: { color: 'rgba(128,128,128,.08)' } }
          }
        }
      });
    }, 60);
  });
}

// ─── ARTICLE FILTER ───
function toggleArt(art) {
  if (S.artFilter === null) {
    S.artFilter = new Set([art]);
  } else {
    S.artFilter.has(art) ? S.artFilter.delete(art) : S.artFilter.add(art);
    if (S.artFilter.size >= S.allArts.length) S.artFilter = null;
  }
  renderFilterList(); updateBadge(); renderGoods();
}

function clearArtFilter() {
  S.artFilter = null;
  renderFilterList(); updateBadge(); renderGoods();
}

function toggleSelAll() {
  S.artFilter = S.artFilter === null ? new Set() : null;
  renderFilterList(); updateBadge(); renderGoods();
}

function updateBadge() {
  const badge = document.getElementById('fp-badge');
  if (S.artFilter === null) { badge.style.display = 'none'; return; }
  badge.textContent = S.artFilter.size;
  badge.style.display = S.artFilter.size > 0 ? 'inline-block' : 'none';
}

function renderFilterList() {
  const q    = (document.getElementById('fp-srch').value || '').toLowerCase();
  const list = document.getElementById('fp-list');
  list.innerHTML = '';

  const visible = S.allArts.filter(a =>
    !q || a.art.toLowerCase().includes(q) || a.wbArt.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
  );

  visible.forEach(a => {
    const checked = S.artFilter === null || S.artFilter.has(a.art);
    const item    = document.createElement('div');
    item.className = 'fp-item';
    item.innerHTML = `<div class="fp-cb${checked ? ' on' : ''}"><span class="fp-cb-tick">✓</span></div>
      <div><div class="fp-art">${a.art}</div><div class="fp-wb">${a.wbArt || '—'}</div></div>`;
    item.addEventListener('click', () => toggleArt(a.art));
    list.appendChild(item);
  });

  const allSelected = S.artFilter === null;
  const cb = document.getElementById('fp-selall-cb');
  cb.className = 'fp-cb' + (allSelected ? ' on' : '');
  document.getElementById('fp-selall-lbl').textContent = allSelected ? 'Все выбраны' : 'Выбрать все';
}

// ─── GOODS TABLE ───
let dragSrcIdx = null;
function getOrderedMeta() {
  return S.colOrder.map(k => METRICS.find(m => m.key === k)).filter(m => m && S.selG.has(m.key));
}

function renderGoods() {
  const active = S.weeks.filter(w => S.selW.includes(w.label));
  const el = document.getElementById('gtable');
  el.innerHTML = '';
  if (!active.length || !S.selG.size) { el.innerHTML = '<div class="empty">Нет данных или метрик</div>'; return; }

  const orderedMeta = getOrderedMeta();
  const multiWeek   = active.length > 1;
  const artMap      = new Map();

  active.forEach(week => {
    if (!week.goods?.rows.length) return;
    const h = week.goods.h;
    week.goods.rows.forEach(row => {
      const art  = String(row[h.indexOf('Артикул продавца')] || '').trim();
      const name = String(row[h.indexOf('Название')]        || '').trim();
      if (!art) return;
      if (S.artFilter !== null && !S.artFilter.has(art)) return;
      if (!artMap.has(art)) artMap.set(art, { art, name, entries: [] });
      artMap.get(art).entries.push({ label: week.label, row, h });
    });
  });

  const articles = [...artMap.values()];
  if (!articles.length) { el.innerHTML = '<div class="empty">Нет товаров — выберите артикулы в фильтре слева</div>'; return; }

  if (S.sortKey) {
    const meta = METRICS.find(m => m.key === S.sortKey);
    if (meta) articles.sort((a, b) => {
      const la = a.entries[a.entries.length-1], lb = b.entries[b.entries.length-1];
      const av = parseFloat(la?.row[la.h.indexOf(meta.col)]) || 0;
      const bv = parseFloat(lb?.row[lb.h.indexOf(meta.col)]) || 0;
      return (av - bv) * S.sortDir;
    });
  }

  let html = '<div class="twrap"><table><thead><tr>';
  html += '<th style="min-width:80px">Артикул</th><th style="min-width:100px;max-width:130px">Название</th><th style="min-width:84px">Неделя</th>';
  orderedMeta.forEach((meta, ci) => {
    const arr = S.sortKey === meta.key ? (S.sortDir > 0 ? ' ↑' : ' ↓') : '';
    html += `<th class="draggable" data-ci="${ci}" draggable="true">${meta.key}<button class="sort-btn" data-key="${meta.key}">${arr || '↕'}</button></th>`;
  });
  html += '</tr></thead><tbody>';

  articles.forEach(({ art, name, entries }) => {
    const dispName = name.length > 20 ? name.slice(0, 20) + '…' : name;
    entries.forEach((wd, ei) => {
      html += '<tr>';
      if (ei === 0) {
        html += `<td class="art-cell" rowspan="${entries.length}">${art}</td>`;
        html += `<td class="name-cell" rowspan="${entries.length}" title="${name}">${dispName}</td>`;
      }
      html += `<td><span class="wk-lbl">${wd.label}</span></td>`;
      orderedMeta.forEach(meta => {
        const ci  = wd.h.indexOf(meta.col);
        const pi  = wd.h.indexOf(meta.col + ' (предыдущий период)');
        const cv  = ci >= 0 ? wd.row[ci]  : null;
        const pv  = pi >= 0 ? wd.row[pi]  : null;
        let d = null, title = '';
        if (multiWeek && ei > 0) {
          const prev = entries[ei - 1];
          const pci  = prev.h.indexOf(meta.col);
          d = calcDelta(cv, pci >= 0 ? prev.row[pci] : null, meta.fmt);
          title = `vs ${prev.label}`;
        } else if (!multiWeek) {
          d = calcDelta(cv, pv, meta.fmt);
          title = 'vs предыдущий период (из файла)';
        }
        html += `<td>${fmt(cv, meta.fmt)}${tagHtml(d, title)}</td>`;
      });
      html += '</tr>';
    });
    html += `<tr class="sep-row"><td colspan="${3 + orderedMeta.length}"></td></tr>`;
  });

  html += '</tbody></table></div>';
  el.innerHTML = html;

  // Drag-to-reorder
  const ths = el.querySelectorAll('thead th.draggable');
  ths.forEach(th => {
    th.addEventListener('dragstart', e => { dragSrcIdx = +th.dataset.ci; th.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    th.addEventListener('dragend',   () => { th.classList.remove('dragging'); el.querySelectorAll('th').forEach(t => t.classList.remove('drag-over')); });
    th.addEventListener('dragover',  e => { e.preventDefault(); th.classList.add('drag-over'); });
    th.addEventListener('dragleave', () => th.classList.remove('drag-over'));
    th.addEventListener('drop', e => {
      e.preventDefault(); th.classList.remove('drag-over');
      const destIdx = +th.dataset.ci;
      if (dragSrcIdx === null || dragSrcIdx === destIdx) return;
      const vis     = getOrderedMeta().map(m => m.key);
      const srcKey  = vis[dragSrcIdx], destKey = vis[destIdx];
      S.colOrder.splice(S.colOrder.indexOf(srcKey), 1);
      const newDi = S.colOrder.indexOf(destKey);
      S.colOrder.splice(destIdx < dragSrcIdx ? newDi : newDi + 1, 0, srcKey);
      dragSrcIdx = null; renderGoods();
    });
  });

  el.querySelectorAll('.sort-btn').forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      const key = btn.dataset.key;
      S.sortKey === key ? S.sortDir *= -1 : (S.sortKey = key, S.sortDir = -1);
      renderGoods();
    };
  });
}

function onGoodsToggle() {
  METRICS.forEach(m => { if (!S.colOrder.includes(m.key)) S.colOrder.splice(m.defPos, 0, m.key); });
  renderGoods();
}

// ─── RENDER ALL ───
function renderAll() {
  renderWeeks();
  buildChips('chips-s', S.selS, renderSummary);
  buildChips('chips-c', S.selC, renderCharts);
  buildChips('chips-g', S.selG, onGoodsToggle);
  renderSummary(); renderCharts();
  renderFilterList(); updateBadge(); renderGoods();
}

function switchTab(name, el) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('on'));
  el.classList.add('on');
  ['summary','charts','goods'].forEach(t => {
    document.getElementById('tab-' + t).style.display = t === name ? 'block' : 'none';
  });
  if (name === 'goods') renderFilterList();
}

// ─── FILE HANDLERS ─── (handled in dashboard.html)
