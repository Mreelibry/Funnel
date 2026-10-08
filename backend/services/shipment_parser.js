// ── Разбор списков отправок из Excel / Google Таблиц ──
// Понимает форматы, в которых бухгалтер присылает отправки:
//   1) «Бренд — ИП …» / «Дата: …» / модель / «Размер | Цвет Арт.… | …» / строки размеров
//   2) «БРЕНД: …» / «Владелец: …» / «МОДЕЛЬ: …» / «Цвет | XS | S | … | Итого» / строки цветов
// На входе — двумерный массив ячеек одного листа, на выходе — структура отправки.

const MONTHS = [
  ['янв', 1], ['фев', 2], ['мар', 3], ['апр', 4], ['мая', 5], ['май', 5], ['июн', 6],
  ['июл', 7], ['авг', 8], ['сен', 9], ['окт', 10], ['ноя', 11], ['дек', 12],
];

const SIZE_RE = /^(X{0,4}S|M|X{0,4}L|\d?XL|\d{2,3}(-\d{2,3})?|ONE\s?SIZE|OS|Б\/Р)$/i;

function cellText(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/ /g, ' ').trim();
}

function toQty(v) {
  if (typeof v === 'number') return Math.round(v);
  const m = cellText(v).replace(/\s/g, '').match(/^-?\d+/);
  return m ? parseInt(m[0], 10) : null;
}

// «6 окт. 2026г.», «29 сент. 2026 г.», «2октября 2026», «26 августа» → '2026-10-06'
function parseRuDate(text, fallbackYear) {
  const s = cellText(text).toLowerCase();
  const num = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (num) {
    const y = num[3].length === 2 ? 2000 + +num[3] : +num[3];
    return iso(y, +num[2], +num[1]);
  }
  const m = s.match(/(\d{1,2})\s*([а-яё]+)\.?\s*(\d{4})?/);
  if (!m) return null;
  const month = MONTHS.find(([p]) => m[2].startsWith(p));
  if (!month) return null;
  const year = m[3] ? +m[3] : (fallbackYear || new Date().getFullYear());
  return iso(year, month[1], +m[1]);
}

function iso(y, mo, d) {
  if (!y || !mo || !d || mo > 12 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// «Красный Арт.2лямка красный» / «Белый\n (Арт.вилка белый)» → { color, article }
function splitColor(text) {
  const s = cellText(text).replace(/\s+/g, ' ');
  const m = s.match(/^(.*?)[\s(]*Арт\.?\s*(.*?)\)?\s*$/i);
  if (!m) return { color: s, article: '' };
  return { color: m[1].trim(), article: m[2].trim() };
}

// «AESTA — ИП Нурланова А.», «LINEA ИП Джуматаева Т (26 августа)», «By Alsu - ИП Нурланов Э.»
function looksLikeBrand(text) {
  return /(^|[\s—–-])ИП(\s|$|\.)/i.test(text);
}

function splitBrand(text) {
  let s = cellText(text).replace(/\s+/g, ' ');
  let date = null;
  const paren = s.match(/\(([^)]*\d[^)]*)\)\s*$/);
  if (paren) { date = paren[1]; s = s.slice(0, paren.index).trim(); }
  const m = s.match(/^(.*?)(?:\s*[—–-]\s*|\s+)(ИП\b.*)$/i) || s.match(/^(.*?)\s+(ИП\s.*)$/i);
  if (!m) return { brand: s, owner: '', dateText: date };
  return { brand: m[1].replace(/[\s—–-]+$/, '').trim(), owner: m[2].trim(), dateText: date };
}

function cleanModel(text) {
  let s = cellText(text).replace(/\s+/g, ' ');
  let kind = 'ship';
  const pref = s.match(/^(ОТГРУЗКА|ВОЗВРАТЫ?|МОДЕЛЬ)\s*:\s*/i);
  if (pref) {
    if (/^ВОЗВРАТ/i.test(pref[1])) kind = 'return';
    s = s.slice(pref[0].length);
  }
  return { model: s.trim(), kind };
}

function guessYear(text) {
  const m = cellText(text).match(/20\d{2}/);
  return m ? +m[0] : null;
}

function sumGroups(groups) {
  let sum = 0;
  for (const g of groups) for (const it of g.items) for (const v of Object.values(it.qty)) sum += v;
  return sum;
}

/**
 * @param {Array<Array<any>>} rows  ячейки листа
 * @param {string} sheetName        имя листа («от 6 октября (Азамат фф)»)
 * @returns {{ title, ship_date, fulfillment, blocks, warnings }}
 */
function parseSheet(rows, sheetName = '') {
  const blocks = [];
  const warnings = [];
  let brand = null;
  let group = null;
  let pendingModel = null;
  let mode = null;           // 'colors' — цвета в колонках, 'sizes' — размеры в колонках
  let colIdx = [];           // индексы колонок с цветами / размерами
  let statedColTotals = null;
  let year = guessYear(sheetName);

  const ensureBrand = () => {
    if (!brand) { brand = { brand: '', owner: '', date: null, groups: [] }; blocks.push(brand); }
    return brand;
  };
  const closeTable = () => {
    if (group && statedColTotals && mode === 'colors') {
      group.items.forEach((it, i) => {
        const stated = statedColTotals[i];
        const real = Object.values(it.qty).reduce((a, b) => a + (b || 0), 0);
        if (stated !== null && stated !== undefined && stated !== real) {
          warnings.push(`${brand?.brand || '—'} / ${group.model} / ${it.color}: в файле «Общ: ${stated}», а по размерам ${real}`);
        }
      });
    }
    mode = null; colIdx = []; statedColTotals = null;
  };

  for (const raw of rows) {
    const cells = (raw || []).map(cellText);
    const filled = cells.map((c, i) => (c ? i : -1)).filter(i => i >= 0);
    if (!filled.length) continue;
    const first = cells[filled[0]];
    const distinct = [...new Set(filled.map(i => cells[i]))];

    if (/^дата\s*:?/i.test(first)) {
      year = guessYear(first) || year;
      ensureBrand().date = parseRuDate(first.replace(/^дата\s*:?/i, ''), year);
      continue;
    }
    if (/^бренд\s*:/i.test(first)) {
      closeTable();
      brand = { brand: first.replace(/^бренд\s*:\s*/i, ''), owner: '', date: null, groups: [] };
      blocks.push(brand); group = null; pendingModel = null;
      continue;
    }
    if (/^владелец\s*:/i.test(first)) {
      ensureBrand().owner = first.replace(/^владелец\s*:\s*/i, '');
      continue;
    }
    if (/^общ[^:]*:?$/i.test(first) && mode === 'colors' && !/кол/i.test(first)) {
      statedColTotals = colIdx.map(i => toQty(cells[i]));
      continue;
    }
    if (/^(общ|итого|всего)/i.test(first)) {
      // Сверяем заявленные итоги: «Общ.кол-во: 280 ед», «Общ.кол-во (Итого): 400 ед», «ИТОГО ИП: 350 ед.»
      const stated = toQty(cells[filled[1]]) ?? toQty((first.match(/:\s*(\d[\d\s]*)/) || [])[1]);
      const isBrandTotal = /итого/i.test(first) && !/итого\s+по\s/i.test(first);
      if (stated !== null && brand) {
        if (isBrandTotal) {
          const real = sumGroups(brand.groups.filter(g => g.kind === 'ship'));
          if (real !== stated) warnings.push(`${brand.brand || '—'}: в файле «Итого ${stated}», а по моделям ${real}`);
        } else if (group && /кол/i.test(first) && !/^общее/i.test(first)) {
          const real = sumGroups([group]);
          if (real !== stated) warnings.push(`${brand.brand || '—'} / ${group.model}: в файле «Общ.кол-во ${stated}», а по цветам ${real}`);
        }
      }
      continue;
    }

    if (/^размер/i.test(first) && filled.length > 1) {
      closeTable();
      const { model, kind } = cleanModel(pendingModel || '');
      group = { model, kind, sizes: [], items: [] };
      ensureBrand().groups.push(group);
      pendingModel = null;
      mode = 'colors';
      colIdx = filled.slice(1);
      group.items = colIdx.map(i => ({ ...splitColor(cells[i]), qty: {} }));
      continue;
    }
    if (/^цвет$/i.test(first) && filled.length > 1) {
      closeTable();
      const { model, kind } = cleanModel(pendingModel || '');
      group = { model, kind, sizes: [], items: [] };
      ensureBrand().groups.push(group);
      pendingModel = null;
      mode = 'sizes';
      colIdx = filled.slice(1).filter(i => !/^итого/i.test(cells[i]));
      group.sizes = colIdx.map(i => cells[i]);
      continue;
    }

    if (mode === 'colors' && SIZE_RE.test(first)) {
      const size = first.toUpperCase();
      group.sizes.push(size);
      colIdx.forEach((ci, k) => {
        const q = toQty(cells[ci]);
        if (q) group.items[k].qty[size] = q;
      });
      continue;
    }
    if (mode === 'sizes' && filled.length > 1 && filled.slice(1).some(i => toQty(cells[i]) !== null)) {
      const item = { ...splitColor(first), qty: {} };
      colIdx.forEach((ci, k) => {
        const q = toQty(cells[ci]);
        if (q) item.qty[group.sizes[k]] = q;
      });
      group.items.push(item);
      continue;
    }

    // Однострочный заголовок: бренд или модель
    if (distinct.length === 1) {
      closeTable();
      if (looksLikeBrand(first)) {
        const b = splitBrand(first);
        brand = { brand: b.brand, owner: b.owner, date: b.dateText ? parseRuDate(b.dateText, year) : null, groups: [] };
        blocks.push(brand); group = null; pendingModel = null;
      } else {
        pendingModel = first;
      }
    }
  }
  closeTable();

  // Убираем пустые колонки/группы
  for (const b of blocks) {
    for (const g of b.groups) g.items = g.items.filter(it => it.color || Object.keys(it.qty).length);
    b.groups = b.groups.filter(g => g.items.length);
  }
  const cleanBlocks = blocks.filter(b => b.groups.length);

  const title = cellText(sheetName);
  const ff = title.match(/\(([^)]+)\)\s*$/);
  const titleDate = parseRuDate(title.replace(/\([^)]*\)/g, ''), year || guessYear(cleanBlocks[0]?.date));
  return {
    title: title || 'Отправка',
    ship_date: titleDate || cleanBlocks.find(b => b.date)?.date || null,
    fulfillment: ff ? ff[1].trim() : '',
    blocks: cleanBlocks,
    warnings,
  };
}

// Сумма единиц: kind = 'ship' (отгрузка), 'return' (возвраты)
function totalQty(blocks, kind = 'ship') {
  let sum = 0;
  for (const b of blocks || []) for (const g of b.groups || []) {
    if ((g.kind || 'ship') !== kind) continue;
    for (const it of g.items || []) for (const v of Object.values(it.qty || {})) sum += +v || 0;
  }
  return sum;
}

module.exports = { parseSheet, parseRuDate, splitColor, totalQty };
