import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { norm, align, compare } from './match.js';
import { parseSchedule } from './schedule.js';
import { buildExport } from './export.js';

test('1. ใช้รหัสหน้าเครื่องหมาย # เป็นตัวอ้างอิง แม้ข้อความหลัง # ต่างกันก็จับคู่กันได้', () => {
  const items = [
    { title: '  PM1041#PM-ขอเพียงแค่เขียนมา (45วิ) Edit 20-01-69 ' },
    { title: 'L18105#AD-SARA-Woman2 15s' },
    { title: 'L99999#ชื่อในผังเขียนแบบหนึ่ง' }
  ];
  const logs = [
    { title: 'PM1041#PM-ขอเพียงแค่เขียนมา  (45วิ)  Edit 20-01-69', startTime: '06:12:03' },
    { title: 'L18105#AD-Sara_Woman2 15s', startTime: '19:22:25' },
    { title: 'L99999#ชื่อในเครื่องเล่นเขียนอีกแบบ', startTime: '20:00:00' }
  ];
  assert.equal(norm(items[0].title), 'pm1041');
  assert.equal(norm(items[1].title), 'l18105');
  assert.equal(norm(items[2].title), norm(logs[2].title));
  assert.deepEqual(align(items, logs), [0, 1, 2]);
});

test('2. log ที่ไม่มีในผังถูกข้าม', () => {
  const items = [
    { kind: 'item', title: 'A#Spot 1' },
    { kind: 'item', title: 'B#Spot 2' }
  ];
  const logs = [
    { title: 'ID-Station', startTime: '06:00:00' },
    { title: 'A#Spot 1', startTime: '06:01:00' },
    { title: 'PG-Program Segment', startTime: '06:02:00' },
    { title: 'B#Spot 2', startTime: '06:10:00' }
  ];
  const res = compare(items, logs);
  assert.equal(res.rows[0].playedAt, '06:01:00');
  assert.equal(res.rows[0].logTitle, 'A#Spot 1');
  assert.equal(res.rows[0].extraLogsBefore.length, 1);
  assert.equal(res.rows[0].extraLogsBefore[0].title, 'ID-Station');
  assert.equal(res.rows[1].playedAt, '06:10:00');
  assert.equal(res.rows[1].logTitle, 'B#Spot 2');
  assert.equal(res.rows[1].extraLogsBefore.length, 1);
  assert.equal(res.rows[1].extraLogsBefore[0].title, 'PG-Program Segment');
  assert.deepEqual(res.summary, {
    played: 2,
    swapped: 0,
    missing: 0,
    pending: 0,
    total: 2,
    unmatchedLogs: 2
  });
});

test('3. สปอตซ้ำที่มีรายการในผังหายไป 1 รายการ แล้วรายการถัดไปยังจับคู่ถูกตัว (LCS vs greedy)', () => {
  const items = [
    { kind: 'item', brk: 'เบรค 1', title: 'S#Repeat' },
    { kind: 'item', brk: 'เบรค 1', title: 'X#Unique1' },
    { kind: 'item', brk: 'เบรค 2', title: 'S#Repeat' },
    { kind: 'item', brk: 'เบรค 2', title: 'Y#Unique2' }
  ];
  // ในเบรกแรก S#Repeat ไม่ได้เล่น แต่ X#Unique1 เล่น แล้วเบรกสอง S#Repeat และ Y#Unique2 เล่นตามปกติ
  // ถ้าใช้ greedy: S#Repeat ตัวแรกจะกระโดดไปจับกับ S#Repeat ของเบรกสอง ทำให้ X#Unique1 หลุด
  const logs = [
    { title: 'X#Unique1', startTime: '07:01:00' },
    { title: 'S#Repeat', startTime: '08:00:00' },
    { title: 'Y#Unique2', startTime: '08:01:00' }
  ];
  const res = compare(items, logs);
  assert.equal(res.rows[0].status, 'missing');
  assert.equal(res.rows[1].status, 'played');
  assert.equal(res.rows[1].playedAt, '07:01:00');
  assert.equal(res.rows[2].status, 'played');
  assert.equal(res.rows[2].playedAt, '08:00:00');
  assert.equal(res.rows[3].status, 'played');
  assert.equal(res.rows[3].playedAt, '08:01:00');
});

test('4. แยกสถานะ missing กับ pending ถูกต้อง', () => {
  const items = [
    { kind: 'item', title: 'A#1' },
    { kind: 'item', title: 'B#2' },
    { kind: 'item', title: 'C#3' },
    { kind: 'item', title: 'D#4' }
  ];
  const logs = [
    { title: 'A#1', startTime: '09:00:00' },
    { title: 'C#3', startTime: '09:05:00' }
  ];
  const res = compare(items, logs);
  assert.equal(res.rows[0].status, 'played');
  assert.equal(res.rows[1].status, 'missing');
  assert.equal(res.rows[2].status, 'played');
  assert.equal(res.rows[3].status, 'pending');
  assert.deepEqual(res.summary, {
    played: 2,
    swapped: 0,
    missing: 1,
    pending: 1,
    total: 4,
    unmatchedLogs: 0
  });
});

test('4b. ตรวจจับการเล่นสลับลำดับภายในเบรกเดียวกัน (ผัง 1,2,3,4 แต่ log เล่น 1,3,4,2)', async () => {
  const items = [
    { kind: 'item', rowNumber: 16, program: 'ข่าวเช้า', brk: 'เบรค 1', title: 'F1#Spot 1' },
    { kind: 'item', rowNumber: 17, program: 'ข่าวเช้า', brk: 'เบรค 1', title: 'F2#Spot 2' },
    { kind: 'item', rowNumber: 18, program: 'ข่าวเช้า', brk: 'เบรค 1', title: 'F3#Spot 3' },
    { kind: 'item', rowNumber: 19, program: 'ข่าวเช้า', brk: 'เบรค 1', title: 'F4#Spot 4' }
  ];
  const logs = [
    { title: 'F1#Spot 1', startTime: '10:01:00' },
    { title: 'F3#Spot 3', startTime: '10:02:00' },
    { title: 'F4#Spot 4', startTime: '10:03:00' },
    { title: 'F2#Spot 2', startTime: '10:04:00' }
  ];
  const res = compare(items, logs);
  assert.deepEqual(res.summary, {
    played: 1,
    swapped: 3,
    missing: 0,
    pending: 0,
    total: 4,
    unmatchedLogs: 0
  });

  // แถวที่ 1 (F1): ตรงลำดับ
  assert.equal(res.rows[0].status, 'played');
  assert.equal(res.rows[0].playedAt, '10:01:00');
  assert.equal(res.rows[0].logTitle, 'F1#Spot 1');

  // แถวที่ 2 (F2): สลับลำดับ, เวลาที่ F2 เล่นจริงคือ 10:04:00, ลำดับที่ 2 ใน log คือ F3
  assert.equal(res.rows[1].status, 'swapped');
  assert.equal(res.rows[1].playedAt, '10:04:00');
  assert.equal(res.rows[1].logTitle, 'F3#Spot 3');

  // แถวที่ 3 (F3): สลับลำดับ, เวลาที่ F3 เล่นจริงคือ 10:02:00, ลำดับที่ 3 ใน log คือ F4
  assert.equal(res.rows[2].status, 'swapped');
  assert.equal(res.rows[2].playedAt, '10:02:00');
  assert.equal(res.rows[2].logTitle, 'F4#Spot 4');

  // แถวที่ 4 (F4): สลับลำดับ, เวลาที่ F4 เล่นจริงคือ 10:03:00, ลำดับที่ 4 ใน log คือ F2
  assert.equal(res.rows[3].status, 'swapped');
  assert.equal(res.rows[3].playedAt, '10:03:00');
  assert.equal(res.rows[3].logTitle, 'F2#Spot 2');

  // ตรวจไฟล์ Export แสดง "HH:MM:SS (สลับลำดับ)" ในคอลัมน์ H
  const xlsxBuf = readFileSync(new URL('../2026-11-16.xlsx', import.meta.url));
  const outBuf = await buildExport(xlsxBuf, res.rows);
  const outWb = new ExcelJS.Workbook();
  await outWb.xlsx.load(outBuf);
  const outWs = outWb.worksheets[0];
  assert.equal(outWs.getRow(16).getCell(8).text.trim(), '10:01:00');
  assert.equal(outWs.getRow(17).getCell(8).text.trim(), '10:04:00 (สลับลำดับ)');
  assert.equal(outWs.getRow(18).getCell(8).text.trim(), '10:02:00 (สลับลำดับ)');
  assert.equal(outWs.getRow(19).getCell(8).text.trim(), '10:03:00 (สลับลำดับ)');
});

test('4c. เมื่อมี log ที่ไม่มีในผังคั่นกลาง ต้องจับคู่กับเบรกปัจจุบันก่อน ไม่กระโดดไปจับสปอตซ้ำในเบรกอนาคต', () => {
  const items = [
    // เบรกปัจจุบัน (ยุคล ชนข่าว เบรค 1)
    { kind: 'item', program: 'ยุคล ชนข่าว', brk: 'เบรค 1', title: 'L23140#Spot A' },
    { kind: 'item', program: 'ยุคล ชนข่าว', brk: 'เบรค 1', title: 'L21898#Spot B' },
    // เบรกอนาคตที่ยังไม่ออกอากาศ (ทันข่าวค่ำ) แต่มีสปอตชื่อเดียวกัน
    { kind: 'item', program: 'ทันข่าวค่ำ', brk: 'เบรค 1', title: 'L23124#Other' },
    { kind: 'item', program: 'ทันข่าวค่ำ', brk: 'เบรค 2', title: 'L23140#Spot A' },
    { kind: 'item', program: 'ทันข่าวค่ำ', brk: 'เบรค 3', title: 'L21898#Spot B' }
  ];
  const logs = [
    { title: 'N00064#Unscheduled Lead-in', startTime: '17:39:34' },
    { title: 'L23140#Spot A', startTime: '17:59:30' },
    { title: 'L21898#Spot B', startTime: '17:59:45' }
  ];
  const res = compare(items, logs);
  assert.equal(res.rows[0].status, 'played');
  assert.equal(res.rows[0].playedAt, '17:59:30');
  assert.equal(res.rows[1].status, 'played');
  assert.equal(res.rows[1].playedAt, '17:59:45');
  assert.equal(res.rows[2].status, 'pending');
  assert.equal(res.rows[3].status, 'pending');
  assert.equal(res.rows[4].status, 'pending');
  assert.deepEqual(res.summary, {
    played: 2,
    swapped: 0,
    missing: 0,
    pending: 3,
    total: 5,
    unmatchedLogs: 1
  });
});

test('5. ทดสอบกับไฟล์จริง 2026-11-16.xlsx และ asrunlog.json + ตรวจการ export', async () => {
  const xlsxBuf = readFileSync(new URL('../2026-11-16.xlsx', import.meta.url));
  const logs = JSON.parse(readFileSync(new URL('../asrunlog.json', import.meta.url), 'utf8'))
    .filter(l => l.date === '2026-11-16');

  const scheduleRows = await parseSchedule(xlsxBuf);
  const result = compare(scheduleRows, logs);

  // อ่าน REMARK จากไฟล์ต้นฉบับเพื่อใช้อ้างอิงในเทสต์เท่านั้น
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(xlsxBuf);
  const ws = wb.worksheets[0];

  const toMinutes = hhmm => {
    const [h, m] = hhmm.split(/[:.]/).map(Number);
    return h * 60 + m;
  };

  let remarkCount = 0;
  for (const r of result.rows) {
    if (r.kind !== 'item') continue;
    const remarkCell = ws.getRow(r.rowNumber).getCell(8);
    const remark = remarkCell.isMerged ? '' : remarkCell.text.trim();
    if (/^\d{2}\.\d{2}$/.test(remark)) {
      remarkCount++;
      assert.equal(r.status, 'played', `Row ${r.rowNumber} (${r.title}) should be played`);
      assert.ok(r.playedAt, `Row ${r.rowNumber} should have playedAt`);
      const diff = Math.abs(toMinutes(r.playedAt) - toMinutes(remark));
      assert.ok(diff <= 2, `Row ${r.rowNumber}: playedAt ${r.playedAt} vs remark ${remark} diff=${diff}m`);
    }
  }
  assert.ok(remarkCount > 100, `Expected >100 items with REMARK, got ${remarkCount}`);

  const l20935 = result.rows.find(r => r.kind === 'item' && r.title.startsWith('L20935#'));
  const n00058 = result.rows.find(r => r.kind === 'item' && r.title.startsWith('N00058#'));
  assert.ok(l20935, 'Should find L20935 in schedule');
  assert.ok(n00058, 'Should find N00058 in schedule');
  assert.equal(l20935.status, 'pending');
  assert.equal(n00058.status, 'pending');

  // ตรวจการสร้างไฟล์ export
  const outBuf = await buildExport(xlsxBuf, result.rows);
  const outWb = new ExcelJS.Workbook();
  await outWb.xlsx.load(outBuf);
  const outWs = outWb.worksheets[0];
  assert.equal(outWs.getRow(1).getCell(8).text.trim(), 'เวลาที่เล่น');
  // แถวที่ 2 เป็นชื่อรายการที่ merge cell ต้องไม่ถูกลบ
  assert.equal(outWs.getRow(2).getCell(1).text.trim(), 'ตลาดนี้มีหมอ (R) จ เที่ยงคืน');
  // แถวที่ 16 มีการเล่นจริง ต้องมีเวลา HH:MM:SS ในคอลัมน์ H
  assert.match(outWs.getRow(16).getCell(8).text.trim(), /^\d{2}:\d{2}:\d{2}$/);
  // แถวที่เป็น pending ต้องเว้นว่างในคอลัมน์ H
  assert.equal(outWs.getRow(l20935.rowNumber).getCell(8).text.trim(), '');
});
