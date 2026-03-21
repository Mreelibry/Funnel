'use strict';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const TARIFF_TABLE = [
  { max: 0.2, base: 23 }, { max: 0.4, base: 26 }, { max: 0.6, base: 29 },
  { max: 0.8, base: 30 }, { max: 1.0, base: 32 },
];

const KTR_TABLE = [
  { min: 0,  max: 5,   ktr: 2.0,  krp: 0.025  },
  { min: 5,  max: 10,  ktr: 1.8,  krp: 0.0245 },
  { min: 10, max: 15,  ktr: 1.75, krp: 0.0235 },
  { min: 15, max: 20,  ktr: 1.7,  krp: 0.0225 },
  { min: 20, max: 25,  ktr: 1.65, krp: 0.022  },
  { min: 25, max: 30,  ktr: 1.6,  krp: 0.0215 },
  { min: 30, max: 35,  ktr: 1.55, krp: 0.021  },
  { min: 35, max: 40,  ktr: 1.0,  krp: 0      },
  { min: 40, max: 45,  ktr: 1.0,  krp: 0      },
  { min: 45, max: 50,  ktr: 0.95, krp: 0      },
  { min: 50, max: 55,  ktr: 0.9,  krp: 0      },
  { min: 55, max: 60,  ktr: 0.85, krp: 0      },
  { min: 60, max: 65,  ktr: 0.8,  krp: 0      },
  { min: 65, max: 70,  ktr: 0.75, krp: 0      },
  { min: 70, max: 75,  ktr: 0.7,  krp: 0      },
  { min: 75, max: 80,  ktr: 0.65, krp: 0      },
  { min: 80, max: 85,  ktr: 0.6,  krp: 0      },
  { min: 85, max: 90,  ktr: 0.55, krp: 0      },
  { min: 90, max: 95,  ktr: 0.5,  krp: 0      },
  { min: 95, max: 101, ktr: 0.5,  krp: 0      },
];

// ─── CALCULATION ENGINE ───────────────────────────────────────────────────────

function calcUE(p) {
  const n   = v => (v == null || v === '' || isNaN(+v)) ? 0 : +v;
  const div = (a, b) => (b === 0 || !isFinite(b)) ? 0 : a / b;

  const currRate       = n(p.currency_rate) || 1;
  const buyPrice       = n(p.purchase_price);        // ₽/шт
  const batchQty       = n(p.batch_qty) || 1;
  const priceSPP       = n(p.price_before_spp);      // ₽/шт
  const commPct        = n(p.commission_pct) / 100;
  const buyoutPct      = n(p.buyout_pct) || 100;
  const adPct          = n(p.ad_spend_pct) / 100;
  const locIdx         = n(p.loc_index) || 1;
  const sdIdx          = n(p.sales_dist_index);
  const taxSystem      = p.tax_system || 'Не считать налог';
  const taxRate        = n(p.tax_rate) / 100;
  const storage        = n(p.storage_cost);             // ₽/шт
  // Коэф. склада для логистики (в %: 100 = ×1.0, 150 = ×1.5)
  const whCoeffLog     = (n(p.wh_coeff_logistics) || 100) / 100;
  const extraExp       = n(p.extra_expenses);           // ₽ на всю партию
  // Приёмка — на всю партию, делим на batchQty для шт (отдельная статья)
  const acceptanceBatch = n(p.acceptance_cost);         // ₽/партию
  const acceptanceUnit  = div(acceptanceBatch, batchQty);
  // Ручная стоимость возврата (если 0 — считаем как доставка без КРП)
  const returnCostInput = n(p.return_cost);             // ₽/шт (вручную)
  const sppVal          = (p.spp != null && p.spp !== '') ? n(p.spp) / 100 : null;

  // Объём (литры)
  const L = n(p.length_cm), W = n(p.width_cm), H = n(p.height_cm);
  const volume = (L / 100) * (W / 100) * (H / 100) * 1000;

  // ── Себестоимость ── (в валюте покупки, без пересчёта курсом)
  const buyPriceRub  = buyPrice;                         // цена товара ₽/шт (не умножаем на курс)
  const extraPerUnit = div(extraExp, batchQty);          // доп. расходы/шт
  const selfCost     = buyPriceRub + extraPerUnit;       // полная себест./шт (для "Всего затрат")
  const batchCost    = buyPriceRub * batchQty;           // стоимость товаров партии
  const batchCostAfterShip = batchCost + extraExp;       // партия с доп. расходами

  // ── FBS Логистика ──
  let baseTariff = 46;
  for (const row of TARIFF_TABLE) {
    if (volume <= row.max) { baseTariff = row.base; break; }
  }
  const addPerL = volume <= 1 ? 0 : 14;
  const baseLogisticsRaw = addPerL > 0 ? baseTariff + (volume - 1) * addPerL : baseTariff;
  const baseLogistics    = baseLogisticsRaw * whCoeffLog;

  // Доставка покупателю (с КРП, если указан)
  const forwardCost = sdIdx > 0
    ? baseLogistics * locIdx + sdIdx * priceSPP
    : baseLogistics * locIdx;
  // Возврат: ручное значение или авто = чистый тариф × КТР (без коэф. склада)
  const returnCost = returnCostInput > 0 ? returnCostInput : baseLogisticsRaw * locIdx;

  // Формула: (100/выкуп%) × доставка + (100/выкуп% − 1) × возврат
  const logisticsTotal = buyoutPct > 0
    ? (100 / buyoutPct) * forwardCost + (100 / buyoutPct - 1) * returnCost
    : forwardCost;

  // ── Цена после СПП ──
  const priceWithSPP    = sppVal !== null ? priceSPP * (1 - sppVal) : priceSPP;

  // ── Удержания WB ──
  const acquiringPct   = (n(p.acquiring_pct) || 2.5) / 100;
  const wbCommRub      = commPct * priceSPP;
  const acquiring      = acquiringPct * priceWithSPP;
  const advertisingRub = adPct * priceSPP;
  const totalWb        = storage + logisticsTotal + acceptanceUnit + wbCommRub + acquiring + advertisingRub;
  const totalWbPct     = div(totalWb, priceSPP);
  // Приход на р/с = (Цена до СПП − Логистика − Приёмка − Хранение − Комиссия WB) × Курс
  const incomeToAccount = (priceSPP - logisticsTotal - acceptanceUnit - storage - wbCommRub) * currRate;

  // ── Налоги ──
  let usnTax = 0;
  if (taxSystem === 'УСН-ДОХОДЫ') {
    usnTax = taxRate * priceWithSPP;
  } else if (taxSystem === 'УСН Д-Р') {
    usnTax = taxRate * Math.max(0, priceSPP - totalWb - selfCost);
  } else if (taxSystem === 'От прихода на р/с') {
    usnTax = taxRate * Math.max(0, incomeToAccount);
  }
  const totalTaxes    = usnTax;
  const totalTaxesPct = div(totalTaxes, priceSPP);

  // ── Итог ──
  // ЧП = Приход − Эквайринг − Налог − Товар/шт − Реклама − Доп.расходы/шт
  const profitPerUnit  = incomeToAccount - acquiring - totalTaxes - buyPriceRub - advertisingRub - extraPerUnit;
  const profitPerBatch = profitPerUnit * batchQty;
  const marginality    = div(profitPerUnit, priceSPP);
  const roi            = selfCost > 0 ? div(profitPerUnit, selfCost) : 0;
  // Всего затрат (для отображения)
  const totalCostsPerUnit = selfCost + totalWb + totalTaxes;

  return {
    volume, buyPriceRub, extraPerUnit, selfCost, batchCost, batchCostAfterShip,
    baseTariff, baseLogisticsRaw, baseLogistics,
    acceptanceBatch, acceptanceUnit,
    forwardCost, returnCost, returnCostInput, logisticsTotal,
    wbCommRub, acquiring, advertisingRub,
    totalWb, totalWbPct,
    priceWithSPP, incomeToAccount,
    usnTax, totalTaxes, totalTaxesPct,
    totalCostsPerUnit, profitPerUnit, profitPerBatch, marginality, roi,
  };
}

// ─── FORMATTING ──────────────────────────────────────────────────────────────

const fmt = {
  rub: v => v == null ? '—' : Math.round(v).toLocaleString('ru') + ' ₽',
  pct: v => v == null ? '—' : (v * 100).toFixed(1) + '%',
  vol: v => v == null ? '—' : v.toFixed(3) + ' л',
};

// ─── STATE ───────────────────────────────────────────────────────────────────

let products    = [];
let managers    = [];
let cabinets    = [];
let editId      = null;
let charts      = {};
let searchQ     = '';
let filterMgrId = '';
let filterCabId = '';

// ─── API ─────────────────────────────────────────────────────────────────────

async function loadProducts() {
  try { products = await API.get('/unit-economics'); }
  catch (e) { products = []; console.error(e); }
}

async function loadManagers() {
  try { managers = await API.get('/managers'); }
  catch (e) { managers = []; }
}

async function loadCabinets() {
  try { cabinets = await API.get('/cabinets'); }
  catch (e) { cabinets = []; }
}

async function saveProduct(data) {
  return editId ? API.put('/unit-economics/' + editId, data) : API.post('/unit-economics', data);
}

// ─── FILTERING ───────────────────────────────────────────────────────────────

function getFiltered() {
  return products.filter(p => {
    if (searchQ && !p.name.toLowerCase().includes(searchQ.toLowerCase())) return false;
    if (filterMgrId && p.manager_id !== filterMgrId) return false;
    if (filterCabId && p.cabinet_id !== filterCabId) return false;
    return true;
  });
}

// ─── RENDER: CARDS ───────────────────────────────────────────────────────────

function renderCards() {
  const grid  = document.getElementById('products-grid');
  const empty = document.getElementById('products-empty');
  const filtered = getFiltered();

  if (!filtered.length) { grid.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  const user = getUser();
  const isAdmin = user && user.role === 'admin';

  grid.innerHTML = filtered.map(p => {
    const r = calcUE(p);
    const profCol = r.profitPerUnit >= 0 ? 'var(--green)' : 'var(--red)';
    const margCol = r.marginality >= 0 ? 'var(--green)' : 'var(--red)';
    const badges = [
      isAdmin && p.manager_name ? `<span class="ue-badge">${esc(p.manager_name)}</span>` : '',
      p.cabinet_name            ? `<span class="ue-badge cab">${esc(p.cabinet_name)}</span>` : '',
    ].filter(Boolean).join('');
    return `
    <div class="ue-card">
      ${badges ? `<div class="ue-card-badges">${badges}</div>` : ''}
      <div class="ue-card-name" title="${esc(p.name)}">${esc(p.name)}</div>
      <div class="ue-card-metrics">
        <div class="ue-metric">
          <div class="ue-metric-label">Цена до СПП</div>
          <div class="ue-metric-value">${fmt.rub(p.price_before_spp * p.currency_rate)}</div>
        </div>
        <div class="ue-metric">
          <div class="ue-metric-label">Цена с СПП</div>
          <div class="ue-metric-value">${fmt.rub(r.priceWithSPP * p.currency_rate)}</div>
        </div>
        <div class="ue-metric">
          <div class="ue-metric-label">Прибыль / шт</div>
          <div class="ue-metric-value" style="color:${profCol}">${fmt.rub(r.profitPerUnit)}</div>
        </div>
        <div class="ue-metric">
          <div class="ue-metric-label">Маржа</div>
          <div class="ue-metric-value" style="color:${margCol}">${fmt.pct(r.marginality)}</div>
        </div>
      </div>
      <div class="ue-card-sub">
        Себестоим.: ${fmt.rub(r.selfCost)}/шт &nbsp;·&nbsp; Партия: ${p.batch_qty} шт &nbsp;·&nbsp; ROI: ${fmt.pct(r.roi)}
      </div>
      <div class="ue-card-actions">
        <button class="btn btn-ghost btn-sm" onclick="openEdit('${p.id}')">✏️ Редактировать</button>
        <button class="btn btn-ghost btn-sm" onclick="duplicateProduct('${p.id}')">⧉ Дублировать</button>
        <button class="btn btn-danger btn-sm" onclick="confirmDelete('${p.id}', '${esc(p.name)}')">🗑</button>
      </div>
    </div>`;
  }).join('');
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── RENDER: DASHBOARD ───────────────────────────────────────────────────────

function renderDashboard() { renderSummaryTable(); renderCharts(); }

function renderSummaryTable() {
  const tbody    = document.getElementById('summary-tbody');
  const filtered = getFiltered();
  const user = getUser();
  const isAdmin = user && user.role === 'admin';

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:30px;color:var(--g)">Нет данных</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(p => {
    const r = calcUE(p);
    return `<tr>
      ${isAdmin ? `<td style="color:var(--g);font-size:11px">${esc(p.manager_name||'—')}</td>` : ''}
      <td style="font-size:11px;color:var(--g)">${esc(p.cabinet_name||'—')}</td>
      <td style="font-weight:600">${esc(p.name)}</td>
      <td>${fmt.rub(p.price_before_spp * p.currency_rate)}</td>
      <td style="color:var(--g)">${fmt.rub(r.priceWithSPP * p.currency_rate)}</td>
      <td>${fmt.rub(r.selfCost)}<span class="unit">/шт</span></td>
      <td>${fmt.rub(r.totalWb)}<span class="unit">/шт</span></td>
      <td>${fmt.rub(r.totalTaxes)}<span class="unit">/шт</span></td>
      <td class="${r.profitPerUnit >= 0 ? 'pos' : 'neg'}">${fmt.rub(r.profitPerUnit)}<span class="unit">/шт</span></td>
      <td class="${r.marginality >= 0 ? 'pos' : 'neg'}">${fmt.pct(r.marginality)}</td>
      <td class="${r.roi >= 0 ? 'pos' : 'neg'}">${fmt.pct(r.roi)}</td>
    </tr>`;
  }).join('');
}

function renderCharts() {
  const filtered = getFiltered();
  const labels   = filtered.map(p => p.name.length > 16 ? p.name.slice(0, 14) + '…' : p.name);
  const margins  = filtered.map(p => +(calcUE(p).marginality * 100).toFixed(1));
  const profits  = filtered.map(p => +calcUE(p).profitPerBatch.toFixed(0));

  const isDark    = document.documentElement.classList.contains('dark');
  const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const textColor = isDark ? '#9CA3AF' : '#666';
  const opts = yLabel => ({
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: textColor, font: { size: 11 } }, grid: { color: gridColor } },
      y: { ticks: { color: textColor, font: { size: 11 } }, grid: { color: gridColor },
           title: { display: true, text: yLabel, color: textColor, font: { size: 11 } } },
    },
  });

  ['chart-margin', 'chart-profit'].forEach(id => { if (charts[id]) { charts[id].destroy(); delete charts[id]; } });

  const ctxM = document.getElementById('chart-margin');
  if (ctxM && filtered.length) {
    charts['chart-margin'] = new Chart(ctxM, {
      type: 'bar',
      data: { labels, datasets: [{ data: margins, backgroundColor: margins.map(v => v >= 0 ? 'rgba(22,163,74,0.7)' : 'rgba(220,38,38,0.7)'), borderRadius: 5 }] },
      options: opts('%'),
    });
  }
  const ctxP = document.getElementById('chart-profit');
  if (ctxP && filtered.length) {
    charts['chart-profit'] = new Chart(ctxP, {
      type: 'bar',
      data: { labels, datasets: [{ data: profits, backgroundColor: profits.map(v => v >= 0 ? 'rgba(124,58,237,0.7)' : 'rgba(220,38,38,0.7)'), borderRadius: 5 }] },
      options: opts('₽'),
    });
  }
}

// ─── MODAL ───────────────────────────────────────────────────────────────────

const FIELDS = [
  'name','currency_rate','purchase_price','batch_qty','price_before_spp','spp',
  'tax_system','tax_rate',
  'length_cm','width_cm','height_cm','buyout_pct','loc_index','sales_dist_index',
  'acceptance_cost','wh_coeff_logistics','return_cost',
  'commission_pct','acquiring_pct','ad_spend_pct','storage_cost','extra_expenses',
];

function getFormData() {
  const data = {};
  for (const f of FIELDS) {
    const el = document.getElementById('m-' + f);
    if (!el) continue;
    data[f] = el.tagName === 'SELECT' ? el.value : (el.type === 'number' ? (el.value === '' ? null : +el.value) : el.value);
  }
  // Admin: manager_id
  const mgrEl = document.getElementById('m-manager_id');
  if (mgrEl && mgrEl.closest('.field') && mgrEl.closest('.field').style.display !== 'none') {
    data.manager_id = mgrEl.value || null;
  }
  // Cabinet
  const cabEl = document.getElementById('m-cabinet_id');
  if (cabEl) data.cabinet_id = cabEl.value || null;
  return data;
}

function setFormData(p) {
  for (const f of FIELDS) {
    const el = document.getElementById('m-' + f);
    if (!el) continue;
    el.value = (p[f] == null) ? (el.tagName === 'SELECT' ? el.options[0]?.value ?? '' : '') : p[f];
  }
  const mgrEl = document.getElementById('m-manager_id');
  if (mgrEl) mgrEl.value = p.manager_id || '';
  const cabEl = document.getElementById('m-cabinet_id');
  if (cabEl) cabEl.value = p.cabinet_id || '';
  updateLiveResults();
}

function resetForm() {
  const defaults = {
    currency_rate: 1, batch_qty: 1, buyout_pct: 100, loc_index: 1,
    wh_coeff_logistics: 100, acquiring_pct: 2.5, tax_system: 'Не считать налог',
  };
  for (const f of FIELDS) {
    const el = document.getElementById('m-' + f);
    if (!el) continue;
    el.value = defaults[f] ?? '';
  }
  const mgrEl = document.getElementById('m-manager_id');
  if (mgrEl) mgrEl.value = '';
  const cabEl = document.getElementById('m-cabinet_id');
  if (cabEl) cabEl.value = '';
  updateLiveResults();
}

function updateLiveResults() {
  const data = getFormData();
  const r = calcUE(data);

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  set('r-volume',       fmt.vol(r.volume));
  set('r-price-spp',    fmt.rub(r.priceWithSPP));
  set('r-selfcost',     fmt.rub(r.buyPriceRub) + '/шт');          // только товар
  set('r-extra-unit',   fmt.rub(r.extraPerUnit) + '/шт');         // доп. расходы
  set('r-batch-cost',   fmt.rub(r.batchCostAfterShip) + '/партию');
  set('r-logistics',    fmt.rub(r.logisticsTotal) + '/шт');
  set('r-forward',      fmt.rub(r.forwardCost) + '/шт');
  set('r-return-cost',  fmt.rub(r.returnCost) + '/шт');
  set('r-acceptance-u', fmt.rub(r.acceptanceUnit) + '/шт');
  set('r-base-log',     fmt.rub(r.baseLogisticsRaw) + ' × ' + (+data.wh_coeff_logistics||100).toFixed(0) + '% = ' + fmt.rub(r.baseLogistics));
  set('r-wb-comm',      fmt.rub(r.wbCommRub) + '/шт');
  set('r-acquiring',    fmt.rub(r.acquiring) + '/шт');
  set('r-adv',          fmt.rub(r.advertisingRub) + '/шт');
  set('r-storage-d',    fmt.rub(+data.storage_cost || 0) + '/шт');
  set('r-totalwb',      fmt.rub(r.totalWb) + '/шт (' + fmt.pct(r.totalWbPct) + ')');
  set('r-taxes',        fmt.rub(r.totalTaxes) + '/шт (' + fmt.pct(r.totalTaxesPct) + ')');
  set('r-income',       fmt.rub(r.incomeToAccount) + '/шт');
  set('r-costs',        fmt.rub(r.totalCostsPerUnit) + '/шт');

  const col = (v, pos, neg) => v >= 0 ? pos : neg;
  const setMetric = (id, val, color) => {
    const el = document.getElementById(id); if (!el) return;
    el.textContent = val; el.style.color = color;
  };
  setMetric('r-profit',       fmt.rub(r.profitPerUnit) + '/шт',      col(r.profitPerUnit, 'var(--green)', 'var(--red)'));
  setMetric('r-profit-batch', fmt.rub(r.profitPerBatch) + '/партию', col(r.profitPerBatch, 'var(--green)', 'var(--red)'));
  setMetric('r-margin',       fmt.pct(r.marginality),                col(r.marginality, 'var(--green)', 'var(--red)'));
  setMetric('r-roi',          fmt.pct(r.roi),                        col(r.roi, 'var(--green)', 'var(--red)'));
}

function openEdit(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  editId = id;
  document.getElementById('modal-title').textContent = 'Редактировать товар';
  setFormData(p);
  document.getElementById('overlay').classList.add('show');
}

function openCreate() {
  editId = null;
  document.getElementById('modal-title').textContent = 'Новый товар';
  resetForm();
  document.getElementById('overlay').classList.add('show');
}

function closeModal() { document.getElementById('overlay').classList.remove('show'); }

async function submitForm() {
  const data = getFormData();
  if (!data.name || !data.name.trim()) { alert('Введите название товара'); return; }

  const user = getUser();
  if (!editId && user && user.role === 'admin' && !data.manager_id) {
    alert('Выберите менеджера'); return;
  }

  const btn = document.getElementById('modal-save-btn');
  btn.disabled = true; btn.textContent = 'Сохранение…';
  try {
    await saveProduct(data);
    await loadProducts();
    closeModal(); renderCards();
    if (document.getElementById('tab-dash').classList.contains('on')) renderDashboard();
  } catch (e) {
    alert('Ошибка: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Сохранить';
  }
}

async function duplicateProduct(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  const copy = { ...p, name: p.name + ' (копия)' };
  delete copy.id; delete copy.created_at; delete copy.updated_at;
  delete copy.manager_name; delete copy.cabinet_name;
  try {
    await API.post('/unit-economics', copy);
    await loadProducts(); renderCards();
    if (document.getElementById('tab-dash').classList.contains('on')) renderDashboard();
  } catch (e) { alert('Ошибка: ' + e.message); }
}

function confirmDelete(id, name) {
  if (!confirm(`Удалить товар "${name}"?`)) return;
  API.delete('/unit-economics/' + id).then(async () => {
    await loadProducts(); renderCards();
    if (document.getElementById('tab-dash').classList.contains('on')) renderDashboard();
  }).catch(e => alert('Ошибка: ' + e.message));
}

// ─── SELECTS: MANAGERS + CABINETS ────────────────────────────────────────────

function fillManagerSelects() {
  const opts = managers.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
  const mgrEl = document.getElementById('m-manager_id');
  if (mgrEl) {
    mgrEl.innerHTML = '<option value="">— Выберите менеджера —</option>' + opts;
    mgrEl.closest('.field').style.display = '';
  }
  const filterEl = document.getElementById('filter-manager');
  if (filterEl) {
    filterEl.innerHTML = '<option value="">Все менеджеры</option>' + opts;
    filterEl.closest('.filter-mgr-wrap').style.display = '';
  }
  const thMgr = document.getElementById('th-manager');
  if (thMgr) thMgr.style.display = '';
}

function fillCabinetSelects() {
  const opts = cabinets.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  const cabEl = document.getElementById('m-cabinet_id');
  if (cabEl) cabEl.innerHTML = '<option value="">— Без кабинета —</option>' + opts;
  const filterEl = document.getElementById('filter-cabinet');
  if (filterEl) {
    filterEl.innerHTML = '<option value="">Все кабинеты</option>' + opts;
    filterEl.closest('.filter-cab-wrap').style.display = '';
  }
  const thCab = document.getElementById('th-cabinet');
  if (thCab) thCab.style.display = '';
}

// ─── KTR ─────────────────────────────────────────────────────────────────────

function applyKTR(locSharePct) {
  const row = KTR_TABLE.find(r => locSharePct >= r.min && locSharePct < r.max) || KTR_TABLE[KTR_TABLE.length - 1];
  document.getElementById('m-loc_index').value        = row.ktr;
  document.getElementById('m-sales_dist_index').value = row.krp;
  updateLiveResults();
}

// ─── TABS ────────────────────────────────────────────────────────────────────

function switchTab(tabName) {
  ['products', 'dash'].forEach(t => {
    document.getElementById('tab-' + t).classList.toggle('on', t === tabName);
    document.getElementById('pane-' + t).style.display = t === tabName ? '' : 'none';
  });
  if (tabName === 'dash') renderDashboard();
}

// ─── INIT ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth();

  const user = getUser();
  if (user) {
    document.getElementById('nav-user-name').textContent = user.username || '';
    if (user.role === 'admin') document.getElementById('nav-admin').style.display = '';
  }

  document.getElementById('tab-products').addEventListener('click', () => switchTab('products'));
  document.getElementById('tab-dash').addEventListener('click',     () => switchTab('dash'));

  document.getElementById('btn-theme').addEventListener('click', () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    if (document.getElementById('tab-dash').classList.contains('on')) renderCharts();
  });

  document.getElementById('btn-logout').addEventListener('click', logout);

  document.getElementById('search-input').addEventListener('input', e => {
    searchQ = e.target.value.trim();
    renderCards();
    if (document.getElementById('tab-dash').classList.contains('on')) renderDashboard();
  });

  document.getElementById('filter-manager').addEventListener('change', e => {
    filterMgrId = e.target.value;
    renderCards();
    if (document.getElementById('tab-dash').classList.contains('on')) renderDashboard();
  });

  document.getElementById('filter-cabinet').addEventListener('change', e => {
    filterCabId = e.target.value;
    renderCards();
    if (document.getElementById('tab-dash').classList.contains('on')) renderDashboard();
  });

  document.getElementById('btn-add').addEventListener('click', openCreate);

  document.getElementById('overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('overlay')) closeModal();
  });
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-save-btn').addEventListener('click', submitForm);
  document.getElementById('modal-form').addEventListener('input', updateLiveResults);

  document.getElementById('btn-ktr').addEventListener('click', () => {
    const pct = parseFloat(document.getElementById('ktr-share').value);
    if (isNaN(pct) || pct < 0 || pct > 100) { alert('Введите долю локализации 0–100'); return; }
    applyKTR(pct);
  });

  // Load data
  const loads = [loadProducts(), loadCabinets()];
  if (user && user.role === 'admin') loads.push(loadManagers());
  await Promise.all(loads);

  if (user && user.role === 'admin') fillManagerSelects();
  fillCabinetSelects();
  renderCards();
});
