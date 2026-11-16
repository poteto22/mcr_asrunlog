import ExcelJS from 'exceljs';

function cellText(row, col) {
  const cell = row.getCell(col);
  if (cell.isMerged && cell.master.address !== cell.address) return '';
  return String(cell.text ?? '').trim();
}

export async function parseSchedule(buffer) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw new Error('ไฟล์นี้ไม่ใช่รูปแบบผังออกอากาศที่รองรับ (ต้องเป็นไฟล์ .xlsx)');
  }

  const ws = wb.worksheets[0];
  if (!ws || ws.rowCount < 1) {
    throw new Error('ไฟล์นี้ไม่ใช่รูปแบบผังออกอากาศที่รองรับ');
  }

  const row1 = ws.getRow(1);
  if (cellText(row1, 2) !== 'PROGRAM') {
    throw new Error('ไฟล์นี้ไม่ใช่รูปแบบผังออกอากาศที่รองรับ');
  }

  const rows = [];
  let currentProgram = '';
  let currentBrk = '';

  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const a = cellText(row, 1);
    const b = cellText(row, 2);
    const c = cellText(row, 3);
    const d = cellText(row, 4);
    const e = cellText(row, 5);
    const f = cellText(row, 6);
    const g = cellText(row, 7);

    if (r === 1) {
      rows.push({
        rowNumber: r,
        kind: 'header',
        program: '',
        brk: '',
        title: b,
        length: c,
        aoe: d,
        planCode: e,
        quotation: f,
        liveTape: g
      });
      continue;
    }

    if (!a && !b && !c && !d && !e && !f && !g) {
      continue;
    }

    let kind;
    if (a && !b) {
      kind = 'program';
      currentProgram = a;
      currentBrk = '';
    } else if (c === 'นาที' && b.includes('_B')) {
      kind = 'break_header';
      currentBrk = '';
    } else if (b === 'รวม') {
      kind = 'total';
    } else if (b.includes('#')) {
      kind = 'item';
      if (a) currentBrk = a;
    } else {
      continue;
    }

    rows.push({
      rowNumber: r,
      kind,
      program: currentProgram,
      brk: kind === 'item' ? currentBrk : a,
      title: kind === 'program' ? a : b,
      length: c,
      aoe: d,
      planCode: e,
      quotation: f,
      liveTape: g
    });
  }

  return rows;
}
