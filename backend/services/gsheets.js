// ── Синхронизация отправок с Google Таблицей ──
// Каждая отправка = отдельный лист в одной таблице (GOOGLE_SHEETS_SHIPMENTS_ID).
// Доступ — через сервисный аккаунт Google (GOOGLE_SERVICE_ACCOUNT_JSON),
// которому нужно выдать права «Редактор» на таблицу.

const crypto = require('crypto');

const DEFAULT_SPREADSHEET_ID = '1daZLTn20ExCasdwpCW9bgayToJT1DUwolHC2r80b8II';
const API = 'https://sheets.googleapis.com/v4/spreadsheets';

const COLORS = {
  brand:    { red: 0.486, green: 0.227, blue: 0.929 },  // #7C3AED
  brandTxt: { red: 1, green: 1, blue: 1 },
  model:    { red: 0.929, green: 0.914, blue: 0.996 },  // #EDE9FE
  modelRet: { red: 0.996, green: 0.886, blue: 0.886 },  // #FEE2E2
  head:     { red: 0.961, green: 0.953, blue: 1 },      // #F5F3FF
  total:    { red: 0.976, green: 0.976, blue: 0.976 },
  grey:     { red: 0.45, green: 0.45, blue: 0.45 },
  border:   { red: 0.8, green: 0.8, blue: 0.85 },
};

const STATUS_LABELS = { draft: 'Черновик', sent: 'Отправлено', accepted: 'Принято' };

function spreadsheetId() {
  return process.env.GOOGLE_SHEETS_SHIPMENTS_ID || DEFAULT_SPREADSHEET_ID;
}

let credsCache;
function credentials() {
  if (credsCache !== undefined) return credsCache;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  credsCache = null;
  if (!raw) return null;
  try {
    const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const json = JSON.parse(text);
    json.private_key = String(json.private_key || '').replace(/\\n/g, '\n');
    if (json.client_email && json.private_key) credsCache = json;
  } catch (e) {
    console.error('GOOGLE_SERVICE_ACCOUNT_JSON: не удалось разобрать —', e.message);
  }
  return credsCache;
}

function isConfigured() { return !!credentials(); }

function status() {
  const c = credentials();
  return {
    configured: !!c,
    client_email: c?.client_email || null,
    spreadsheet_id: spreadsheetId(),
    spreadsheet_url: `https://docs.google.com/spreadsheets/d/${spreadsheetId()}/edit`,
  };
}

// ── OAuth: JWT сервисного аккаунта → access token ──
let tokenCache = { token: null, exp: 0 };
async function accessToken() {
  if (tokenCache.token && Date.now() < tokenCache.exp - 60_000) return tokenCache.token;
  const c = credentials();
  if (!c) throw new Error('Google не настроен: задайте GOOGLE_SERVICE_ACCOUNT_JSON');
  const b64 = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: c.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(c.private_key, 'base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google OAuth: ${data.error_description || data.error || res.status}`);
  tokenCache = { token: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return tokenCache.token;
}

async function gapi(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}/${spreadsheetId()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error?.message || `HTTP ${res.status}`;
    if (res.status === 403 || res.status === 404) {
      throw new Error(`Нет доступа к таблице. Откройте доступ «Редактор» для ${credentials()?.client_email}. (${msg})`);
    }
    throw new Error(`Google Sheets: ${msg}`);
  }
  return data;
}

const batchUpdate = requests => gapi(':batchUpdate', { method: 'POST', body: { requests } });
const quote = title => `'${String(title).replace(/'/g, "''")}'`;

async function listTabs() {
  const data = await gapi('?fields=sheets.properties(sheetId,title,index)');
  return (data.sheets || []).map(s => s.properties);
}

// ── Раскладка листа в формате бухгалтера ──
function colLetter(n) { // 0 → A
  let s = '';
  for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function fmtDate(isoDate) {
  if (!isoDate) return '';
  const d = new Date(`${String(isoDate).slice(0, 10)}T00:00:00`);
  if (isNaN(d)) return String(isoDate);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function buildLayout(sh) {
  const blocks = sh.blocks || [];
  const width = Math.max(2, ...blocks.flatMap(b => (b.groups || []).map(g => (g.items || []).length + 1)));
  const rows = [];
  const fmt = [];   // { r, c0, c1, kind }
  const tables = []; // { r0, r1, c1 } — области с рамками
  const shipTotals = [];
  const retTotals = [];
  const push = (cells = [], kind, merge) => {
    const r = rows.length;
    rows.push(cells);
    if (kind) fmt.push({ r, c0: 0, c1: merge ? width : Math.max(cells.length, 1), kind, merge });
    return r;
  };

  push([sh.title || 'Отправка'], 'title', true);
  const meta = [
    sh.ship_date && `Дата отправки: ${fmtDate(sh.ship_date)}`,
    sh.fulfillment && `Фулфилмент: ${sh.fulfillment}`,
    STATUS_LABELS[sh.status] && `Статус: ${STATUS_LABELS[sh.status]}`,
  ].filter(Boolean).join('   ·   ');
  if (meta) push([meta], 'meta', true);
  if (sh.comment) push([sh.comment], 'meta', true);
  push([]);

  for (const b of blocks) {
    const groups = (b.groups || []).filter(g => (g.items || []).length);
    if (!groups.length) continue;
    push([[b.brand, b.owner].filter(Boolean).join(' — ') || 'Без бренда'], 'brand', true);
    const date = b.date || sh.ship_date;
    if (date) push([`Дата: ${fmtDate(date)}`], 'meta', true);
    push([]);
    const brandTotalCells = [];
    for (const g of groups) {
      const isRet = g.kind === 'return';
      push([(isRet ? 'ВОЗВРАТЫ: ' : '') + (g.model || 'Модель')], isRet ? 'modelRet' : 'model', true);
      const head = push(['Размер', ...g.items.map(it => it.article ? `${it.color}\nАрт.${it.article}` : it.color)], 'head');
      const sizes = (g.sizes && g.sizes.length) ? g.sizes : ['—'];
      for (const size of sizes) {
        push([size, ...g.items.map(it => { const q = it.qty?.[size]; return q ? +q : ''; })]);
      }
      const first = head + 2, last = head + 1 + sizes.length; // 1-based строки размеров
      const totalRow = push(['Общ:', ...g.items.map((_, i) => `=SUM(${colLetter(i + 1)}${first}:${colLetter(i + 1)}${last})`)], 'total');
      tables.push({ r0: head, r1: totalRow, c1: g.items.length + 1 });
      const sumRow = push(['Общ.кол-во:', `=SUM(B${totalRow + 1}:${colLetter(g.items.length)}${totalRow + 1})`], 'sum');
      (isRet ? retTotals : brandTotalCells).push(`B${sumRow + 1}`);
      push([]);
    }
    if (brandTotalCells.length > 1) {
      const r = push(['Общ.кол-во (Итого):', `=${brandTotalCells.join('+')}`], 'grand');
      shipTotals.push(`B${r + 1}`);
    } else {
      shipTotals.push(...brandTotalCells);
    }
    push([]);
  }

  if (shipTotals.length) push(['ИТОГО ПО ОТПРАВКЕ:', `=${shipTotals.join('+')}`], 'final');
  if (retTotals.length) push(['ИТОГО ВОЗВРАТОВ:', `=${retTotals.join('+')}`], 'final');
  return { rows, fmt, tables, width };
}

function formatRequests(sheetId, layout) {
  const range = (r, c0, c1, r1 = r + 1) => ({ sheetId, startRowIndex: r, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 });
  const cell = (r, c0, c1, f, fields) => ({ repeatCell: { range: range(r, c0, c1), cell: { userEnteredFormat: f }, fields: `userEnteredFormat(${fields})` } });
  const styles = {
    title:    [{ textFormat: { bold: true, fontSize: 14 } }, 'textFormat'],
    meta:     [{ textFormat: { italic: true, foregroundColor: COLORS.grey } }, 'textFormat'],
    brand:    [{ backgroundColor: COLORS.brand, textFormat: { bold: true, fontSize: 12, foregroundColor: COLORS.brandTxt } }, 'backgroundColor,textFormat'],
    model:    [{ backgroundColor: COLORS.model, textFormat: { bold: true } }, 'backgroundColor,textFormat'],
    modelRet: [{ backgroundColor: COLORS.modelRet, textFormat: { bold: true } }, 'backgroundColor,textFormat'],
    head:     [{ backgroundColor: COLORS.head, textFormat: { bold: true }, wrapStrategy: 'WRAP', horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' }, 'backgroundColor,textFormat,wrapStrategy,horizontalAlignment,verticalAlignment'],
    total:    [{ backgroundColor: COLORS.total, textFormat: { bold: true } }, 'backgroundColor,textFormat'],
    sum:      [{ textFormat: { bold: true } }, 'textFormat'],
    grand:    [{ backgroundColor: COLORS.model, textFormat: { bold: true } }, 'backgroundColor,textFormat'],
    final:    [{ backgroundColor: COLORS.brand, textFormat: { bold: true, fontSize: 12, foregroundColor: COLORS.brandTxt } }, 'backgroundColor,textFormat'],
  };
  const reqs = [
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 190 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: layout.width }, properties: { pixelSize: 150 }, fields: 'pixelSize' } },
    { repeatCell: { range: { sheetId, startColumnIndex: 1, endColumnIndex: layout.width }, cell: { userEnteredFormat: { horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat.horizontalAlignment' } },
  ];
  for (const f of layout.fmt) {
    const [style, fields] = styles[f.kind];
    if (f.merge) reqs.push({ mergeCells: { range: range(f.r, 0, layout.width), mergeType: 'MERGE_ALL' } });
    reqs.push(cell(f.r, f.c0, f.merge ? layout.width : f.c1, style, fields));
  }
  const border = { style: 'SOLID', color: COLORS.border };
  for (const t of layout.tables) {
    reqs.push({ updateBorders: { range: range(t.r0, 0, t.c1, t.r1 + 1), top: border, bottom: border, left: border, right: border, innerHorizontal: border, innerVertical: border } });
  }
  return reqs;
}

function uniqueTitle(wanted, tabs, ownGid) {
  const base = (String(wanted || 'Отправка').replace(/[\[\]*?:\/\\]/g, ' ').trim() || 'Отправка').slice(0, 95);
  const taken = new Set(tabs.filter(t => t.sheetId !== ownGid).map(t => t.title.toLowerCase()));
  let title = base;
  for (let i = 2; taken.has(title.toLowerCase()); i++) title = `${base} (${i})`;
  return title;
}

// Записывает отправку на её лист (создаёт лист при необходимости). Возвращает { gid, title }.
async function syncShipment(sh) {
  const layout = buildLayout(sh);
  const tabs = await listTabs();
  let gid = tabs.some(t => t.sheetId === sh.sheet_gid) ? sh.sheet_gid : null;
  const title = uniqueTitle(sh.title, tabs, gid);
  const grid = { rowCount: Math.max(layout.rows.length + 20, 100), columnCount: Math.max(layout.width + 2, 10) };

  if (gid !== null) {
    await batchUpdate([
      { unmergeCells: { range: { sheetId: gid } } },
      { updateCells: { range: { sheetId: gid }, fields: '*' } },
      { updateSheetProperties: { properties: { sheetId: gid, title, gridProperties: grid }, fields: 'title,gridProperties(rowCount,columnCount)' } },
    ]);
  } else {
    const res = await batchUpdate([{ addSheet: { properties: { title, index: 0, gridProperties: grid, tabColor: COLORS.brand } } }]);
    gid = res.replies[0].addSheet.properties.sheetId;
  }

  await gapi(`/values/${encodeURIComponent(`${quote(title)}!A1`)}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    body: { values: layout.rows },
  });
  await batchUpdate(formatRequests(gid, layout));
  return { gid, title };
}

async function deleteTab(gid) {
  if (gid === null || gid === undefined) return false;
  const tabs = await listTabs();
  if (!tabs.some(t => t.sheetId === gid) || tabs.length < 2) return false;
  await batchUpdate([{ deleteSheet: { sheetId: gid } }]);
  return true;
}

// Читает все листы таблицы: [{ gid, title, rows }]
async function readAllTabs() {
  const tabs = await listTabs();
  if (!tabs.length) return [];
  const qs = tabs.map(t => `ranges=${encodeURIComponent(quote(t.title))}`).join('&');
  const data = await gapi(`/values:batchGet?${qs}&valueRenderOption=UNFORMATTED_VALUE`);
  return tabs.map((t, i) => ({ gid: t.sheetId, title: t.title, rows: data.valueRanges?.[i]?.values || [] }));
}

module.exports = { isConfigured, status, syncShipment, deleteTab, readAllTabs, buildLayout };
