import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseSchedule } from './lib/schedule.js';
import { compare } from './lib/match.js';
import { saveSchedule, hasSchedule, listSchedules, getRows, getOriginal } from './lib/store.js';
import { getLogs } from './lib/logs.js';
import { buildExport } from './lib/export.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ''))) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

app.use(express.static(join(__dirname, 'public')));

app.get('/api/schedules', (_req, res) => {
  res.json(listSchedules());
});

app.post(
  '/api/schedules',
  express.raw({ type: '*/*', limit: '10mb' }),
  async (req, res) => {
    const filename = String(req.query.filename ?? '').trim();
    if (/\.xls$/i.test(filename)) {
      return res.status(400).json({
        error: 'ไม่รองรับไฟล์ .xls แบบเก่า กรุณาเปิดไฟล์ใน Excel แล้ว Save As เป็น .xlsx (ชื่อไฟล์ YYYY-MM-DD.xlsx)'
      });
    }

    const match = filename.match(/^(\d{4}-\d{2}-\d{2})\.xlsx$/i);
    if (!match || !isValidDate(match[1])) {
      return res.status(400).json({
        error: 'ชื่อไฟล์ต้องเป็นรูปแบบ YYYY-MM-DD.xlsx และเป็นวันที่ที่มีจริง เช่น 2026-11-16.xlsx'
      });
    }

    const date = match[1];
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: 'ไม่พบข้อมูลไฟล์ที่อัปโหลด' });
    }

    if (hasSchedule(date) && req.query.overwrite !== '1') {
      return res.status(409).json({
        error: `มีผังวันที่ ${date} อยู่แล้ว ต้องการแทนที่หรือไม่`,
        date
      });
    }

    let rows;
    try {
      rows = await parseSchedule(req.body);
    } catch (err) {
      return res.status(400).json({
        error: err.message || 'ไฟล์นี้ไม่ใช่รูปแบบผังออกอากาศที่รองรับ'
      });
    }

    saveSchedule(date, filename, req.body, rows);
    return res.json({ date, filename, rowCount: rows.length });
  }
);

app.get('/api/compare/:date', async (req, res) => {
  const { date } = req.params;
  if (!isValidDate(date)) {
    return res.status(400).json({ error: 'รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)' });
  }

  if (!hasSchedule(date)) {
    return res.status(404).json({ error: `ไม่พบผังออกอากาศของวันที่ ${date}` });
  }

  const scheduleRows = getRows(date);
  let logs = [];
  let logError = null;

  try {
    logs = await getLogs(date);
  } catch (err) {
    logError = `เชื่อมต่อฐานข้อมูล log ไม่ได้: ${err.message || err.code || 'ไม่ทราบสาเหตุ'}`;
  }

  const result = compare(scheduleRows, logs);
  return res.json({
    date,
    ...result,
    logError
  });
});

app.get('/api/compare/:date/export', async (req, res) => {
  const { date } = req.params;
  if (!isValidDate(date)) {
    return res.status(400).json({ error: 'รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)' });
  }

  const original = getOriginal(date);
  if (!original) {
    return res.status(404).json({ error: `ไม่พบผังออกอากาศของวันที่ ${date}` });
  }

  const scheduleRows = getRows(date);
  let logs = [];
  try {
    logs = await getLogs(date);
  } catch {
    logs = [];
  }

  const { rows: comparedRows } = compare(scheduleRows, logs);
  const outBuffer = await buildExport(original, comparedRows);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${date}_played.xlsx"`);
  return res.send(outBuffer);
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`MCR As-Run Comparator listening on http://localhost:${port}`);
});
