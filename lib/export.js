import ExcelJS from 'exceljs';

export async function buildExport(originalBuffer, comparedRows) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(originalBuffer);
  const ws = wb.worksheets[0];

  const h1 = ws.getRow(1).getCell(8);
  h1.value = 'เวลาที่เล่น';

  for (let r = 2; r <= ws.rowCount; r++) {
    const cell = ws.getRow(r).getCell(8);
    if (!cell.isMerged || cell.master.address === cell.address) {
      cell.value = null;
    }
  }

  for (const row of comparedRows) {
    if (row.kind !== 'item') continue;
    const r = row.rowNumber ?? row.row_number;
    const cell = ws.getRow(r).getCell(8);
    if (row.status === 'played') {
      cell.value = row.playedAt || '';
    } else if (row.status === 'swapped') {
      cell.value = row.playedAt ? `${row.playedAt} (สลับลำดับ)` : 'สลับลำดับ';
      cell.font = { ...(cell.font || {}), color: { argb: 'FFD97706' } };
    } else if (row.status === 'missing') {
      cell.value = 'ไม่พบการเล่น';
      cell.font = { ...(cell.font || {}), color: { argb: 'FFDC2626' } };
    } else {
      cell.value = null;
    }
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
