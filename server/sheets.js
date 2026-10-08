'use strict';

// Синхронизация отправок в Google Таблицу: одна отправка = один лист.
// Доступ — через сервисный аккаунт; таблицу нужно расшарить на его e-mail (Редактор).

const fs = require('node:fs');
const { JWT } = require('google-auth-library');
const { buildLayout } = require('./layout');

const API = 'https://sheets.googleapis.com/v4/spreadsheets';
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '';

function loadCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    return JSON.parse(text);
  }
  const file = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (file && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  return null;
}

let client = null;
let serviceEmail = '';
try {
  const creds = loadCredentials();
  if (creds && creds.client_email && creds.private_key && SPREADSHEET_ID) {
    serviceEmail = creds.client_email;
    client = new JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }
} catch (e) {
  console.error('Google Sheets: не удалось прочитать ключ сервисного аккаунта —', e.message);
}

const enabled = () => Boolean(client);

function status() {
  return {
    enabled: enabled(),
    serviceEmail,
    spreadsheetUrl: SPREADSHEET_ID ? `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit` : null,
  };
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await client.request({
    url: `${API}/${SPREADSHEET_ID}${path}`,
    method,
    data: body,
    validateStatus: () => true,
  });
  if (res.status >= 400) {
    const msg = (res.data && res.data.error && res.data.error.message) || `HTTP ${res.status}`;
    throw new Error(`Google Sheets: ${msg}`);
  }
  return res.data;
}

// ---------- оформление ----------

const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 };
};
const border = { style: 'SOLID', color: rgb('#c9ced6') };
const boxed = { top: border, bottom: border, left: border, right: border };
const UNITS = { type: 'NUMBER', pattern: '0" ед"' };

const STYLES = {
  title: { textFormat: { bold: true, fontSize: 14 } },
  subtitle: { textFormat: { foregroundColor: rgb('#6b7280') } },
  comment: { textFormat: { italic: true, foregroundColor: rgb('#6b7280') }, wrapStrategy: 'WRAP' },
  brand: {
    backgroundColor: rgb('#1f2937'),
    textFormat: { bold: true, fontSize: 12, foregroundColor: rgb('#ffffff') },
  },
  date: { textFormat: { foregroundColor: rgb('#374151') } },
  model: { backgroundColor: rgb('#dbeafe'), textFormat: { bold: true }, borders: boxed },
  modelReturn: { backgroundColor: rgb('#fde68a'), textFormat: { bold: true }, borders: boxed },
  head: {
    backgroundColor: rgb('#f3f4f6'), textFormat: { bold: true }, borders: boxed,
    wrapStrategy: 'WRAP', horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
  },
  size: { textFormat: { bold: true }, borders: boxed, horizontalAlignment: 'CENTER' },
  qty: { borders: boxed, horizontalAlignment: 'CENTER' },
  sumLabel: { textFormat: { bold: true }, borders: boxed, backgroundColor: rgb('#f9fafb') },
  sum: { textFormat: { bold: true }, borders: boxed, backgroundColor: rgb('#f9fafb'), horizontalAlignment: 'CENTER', numberFormat: UNITS },
  totalLabel: { textFormat: { bold: true } },
  total: { textFormat: { bold: true }, horizontalAlignment: 'CENTER', numberFormat: UNITS },
  grandLabel: { textFormat: { bold: true }, backgroundColor: rgb('#dcfce7') },
  grand: { textFormat: { bold: true }, backgroundColor: rgb('#dcfce7'), horizontalAlignment: 'CENTER', numberFormat: UNITS },
  finalLabel: { textFormat: { bold: true, fontSize: 12 }, backgroundColor: rgb('#bbf7d0') },
  final: { textFormat: { bold: true, fontSize: 12 }, backgroundColor: rgb('#bbf7d0'), horizontalAlignment: 'CENTER', numberFormat: UNITS },
};

function toCell(cell) {
  if (!cell) return {};
  const out = { userEnteredFormat: STYLES[cell.style] || {} };
  if (typeof cell.value === 'number') out.userEnteredValue = { numberValue: cell.value };
  else if (cell.value != null && cell.value !== '') out.userEnteredValue = { stringValue: String(cell.value) };
  return out;
}

function buildRequests(sheetId, title, shipment) {
  const { rows, merges, width } = buildLayout(shipment);
  const rowCount = Math.max(rows.length + 20, 100);
  const colCount = Math.max(width + 2, 12);
  return [
    {
      updateSheetProperties: {
        properties: { sheetId, title, gridProperties: { rowCount, columnCount: colCount, frozenRowCount: 0 } },
        fields: 'title,gridProperties(rowCount,columnCount,frozenRowCount)',
      },
    },
    { unmergeCells: { range: { sheetId } } },
    { updateCells: { range: { sheetId }, fields: '*' } },
    {
      updateCells: {
        start: { sheetId, rowIndex: 0, columnIndex: 0 },
        rows: rows.map((r) => ({ values: r.map(toCell) })),
        fields: 'userEnteredValue,userEnteredFormat',
      },
    },
    ...merges.map((m) => ({
      mergeCells: {
        mergeType: 'MERGE_ALL',
        range: {
          sheetId,
          startRowIndex: m.row, endRowIndex: m.row + m.rows,
          startColumnIndex: m.col, endColumnIndex: m.col + m.cols,
        },
      },
    })),
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 170 }, fields: 'pixelSize',
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: colCount },
        properties: { pixelSize: 130 }, fields: 'pixelSize',
      },
    },
  ];
}

// ---------- операции ----------

async function listSheets() {
  const data = await api('?fields=sheets.properties(sheetId,title,index)');
  return (data.sheets || []).map((s) => s.properties);
}

function uniqueTitle(wanted, sheets, ownId) {
  const taken = new Set(sheets.filter((s) => s.sheetId !== ownId).map((s) => s.title.toLowerCase()));
  const base = wanted.replace(/[\[\]*?:/\\]/g, ' ').trim().slice(0, 90) || 'Отправка';
  let title = base;
  for (let i = 2; taken.has(title.toLowerCase()); i++) title = `${base} (${i})`;
  return title;
}

// Последовательная очередь, чтобы параллельные сохранения не дрались за один лист.
let queue = Promise.resolve();
const serial = (fn) => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
};

function syncShipment(shipment) {
  return serial(async () => {
    const sheets = await listSheets();
    let sheetId = shipment.sheetId;
    const exists = sheetId != null && sheets.some((s) => s.sheetId === sheetId);
    const title = uniqueTitle(shipment.title, sheets, exists ? sheetId : null);
    if (!exists) {
      const res = await api(':batchUpdate', {
        method: 'POST',
        body: { requests: [{ addSheet: { properties: { title, index: 0 } } }] },
      });
      sheetId = res.replies[0].addSheet.properties.sheetId;
    }
    await api(':batchUpdate', { method: 'POST', body: { requests: buildRequests(sheetId, title, shipment) } });
    return sheetId;
  });
}

function deleteSheet(sheetId) {
  return serial(async () => {
    const sheets = await listSheets();
    if (!sheets.some((s) => s.sheetId === sheetId)) return;
    if (sheets.length === 1) return; // последний лист удалить нельзя — просто оставляем
    await api(':batchUpdate', { method: 'POST', body: { requests: [{ deleteSheet: { sheetId } }] } });
  });
}

module.exports = { enabled, status, syncShipment, deleteSheet, buildRequests };
