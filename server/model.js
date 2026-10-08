'use strict';

// Структура отправки:
// {
//   title, date (YYYY-MM-DD), fulfillment, status, comment,
//   brands: [{ id, name, owner, models: [{ id, name, kind, sizes: [..], colors: [{ id, name, article, qty: { XS: 15 } }] }] }]
// }

const DEFAULT_SIZES = ['XS', 'S', 'M', 'L'];
const STATUSES = ['draft', 'sent', 'received'];
const KINDS = ['shipment', 'return'];

const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
const MONTHS_SHORT = [
  'янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.',
  'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.',
];

const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const uid = () => Math.random().toString(36).slice(2, 10);

function toQty(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1_000_000) : 0;
}

function isIsoDate(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}

function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

// "От 6 октября (Новый фф)"
function defaultTitle(date, fulfillment) {
  const { m, d } = parseDate(date);
  const base = `От ${d} ${MONTHS_GENITIVE[m - 1]}`;
  return fulfillment ? `${base} (${fulfillment})` : base;
}

// "6 окт. 2026г."
function humanDate(date) {
  const { y, m, d } = parseDate(date);
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}г.`;
}

function normalizeColor(c, sizes) {
  const qty = {};
  for (const s of sizes) {
    const q = toQty(c && c.qty && c.qty[s]);
    if (q) qty[s] = q;
  }
  return { id: str(c && c.id, 20) || uid(), name: str(c && c.name, 100), article: str(c && c.article, 100), qty };
}

function normalizeModel(m) {
  let sizes = Array.isArray(m && m.sizes) ? m.sizes.map((s) => str(s, 20)).filter(Boolean) : [];
  sizes = [...new Set(sizes)];
  if (!sizes.length) sizes = [...DEFAULT_SIZES];
  const colors = (Array.isArray(m && m.colors) ? m.colors : []).slice(0, 50).map((c) => normalizeColor(c, sizes));
  return {
    id: str(m && m.id, 20) || uid(),
    name: str(m && m.name, 150),
    kind: KINDS.includes(m && m.kind) ? m.kind : 'shipment',
    sizes,
    colors,
  };
}

function normalizeBrand(b) {
  return {
    id: str(b && b.id, 20) || uid(),
    name: str(b && b.name, 150),
    owner: str(b && b.owner, 150),
    models: (Array.isArray(b && b.models) ? b.models : []).slice(0, 100).map(normalizeModel),
  };
}

// Приводит пришедшие с клиента данные к валидной структуре. Бросает ошибку с понятным текстом.
function normalizeShipment(input) {
  if (!input || typeof input !== 'object') throw new Error('Пустые данные отправки');
  const date = isIsoDate(input.date) ? input.date : null;
  if (!date) throw new Error('Укажите дату отправки');
  const fulfillment = str(input.fulfillment, 100);
  const brands = (Array.isArray(input.brands) ? input.brands : []).slice(0, 100).map(normalizeBrand);
  for (const b of brands) {
    if (!b.name) throw new Error('У каждого бренда должно быть название');
    for (const m of b.models) if (!m.name) throw new Error(`Укажите название модели в бренде «${b.name}»`);
  }
  return {
    title: str(input.title, 90) || defaultTitle(date, fulfillment),
    date,
    fulfillment,
    status: STATUSES.includes(input.status) ? input.status : 'draft',
    comment: str(input.comment, 2000),
    brands,
  };
}

const colorTotal = (c) => Object.values(c.qty).reduce((a, b) => a + b, 0);
const modelTotal = (m) => m.colors.reduce((a, c) => a + colorTotal(c), 0);
const brandTotal = (b, kind) =>
  b.models.filter((m) => !kind || m.kind === kind).reduce((a, m) => a + modelTotal(m), 0);

function shipmentTotals(s) {
  let shipped = 0;
  let returned = 0;
  for (const b of s.brands) {
    shipped += brandTotal(b, 'shipment');
    returned += brandTotal(b, 'return');
  }
  return { shipped, returned, total: shipped + returned };
}

module.exports = {
  DEFAULT_SIZES,
  STATUSES,
  defaultTitle,
  humanDate,
  normalizeShipment,
  colorTotal,
  modelTotal,
  brandTotal,
  shipmentTotals,
};
