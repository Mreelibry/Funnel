'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'otpravki.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS shipments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    date        TEXT NOT NULL,
    fulfillment TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'draft',
    data        TEXT NOT NULL,
    sheet_id    INTEGER,
    synced_at   TEXT,
    sync_error  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS shipments_date ON shipments(date DESC);
`);

function rowToShipment(row) {
  if (!row) return null;
  const data = JSON.parse(row.data);
  return {
    ...data,
    id: row.id,
    title: row.title,
    date: row.date,
    fulfillment: row.fulfillment,
    status: row.status,
    sheetId: row.sheet_id,
    syncedAt: row.synced_at,
    syncError: row.sync_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const stmt = {
  list: db.prepare('SELECT * FROM shipments ORDER BY date DESC, id DESC'),
  get: db.prepare('SELECT * FROM shipments WHERE id = ?'),
  insert: db.prepare(
    'INSERT INTO shipments (title, date, fulfillment, status, data) VALUES (?, ?, ?, ?, ?)'
  ),
  update: db.prepare(
    `UPDATE shipments SET title = ?, date = ?, fulfillment = ?, status = ?, data = ?,
     updated_at = datetime('now') WHERE id = ?`
  ),
  remove: db.prepare('DELETE FROM shipments WHERE id = ?'),
  syncOk: db.prepare("UPDATE shipments SET sheet_id = ?, synced_at = datetime('now'), sync_error = NULL WHERE id = ?"),
  syncFail: db.prepare('UPDATE shipments SET sync_error = ? WHERE id = ?'),
};

function serialize(s) {
  return JSON.stringify({ comment: s.comment, brands: s.brands });
}

module.exports = {
  list: () => stmt.list.all().map(rowToShipment),
  get: (id) => rowToShipment(stmt.get.get(id)),
  create(s) {
    const { lastInsertRowid } = stmt.insert.run(s.title, s.date, s.fulfillment, s.status, serialize(s));
    return this.get(Number(lastInsertRowid));
  },
  update(id, s) {
    const { changes } = stmt.update.run(s.title, s.date, s.fulfillment, s.status, serialize(s), id);
    return changes ? this.get(id) : null;
  },
  remove: (id) => stmt.remove.run(id).changes > 0,
  markSynced: (id, sheetId) => stmt.syncOk.run(sheetId, id),
  markSyncError: (id, message) => stmt.syncFail.run(String(message).slice(0, 500), id),
};
