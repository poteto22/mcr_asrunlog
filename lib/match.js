export const norm = s => {
  const str = String(s ?? '').trim();
  const idx = str.indexOf('#');
  const key = idx >= 0 ? str.slice(0, idx) : str;
  return key.toLowerCase().replace(/[\s_-]+/g, ' ').trim();
};

export function align(items, logs) {
  const a = items.map(i => norm(i.title)), b = logs.map(l => norm(l.title));
  const n = a.length, m = b.length;
  // ให้คะแนนจับคู่หลักเป็น BASE (1e9) และหักค่าตำแหน่ง (i + j) เล็กน้อย
  // เพื่อว่าเมื่อจำนวนคู่ที่จับได้เท่ากัน จะเลือกแถวในผังและ log ที่อยู่ก่อนเสมอ (ไม่กระโดดข้ามเบรกไปจับตัวซ้ำท้ายผัง)
  const BASE = 1e9;
  const L = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      L[i][j] =
        a[i] === b[j]
          ? Math.max(L[i + 1][j + 1] + (BASE - i - j), L[i + 1][j], L[i][j + 1])
          : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = Array(n).fill(null);
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (a[i] === b[j] && L[i][j] === L[i + 1][j + 1] + (BASE - i - j)) {
      out[i] = j;
      i++;
      j++;
    } else if (L[i + 1][j] >= L[i][j + 1]) i++;
    else j++;
  }
  return out;
}

function toSeconds(timeStr) {
  if (!timeStr) return null;
  const parts = String(timeStr).split(':').map(Number);
  if (parts.length < 2 || parts.some(Number.isNaN)) return null;
  return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0);
}

export function compare(rows, logs) {
  const sortedLogs = [...logs].sort((x, y) => {
    if (x.startTime == null && y.startTime == null) return 0;
    if (x.startTime == null) return -1;
    if (y.startTime == null) return 1;
    return String(x.startTime).localeCompare(String(y.startTime));
  });

  // แบ่งกลุ่มรายการตามเบรก (เปลี่ยนกลุ่มเมื่อเจอแถวที่ไม่ใช่ item หรือเปลี่ยน program/brk)
  const items = [];
  const breaks = new Map();
  let breakId = 0;
  let lastBreakKey = null;

  for (const r of rows) {
    if (r.kind === 'item') {
      const key = `${r.program ?? ''}__${r.brk ?? ''}`;
      if (key !== lastBreakKey) {
        breakId++;
        lastBreakKey = key;
      }
      const idx = items.length;
      items.push(r);
      if (!breaks.has(breakId)) breaks.set(breakId, []);
      breaks.get(breakId).push(idx);
    } else {
      lastBreakKey = null;
    }
  }

  // รอบที่ 1: จับคู่ตามลำดับทั้งวันด้วย LCS
  const matched = align(items, sortedLogs);
  const usedLogs = new Set(matched.filter(m => m !== null));

  // รอบที่ 2: กวาดหาไฟล์ที่เล่นสลับลำดับภายในขอบเขตของเบรกเดียวกัน
  const MAX_BREAK_WINDOW_SEC = 15 * 60;
  for (const idxs of breaks.values()) {
    const anchors = idxs.map(i => matched[i]).filter(m => m !== null);
    if (anchors.length === 0) continue;

    let prevMaxLog = -1;
    for (let i = idxs[0] - 1; i >= 0; i--) {
      if (matched[i] !== null) {
        prevMaxLog = matched[i];
        break;
      }
    }
    let nextMinLog = sortedLogs.length;
    for (let i = idxs[idxs.length - 1] + 1; i < items.length; i++) {
      if (matched[i] !== null) {
        nextMinLog = matched[i];
        break;
      }
    }

    const anchorSecs = anchors
      .map(m => toSeconds(sortedLogs[m].startTime))
      .filter(v => v !== null);
    const minSec = anchorSecs.length ? Math.min(...anchorSecs) : null;
    const maxSec = anchorSecs.length ? Math.max(...anchorSecs) : null;

    for (const i of idxs) {
      if (matched[i] !== null) continue;
      const targetTitle = norm(items[i].title);
      for (let j = prevMaxLog + 1; j < nextMinLog; j++) {
        if (usedLogs.has(j)) continue;
        if (norm(sortedLogs[j].title) !== targetTitle) continue;
        const sec = toSeconds(sortedLogs[j].startTime);
        if (
          sec !== null &&
          minSec !== null &&
          (sec < minSec - MAX_BREAK_WINDOW_SEC || sec > maxSec + MAX_BREAK_WINDOW_SEC)
        ) {
          continue;
        }
        matched[i] = j;
        usedLogs.add(j);
        break;
      }
    }
  }

  // ตรวจสอบการสลับลำดับภายในแต่ละเบรกเทียบกับลำดับที่เล่นจริงใน log
  const swappedMap = new Map();
  for (const idxs of breaks.values()) {
    const matchedInBreak = idxs.filter(i => matched[i] !== null);
    const chronologicalLogIndices = matchedInBreak
      .map(i => matched[i])
      .sort((a, b) => a - b);

    for (let p = 0; p < matchedInBreak.length; p++) {
      const itemIdx = matchedInBreak[p];
      const slotLogIdx = chronologicalLogIndices[p];
      if (norm(items[itemIdx].title) !== norm(sortedLogs[slotLogIdx].title)) {
        swappedMap.set(itemIdx, sortedLogs[slotLogIdx].title);
      }
    }
  }

  const lastMatchedIdx = matched.findLastIndex(m => m !== null);

  let played = 0, swapped = 0, missing = 0, pending = 0, itemIdx = 0;
  const outRows = rows.map(row => {
    if (row.kind !== 'item') return { ...row };
    const mIdx = matched[itemIdx];
    let status, playedAt = null, logTitle = null;
    if (mIdx !== null) {
      playedAt = sortedLogs[mIdx].startTime ?? null;
      if (swappedMap.has(itemIdx)) {
        status = 'swapped';
        logTitle = swappedMap.get(itemIdx);
        swapped++;
      } else {
        status = 'played';
        played++;
      }
    } else if (itemIdx < lastMatchedIdx) {
      status = 'missing';
      missing++;
    } else {
      status = 'pending';
      pending++;
    }
    itemIdx++;
    return { ...row, status, playedAt, logTitle };
  });

  let lastLogTime = null;
  for (let i = sortedLogs.length - 1; i >= 0; i--) {
    if (sortedLogs[i].startTime) {
      lastLogTime = sortedLogs[i].startTime;
      break;
    }
  }

  return {
    rows: outRows,
    summary: { played, swapped, missing, pending, total: items.length },
    logCount: sortedLogs.length,
    lastLogTime
  };
}
