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

  const currRate   = n(p.currency_rate) || 1;
  const buyPrice   = n(p.purchase_price);        // ₽/шт
  const batchQty   = n(p.batch_qty) || 1;
  const priceSPP   = n(p.price_before_spp);      // ₽/шт
  const commPct    = n(p.commission_pct) / 100;
  const buyoutPct  = n(p.buyout_pct) || 100;
  const adPct      = n(p.ad_spend_pct) / 100;
  const locIdx     = n(p.loc_index) || 1;
  const sdIdx      = n(p.sales_dist_index);
  const taxSystem  = p.tax_system || 'Не считать налог';
  const taxRate    = n(p.tax_rate) / 100;
  const storage    = n(p.storage_cost);          // ₽/шт
  const acceptance = n(p.acceptance_cost);       // ₽/шт
  const whCoeff    = n(p.warehouse_coeff) || 1;
  const extraExp   = n(p.extra_expenses);        // ₽ на всю партию
  const sppVal     = (p.spp != null && p.spp !== '') ? n(p.spp) / 100 : null;

  // Volume (litres)
  const L = n(p.length_cm), W = n(p.width_cm), H = n(p.height_cm);
  const volume = (L / 100) * (W / 100) * (H / 100) * 1000;

  // ── Self-cost ──
  const commRub = commPct * buyPrice * batchQty;
  const batchCost = buyPrice * batchQty + commRub;
  const batchCostAfterShip = batchCost + extraExp;
  const selfCost = div(batchCostAfterShip, batchQty); // ₽/шт

  // ── FBS Logistics ──
  let baseTariff = 46;
  for (const row of TARIFF_TABLE) {
    if (volume <= row.max) { baseTariff = row.base; break; }
  }
  const addPerL = volume <= 1 ? 0 : 14;
  // [5] Базовая стоимость логистики × коэф. склада
  const baseLogisticsRaw = addPerL > 0 ? baseTariff + (volume - 1) * addPerL : baseTariff;
  const baseLogistics    = baseLogisticsRaw * whCoeff;

  const deliveryCost = sdIdx > 0
    ? baseLogistics * locIdx + sdIdx * priceSPP + acceptance
    : baseLogistics * locIdx + acceptance;

  const logisticsReturns = buyoutPct > 0 ? (100 / buyoutPct - 1) * deliveryCost : 0;
  const logisticsTotal   = deliveryCost + logisticsReturns;

  // ── WB Deductions ──
  const wbCommRub      = commPct * priceSPP;
  const acquiring      = 0.025 * priceSPP;
  const advertisingRub = adPct * priceSPP;
  const paidAcceptance = 1.7 * volume * whCoeff;
  const totalWb        = storage + logisticsTotal + wbCommRub + acquiring + paidAcceptance + advertisingRub;
  const totalWbPct     = div(totalWb, priceSPP);

  // ── Price & Income ──
  const priceWithSPP    = sppVal !== null ? priceSPP * (1 - sppVal) : priceSPP;
  const incomeToAccount = priceSPP - wbCommRub - logisticsTotal - storage - acquiring * currRate;

  // ── Taxes ── [7] добавлен режим "От прихода на р/с"
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

  // ── Summary ──
  const totalCostsPerUnit = selfCost + totalWb + totalTaxes;
  const profitPerUnit  = (priceSPP - totalCostsPerUnit) * currRate;
  const profitPerBatch = profitPerUnit * batchQty;
  const marginality    = div(profitPerUnit, priceSPP * currRate);
  const roi            = selfCost > 0 ? div(profitPerUnit, selfCost * currRate) : 0;

  return {
    volume, selfCost, batchCost, batchCostAfterShip, commRub,
    baseTariff, baseLogisticsRaw, baseLogistics, deliveryCost, logisticsReturns, logisticsTotal,
    wbCommRub, acquiring, advertisingRub, paidAcceptance,
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
let managers    = [];   // список менеджеров (только для админа)
let editId      = null;
let charts      = {};
let searchQ     = '';
let filterMgrId = '';   // фильтр по менеджеру (только для админа)

// ─── API ─────────────────────────────────────────────────────────────────────

async function loadProducts() {
  try {
    products = await API.get('/unit-economics');
  } catch (e) {
    products = [];
    console.error('Ошибка загрузки товаров:', e);
  }
}

async function loadManagers() {
  try {
    managers = await API.get('/managers');
  } catch (e) {
    managers = [];
  }
}

async function saveProduct(data) {
  if (editId) return API.put('/unit-economics/' + editId, data);
  return API.post('/unit-economics', data);
}

async function deleteProduct(id) {
  return API.delete('/unit-economics/' + id);
}

// ─── FILTERING ───────────────────────────────────────────────────────────────

function getFiltered() {
  return products.filter(p => {
    if (searchQ && !p.name.toLowerCase().includes(searchQ.toLowerCase())) return false;
    if (filterMgrId && p.manager_id !== filterMgrId) return false;
    return true;
  });
}

// ─── RENDER: CARDS ───────────────────────────────────────────────────────────

function renderCards() {
  const grid  = document.getElementById('products-grid');
  const empty = document.getElementById('products-empty');
  const filtered = getFiltered();

  if (!filtered.length) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  const user = getUser();
  grid.innerHTML = filtered.map(p => {
    const r = calcUE(p);
    const profCol = r.profitPerUnit >= 0 ? 'var(--green)' : 'var(--red)';
    const margCol = r.marginality >= 0 ? 'var(--green)' : 'var(--red)';
    const mgrBadge = (user && user.role === 'admin' && p.manager_name)
      ? `<div class="ue-card-mgr">${esc(p.manager_name)}</div>` : '';
    return `
    <div class="ue-card">
      ${mgrBadge}
      <div class="ue-card-name" title="${esc(p.name)}">${esc(p.name)}</div>
      <div class="ue-card-metrics">
        <div class="ue-metric">
          <div class="ue-metric-label">Цена продажи</div>
          <div class="ue-metric-value">${fmt.rub(p.price_before_spp * p.currency_rate)}</div>
        </div>
        <div class="ue-metric">
          <div class="ue-metric-label">Прибыль / шт</div>
          <div class="ue-metric-value" style="color:${profCol}">${fmt.rub(r.profitPerUnit)}</div>
        </div>
        <div class="ue-metric">
          <div class="ue-metric-label">Маржа</div>
          <div class="ue-metric-value" style="color:${margCol}">${fmt.pct(r.marginality)}</div>
        </div>
        <div class="ue-metric">
          <div class="ue-metric-label">ROI</div>
          <div class="ue-metric-value" style="color:${r.roi >= 0 ? 'var(--green)' : 'var(--red)'}">${fmt.pct(r.roi)}</div>
        </div>
      </div>
      <div class="ue-card-sub">
        Себестоим.: ${fmt.rub(r.selfCost)}/шт &nbsp;·&nbsp; Партия: ${p.batch_qty} шт
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

function renderDashboard() {
  renderSummaryTable();
  renderCharts();
}

function renderSummaryTable() {
  const tbody    = document.getElementById('summary-tbody');
  const filtered = getFiltered();

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty" style="text-align:center;padding:30px;color:var(--g)">Нет данных</td></tr>';
    return;
  }

  const user = getUser();
  const showMgr = user && user.role === 'admin';

  tbody.innerHTML = filtered.map(p => {
    const r = calcUE(p);
    return `<tr>
      ${showMgr ? `<td style="color:var(--g);font-size:11px">${esc(p.manager_name || '—')}</td>` : ''}
      <td style="font-weight:600">${esc(p.name)}</td>
      <td>${fmt.rub(p.price_before_spp * p.currency_rate)}</td>
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

  const commonOpts = (yLabel) => ({
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: textColor, font: { size: 11 } }, grid: { color: gridColor } },
      y: { ticks: { color: textColor, font: { size: 11 } }, grid: { color: gridColor },
           title: { display: true, text: yLabel, color: textColor, font: { size: 11 } } },
    },
  });

  ['chart-margin', 'chart-profit'].forEach(id => {
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  });

  const ctxM = document.getElementById('chart-margin');
  if (ctxM && filtered.length) {
    charts['chart-margin'] = new Chart(ctxM, {
      type: 'bar',
      data: { labels, datasets: [{ data: margins, backgroundColor: margins.map(v => v >= 0 ? 'rgba(22,163,74,0.7)' : 'rgba(220,38,38,0.7)'), borderRadius: 5 }] },
      options: commonOpts('%'),
    });
  }

  const ctxP = document.getElementById('chart-profit');
  if (ctxP && filtered.length) {
    charts['chart-profit'] = new Chart(ctxP, {
      type: 'bar',
      data: { labels, datasets: [{ data: profits, backgroundColor: profits.map(v => v >= 0 ? 'rgba(124,58,237,0.7)' : 'rgba(220,38,38,0.7)'), borderRadius: 5 }] },
      options: commonOpts('₽'),
    });
  }
}

// ─── MODAL ───────────────────────────────────────────────────────────────────

const FIELDS = [
  'name','currency_rate','purchase_price','batch_qty','price_before_spp','spp',
  'tax_system','tax_rate',
  'length_cm','width_cm','height_cm','buyout_pct','loc_index','sales_dist_index','acceptance_cost',
  'commission_pct','ad_spend_pct','storage_cost','warehouse_coeff','extra_expenses',
];

function getFormData() {
  const data = {};
  for (const f of FIELDS) {
    const el = document.getElementById('m-' + f);
    if (!el) continue;
    if (el.tagName === 'SELECT') {
      data[f] = el.value;
    } else if (el.type === 'number') {
      data[f] = el.value === '' ? null : +el.value;
    } else {
      data[f] = el.value;
    }
  }
  // manager_id для админа
  const mgrEl = document.getElementById('m-manager_id');
  if (mgrEl && mgrEl.style.display !== 'none') {
    data.manager_id = mgrEl.value || null;
  }
  return data;
}

function setFormData(p) {
  for (const f of FIELDS) {
    const el = document.getElementById('m-' + f);
    if (!el) continue;
    el.value = (p[f] == null) ? (el.tagName === 'SELECT' ? el.options[0]?.value ?? '' : '') : p[f];
  }
  // manager_id
  const mgrEl = document.getElementById('m-manager_id');
  if (mgrEl) mgrEl.value = p.manager_id || '';
  updateLiveResults();
}

function resetForm() {
  const defaults = {
    currency_rate: 1, batch_qty: 1, buyout_pct: 100, loc_index: 1,
    warehouse_coeff: 1, tax_system: 'Не считать налог',
  };
  for (const f of FIELDS) {
    const el = document.getElementById('m-' + f);
    if (!el) continue;
    el.value = defaults[f] ?? '';
  }
  const mgrEl = document.getElementById('m-manager_id');
  if (mgrEl) mgrEl.value = '';
  updateLiveResults();
}

function updateLiveResults() {
  const data = getFormData();
  const r = calcUE(data);

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  set('r-volume',       fmt.vol(r.volume));
  set('r-selfcost',     fmt.rub(r.selfCost) + '/шт');
  set('r-comm-rub',     fmt.rub(r.commRub));
  set('r-batch-cost',   fmt.rub(r.batchCostAfterShip) + '/партию');
  set('r-logistics',    fmt.rub(r.logisticsTotal) + '/шт');
  set('r-delivery',     fmt.rub(r.deliveryCost) + '/шт');
  set('r-returns',      fmt.rub(r.logisticsReturns) + '/шт');
  set('r-base-log',     fmt.rub(r.baseLogisticsRaw) + '×' + (+data.warehouse_coeff||1).toFixed(2) + '=' + fmt.rub(r.baseLogistics));
  set('r-wb-comm',      fmt.rub(r.wbCommRub) + '/шт');
  set('r-acquiring',    fmt.rub(r.acquiring) + '/шт');
  set('r-adv',          fmt.rub(r.advertisingRub) + '/шт');
  set('r-storage-d',    fmt.rub(+data.storage_cost || 0) + '/шт');
  set('r-paid-acc',     fmt.rub(r.paidAcceptance) + '/шт');
  set('r-totalwb',      fmt.rub(r.totalWb) + '/шт (' + fmt.pct(r.totalWbPct) + ')');
  set('r-taxes',        fmt.rub(r.totalTaxes) + '/шт (' + fmt.pct(r.totalTaxesPct) + ')');
  set('r-income',       fmt.rub(r.incomeToAccount) + '/шт');
  set('r-costs',        fmt.rub(r.totalCostsPerUnit) + '/шт');

  const profEl = document.getElementById('r-profit');
  if (profEl) {
    profEl.textContent = fmt.rub(r.profitPerUnit) + '/шт';
    profEl.style.color = r.profitPerUnit >= 0 ? 'var(--green)' : 'var(--red)';
  }
  const batchEl = document.getElementById('r-profit-batch');
  if (batchEl) {
    batchEl.textContent = fmt.rub(r.profitPerBatch) + '/партию';
    batchEl.style.color = r.profitPerBatch >= 0 ? 'var(--green)' : 'var(--red)';
  }
  const margEl = document.getElementById('r-margin');
  if (margEl) {
    margEl.textContent = fmt.pct(r.marginality);
    margEl.style.color = r.marginality >= 0 ? 'var(--green)' : 'var(--red)';
  }
  const roiEl = document.getElementById('r-roi');
  if (roiEl) {
    roiEl.textContent = fmt.pct(r.roi);
    roiEl.style.color = r.roi >= 0 ? 'var(--green)' : 'var(--red)';
  }
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

function closeModal() {
  document.getElementById('overlay').classList.remove('show');
}

async function submitForm() {
  const data = getFormData();
  if (!data.name || !data.name.trim()) { alert('Введите название товара'); return; }

  // Валидация manager_id для админа при создании
  const user = getUser();
  if (!editId && user && user.role === 'admin' && !data.manager_id) {
    alert('Выберите менеджера');
    return;
  }

  const btn = document.getElementById('modal-save-btn');
  btn.disabled = true; btn.textContent = 'Сохранение…';
  try {
    await saveProduct(data);
    await loadProducts();
    closeModal();
    renderCards();
    if (document.getElementById('tab-dash').classList.contains('on')) renderDashboard();
  } catch (e) {
    alert('Ошибка сохранения: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Сохранить';
  }
}

async function duplicateProduct(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  const copy = { ...p, name: p.name + ' (копия)' };
  delete copy.id; delete copy.created_at; delete copy.updated_at; delete copy.manager_name;
  try {
    await API.post('/unit-economics', copy);
    await loadProducts();
    renderCards();
    if (document.getElementById('tab-dash').classList.contains('on')) renderDashboard();
  } catch (e) {
    alert('Ошибка: ' + e.message);
  }
}

function confirmDelete(id, name) {
  if (!confirm(`Удалить товар "${name}"?`)) return;
  deleteProduct(id).then(async () => {
    await loadProducts();
    renderCards();
    if (document.getElementById('tab-dash').classList.contains('on')) renderDashboard();
  }).catch(e => alert('Ошибка: ' + e.message));
}

// ─── MANAGERS UI ─────────────────────────────────────────────────────────────

function fillManagerSelects() {
  const opts = managers.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');

  // Селект в модале
  const mgrEl = document.getElementById('m-manager_id');
  if (mgrEl) {
    mgrEl.innerHTML = '<option value="">— Выберите менеджера —</option>' + opts;
    mgrEl.closest('.field').style.display = '';
  }

  // Фильтр на странице
  const filterEl = document.getElementById('filter-manager');
  if (filterEl) {
    filterEl.innerHTML = '<option value="">Все менеджеры</option>' + opts;
    filterEl.closest('.filter-mgr-wrap').style.display = '';
  }

  // Столбец в таблице
  const thMgr = document.getElementById('th-manager');
  if (thMgr) thMgr.style.display = '';
}

// ─── KTR HELPER ──────────────────────────────────────────────────────────────

function applyKTR(locSharePct) {
  const row = KTR_TABLE.find(r => locSharePct >= r.min && locSharePct < r.max)
    || KTR_TABLE[KTR_TABLE.length - 1];
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
    if (user.role === 'admin') {
      document.getElementById('nav-admin').style.display = '';
    }
  }

  // Tabs
  document.getElementById('tab-products').addEventListener('click', () => switchTab('products'));
  document.getElementById('tab-dash').addEventListener('click',     () => switchTab('dash'));

  // Theme toggle
  document.getElementById('btn-theme').addEventListener('click', () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    if (document.getElementById('tab-dash').classList.contains('on')) renderCharts();
  });

  document.getElementById('btn-logout').addEventListener('click', logout);

  // Search
  document.getElementById('search-input').addEventListener('input', e => {
    searchQ = e.target.value.trim();
    renderCards();
    if (document.getElementById('tab-dash').classList.contains('on')) renderDashboard();
  });

  // Manager filter (admin only)
  document.getElementById('filter-manager').addEventListener('change', e => {
    filterMgrId = e.target.value;
    renderCards();
    if (document.getElementById('tab-dash').classList.contains('on')) renderDashboard();
  });

  // Add button
  document.getElementById('btn-add').addEventListener('click', openCreate);

  // Modal
  document.getElementById('overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('overlay')) closeModal();
  });
  document.getElementById('modal-close').addEventListener('click',   closeModal);
  document.getElementById('modal-cancel').addEventListener('click',  closeModal);
  document.getElementById('modal-save-btn').addEventListener('click', submitForm);

  // Live recalc
  document.getElementById('modal-form').addEventListener('input', updateLiveResults);

  // KTR quick-fill
  document.getElementById('btn-ktr').addEventListener('click', () => {
    const pct = parseFloat(document.getElementById('ktr-share').value);
    if (isNaN(pct) || pct < 0 || pct > 100) { alert('Введите долю локализации 0–100'); return; }
    applyKTR(pct);
  });

  // Load data
  if (user && user.role === 'admin') {
    await Promise.all([loadProducts(), loadManagers()]);
    fillManagerSelects();
  } else {
    await loadProducts();
  }
  renderCards();
});
