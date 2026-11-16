import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const dbPath = process.env.SQLITE_PATH || 'data/app.db';
mkdirSync(dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS schedules (
    date TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    imported_at TEXT NOT NULL,
    original BLOB NOT NULL
  );
  CREATE TABLE IF NOT EXISTS schedule_rows (
    date TEXT NOT NULL REFERENCES schedules(date) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    row_number INTEGER NOT NULL,
    kind TEXT NOT NULL,
    program TEXT,
    brk TEXT,
    title TEXT,
    length TEXT,
    aoe TEXT,
    plan_code TEXT,
    quotation TEXT,
    live_tape TEXT,
    PRIMARY KEY (date, seq)
  );
`);

export function saveSchedule(date, filename, buffer, rows) {
  const del = db.prepare('DELETE FROM schedules WHERE date = ?');
  const insSched = db.prepare(
    'INSERT INTO schedules (date, filename, imported_at, original) VALUES (?, ?, ?, ?)'
  );
  const insRow = db.prepare(`
    INSERT INTO schedule_rows
      (date, seq, row_number, kind, program, brk, title, length, aoe, plan_code, quotation, live_tape)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec('BEGIN');
  try {
    del.run(date);
    insSched.run(date, filename, new Date().toISOString(), buffer);
    rows.forEach((r, idx) => {
      insRow.run(
        date,
        idx,
        r.rowNumber ?? r.row_number,
        r.kind,
        r.program ?? null,
        r.brk ?? null,
        r.title ?? null,
        r.length ?? null,
        r.aoe ?? null,
        r.planCode ?? r.plan_code ?? null,
        r.quotation ?? null,
        r.liveTape ?? r.live_tape ?? null
      );
    });
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function hasSchedule(date) {
  const row = db.prepare('SELECT 1 FROM schedules WHERE date = ?').get(date);
  return Boolean(row);
}

export function listSchedules() {
  return db.prepare('SELECT date, filename, imported_at FROM schedules ORDER BY date DESC').all();
}

export function getRows(date) {
  const rows = db.prepare('SELECT * FROM schedule_rows WHERE date = ? ORDER BY seq ASC').all(date);
  return rows.map(r => ({
    rowNumber: r.row_number,
    row_number: r.row_number,
    seq: r.seq,
    kind: r.kind,
    program: r.program,
    brk: r.brk,
    title: r.title,
    length: r.length,
    aoe: r.aoe,
    planCode: r.plan_code,
    quotation: r.quotation,
    liveTape: r.live_tape
  }));
}

export function getOriginal(date) {
  const row = db.prepare('SELECT original FROM schedules WHERE date = ?').get(date);
  return row ? Buffer.from(row.original) : null;
}
