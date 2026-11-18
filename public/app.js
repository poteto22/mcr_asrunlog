const datePickerWrap = document.getElementById('datePickerWrap');
const datePickerBtn = document.getElementById('datePickerBtn');
const datePickerLabel = document.getElementById('datePickerLabel');
const calendarPopover = document.getElementById('calendarPopover');
const calPrevMonth = document.getElementById('calPrevMonth');
const calNextMonth = document.getElementById('calNextMonth');
const calMonthLabel = document.getElementById('calMonthLabel');
const calendarGrid = document.getElementById('calendarGrid');
const calLegendText = document.getElementById('calLegendText');

const fileInput = document.getElementById('fileInput');
const importBtn = document.getElementById('importBtn');
const emptyImportBtn = document.getElementById('emptyImportBtn');
const toggleExtraBtn = document.getElementById('toggleExtraBtn');
const countExtra = document.getElementById('countExtra');
const refreshBtn = document.getElementById('refreshBtn');
const exportBtn = document.getElementById('exportBtn');
const logMeta = document.getElementById('logMeta');

const noticeBanner = document.getElementById('noticeBanner');
const noticeText = document.getElementById('noticeText');
const noticeClose = document.getElementById('noticeClose');
const logErrorBanner = document.getElementById('logErrorBanner');
const logErrorText = document.getElementById('logErrorText');

const emptyState = document.getElementById('emptyState');
const workspace = document.getElementById('workspace');
const scheduleBody = document.getElementById('scheduleBody');
const programList = document.getElementById('programList');
const tableWrap = document.getElementById('tableWrap');

const countPlayed = document.getElementById('countPlayed');
const countSwapped = document.getElementById('countSwapped');
const countMissing = document.getElementById('countMissing');
const countPending = document.getElementById('countPending');
const countTotal = document.getElementById('countTotal');
const filterBtns = Array.from(document.querySelectorAll('.summary-item'));

const confirmDialog = document.getElementById('confirmDialog');
const modalTitle = document.getElementById('modalTitle');
const modalMessage = document.getElementById('modalMessage');
const modalCancel = document.getElementById('modalCancel');
const modalConfirm = document.getElementById('modalConfirm');

let schedules = [];
let scheduleDateSet = new Set();
let currentDate = '';
let currentData = null;
let activeFilter = 'all';
let showAllExtraLogs = false;

const now = new Date();
let calYear = now.getFullYear();
let calMonth = now.getMonth(); // 0-11

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

function showNotice(msg) {
  noticeText.textContent = msg;
  noticeBanner.hidden = false;
}

function hideNotice() {
  noticeBanner.hidden = true;
  noticeText.textContent = '';
}

noticeClose.addEventListener('click', hideNotice);

function askConfirm({ title, message, confirmLabel = 'ยืนยัน' }) {
  return new Promise(resolve => {
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modalConfirm.textContent = confirmLabel;

    const cleanup = result => {
      modalCancel.removeEventListener('click', onCancel);
      modalConfirm.removeEventListener('click', onConfirm);
      confirmDialog.removeEventListener('cancel', onCancel);
      if (confirmDialog.open) confirmDialog.close();
      resolve(result);
    };

    const onCancel = e => {
      e.preventDefault();
      cleanup(false);
    };
    const onConfirm = e => {
      e.preventDefault();
      cleanup(true);
    };

    modalCancel.addEventListener('click', onCancel);
    modalConfirm.addEventListener('click', onConfirm);
    confirmDialog.addEventListener('cancel', onCancel);
    confirmDialog.showModal();
    modalConfirm.focus();
  });
}

function getHashDate() {
  const h = window.location.hash.replace(/^#/, '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(h) ? h : '';
}

async function fetchSchedules() {
  const res = await fetch('/api/schedules');
  if (!res.ok) throw new Error('โหลดรายการผังไม่สำเร็จ');
  schedules = await res.json();
  scheduleDateSet = new Set(schedules.map(s => s.date));
  renderScheduleOptions();
}

function formatYMD(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function renderCalendar() {
  calMonthLabel.textContent = `${THAI_MONTHS[calMonth]} ${calYear}`;
  calendarGrid.innerHTML = '';

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const todayYMD = formatYMD(now.getFullYear(), now.getMonth(), now.getDate());

  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('span');
    empty.className = 'cal-day is-outside';
    calendarGrid.appendChild(empty);
  }

  let importedInMonth = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const ymd = formatYMD(calYear, calMonth, d);
    const hasSched = scheduleDateSet.has(ymd);
    if (hasSched) importedInMonth++;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cal-day';
    if (ymd === todayYMD) btn.classList.add('is-today');
    if (hasSched) btn.classList.add('has-schedule');
    if (ymd === currentDate) btn.classList.add('is-selected');

    const num = document.createElement('span');
    num.textContent = d;
    btn.appendChild(num);

    if (hasSched) {
      btn.title = `ดูผังวันที่ ${ymd}`;
      btn.addEventListener('click', () => {
        closeCalendar();
        selectDate(ymd, true);
      });
    } else {
      btn.disabled = true;
      btn.title = `ยังไม่มีผังของวันที่ ${ymd}`;
    }

    calendarGrid.appendChild(btn);
  }

  calLegendText.textContent = `มีผังออกอากาศแล้ว (${importedInMonth} วันในเดือนนี้ · ทั้งหมด ${schedules.length} วัน)`;
}

function openCalendar() {
  if (currentDate && /^\d{4}-\d{2}-\d{2}$/.test(currentDate)) {
    const [y, m] = currentDate.split('-').map(Number);
    calYear = y;
    calMonth = m - 1;
  }
  renderCalendar();
  calendarPopover.hidden = false;
  datePickerBtn.setAttribute('aria-expanded', 'true');
}

function closeCalendar() {
  calendarPopover.hidden = true;
  datePickerBtn.setAttribute('aria-expanded', 'false');
}

function renderScheduleOptions() {
  if (schedules.length === 0) {
    datePickerLabel.textContent = 'ยังไม่มีผังออกอากาศ';
    toggleExtraBtn.disabled = true;
    refreshBtn.disabled = true;
    exportBtn.disabled = true;
    emptyState.hidden = false;
    workspace.hidden = true;
    logErrorBanner.hidden = true;
    logMeta.textContent = 'ยังไม่มีผังออกอากาศ';
    renderCalendar();
    return;
  }

  toggleExtraBtn.disabled = false;
  refreshBtn.disabled = false;
  exportBtn.disabled = false;
  emptyState.hidden = true;
  workspace.hidden = false;
  renderCalendar();
}

async function selectDate(date, updateHash = true) {
  if (!date) return;
  currentDate = date;
  datePickerLabel.textContent = date;
  const [y, m] = date.split('-').map(Number);
  if (y && m) {
    calYear = y;
    calMonth = m - 1;
  }
  renderCalendar();
  if (updateHash && window.location.hash !== `#${date}`) {
    window.location.hash = `#${date}`;
  }
  await loadComparison(date);
}

async function loadComparison(date) {
  if (!date) return;
  refreshBtn.disabled = true;
  try {
    const res = await fetch(`/api/compare/${encodeURIComponent(date)}`);
    const data = await res.json();
    if (!res.ok) {
      showNotice(data.error || 'ไม่สามารถโหลดข้อมูลเปรียบเทียบได้');
      return;
    }
    currentData = data;
    renderComparison();
  } catch (err) {
    showNotice(`เกิดข้อผิดพลาดในการโหลดข้อมูล: ${err.message}`);
  } finally {
    refreshBtn.disabled = schedules.length === 0;
  }
}

function renderTitleCell(td, title) {
  const str = String(title ?? '');
  const hashIdx = str.indexOf('#');
  if (hashIdx > 0) {
    const codeSpan = document.createElement('span');
    codeSpan.className = 'spot-code';
    codeSpan.textContent = str.slice(0, hashIdx);

    const sepSpan = document.createElement('span');
    sepSpan.className = 'spot-sep';
    sepSpan.textContent = '#';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = str.slice(hashIdx + 1);

    td.append(codeSpan, sepSpan, nameSpan);
  } else {
    td.textContent = str;
  }
}

function createStatusPill(status) {
  const pill = document.createElement('span');
  const dot = document.createElement('span');
  dot.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');

  if (status === 'played') {
    pill.className = 'status-pill status-played';
    dot.className = 'tally-dot tally-played';
    label.textContent = 'เล่นแล้ว';
  } else if (status === 'swapped') {
    pill.className = 'status-pill status-swapped';
    dot.className = 'tally-dot tally-swapped';
    label.textContent = 'สลับลำดับ';
  } else if (status === 'missing') {
    pill.className = 'status-pill status-missing';
    dot.className = 'tally-dot tally-missing';
    label.textContent = 'ไม่พบการเล่น';
  } else if (status === 'extra') {
    pill.className = 'status-pill status-extra';
    dot.className = 'tally-dot tally-extra';
    label.textContent = 'นอกผัง';
  } else {
    pill.className = 'status-pill status-pending';
    dot.className = 'tally-dot tally-pending';
    label.textContent = 'รอออกอากาศ';
  }

  pill.append(dot, label);
  return pill;
}

function renderComparison() {
  if (!currentData) return;

  const { summary, logCount, lastLogTime, logError, rows } = currentData;

  countPlayed.textContent = summary.played;
  countSwapped.textContent = summary.swapped ?? 0;
  countMissing.textContent = summary.missing;
  countPending.textContent = summary.pending;
  countTotal.textContent = summary.total;

  updateExtraToggleBtn(summary.unmatchedLogs ?? 0);

  const latestText = lastLogTime || '—';
  logMeta.textContent = `log ล่าสุด ${latestText} · ${logCount} รายการ`;

  if (logError) {
    logErrorText.textContent = logError;
    logErrorBanner.hidden = false;
  } else {
    logErrorBanner.hidden = true;
    logErrorText.textContent = '';
  }

  renderTableRows(rows);
}

function updateExtraToggleBtn(unmatchedCount) {
  const n = unmatchedCount ?? currentData?.summary?.unmatchedLogs ?? 0;
  const labelPrefix = showAllExtraLogs ? 'ซ่อนรายการนอกผัง' : 'แสดงรายการนอกผัง';
  toggleExtraBtn.innerHTML = `${labelPrefix} (<span id="countExtra">${n}</span>)`;
  toggleExtraBtn.classList.toggle('is-active', showAllExtraLogs);
  toggleExtraBtn.setAttribute('aria-pressed', String(showAllExtraLogs));
}

function appendExtraLogsGroup(extraLogs) {
  if (!extraLogs || extraLogs.length === 0 || activeFilter !== 'all') return;

  const firstTime = extraLogs.find(l => l.startTime)?.startTime;
  const lastTime = [...extraLogs].reverse().find(l => l.startTime)?.startTime;
  const timeRange =
    firstTime && lastTime && firstTime !== lastTime
      ? ` (${firstTime} – ${lastTime})`
      : firstTime
        ? ` (${firstTime})`
        : '';

  const toggleTr = document.createElement('tr');
  toggleTr.className = 'row-extra-toggle';
  const toggleTd = document.createElement('td');
  toggleTd.colSpan = 8;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'extra-toggle-btn';

  const detailRows = [];
  let expanded = showAllExtraLogs;

  const updateLabel = () => {
    const arrow = expanded ? '▾' : '▸';
    const action = expanded ? 'ซ่อน' : 'แสดง';
    btn.textContent = `${arrow} ${action}รายการจาก Log ที่ไม่ตรงกับผัง ${extraLogs.length} รายการ${timeRange}`;
    btn.setAttribute('aria-expanded', String(expanded));
    for (const r of detailRows) {
      r.hidden = !expanded;
    }
  };

  btn.addEventListener('click', () => {
    expanded = !expanded;
    updateLabel();
  });

  toggleTd.appendChild(btn);
  toggleTr.appendChild(toggleTd);
  scheduleBody.appendChild(toggleTr);

  for (const log of extraLogs) {
    const tr = document.createElement('tr');
    tr.className = 'row-item row-extra-log';
    tr.hidden = !expanded;

    const tdBrk = document.createElement('td');
    tdBrk.className = 'col-brk';
    tdBrk.textContent = 'นอกผัง';

    const tdTitle = document.createElement('td');
    tdTitle.className = 'col-title timecode-empty';
    tdTitle.textContent = '—';

    const tdLen = document.createElement('td');
    tdLen.className = 'col-len';
    tdLen.textContent = log.duration || '';

    const tdAoe = document.createElement('td');
    tdAoe.className = 'col-aoe';
    tdAoe.textContent = '';

    const tdQt = document.createElement('td');
    tdQt.className = 'col-qt';
    tdQt.textContent = '';

    const tdTime = document.createElement('td');
    tdTime.className = 'col-time';
    if (log.startTime) {
      tdTime.classList.add('timecode-played');
      tdTime.textContent = log.startTime;
    } else {
      tdTime.classList.add('timecode-empty');
      tdTime.textContent = '—';
    }

    const tdStatus = document.createElement('td');
    tdStatus.className = 'col-status';
    tdStatus.appendChild(createStatusPill('extra'));

    const tdLogTitle = document.createElement('td');
    tdLogTitle.className = 'col-log-title';
    renderTitleCell(tdLogTitle, log.title);

    tr.append(tdBrk, tdTitle, tdLen, tdAoe, tdQt, tdTime, tdStatus, tdLogTitle);
    detailRows.push(tr);
    scheduleBody.appendChild(tr);
  }

  updateLabel();
}

function renderTableRows(rows) {
  scheduleBody.innerHTML = '';
  programList.innerHTML = '';

  // จัดกลุ่มตามแถว program เพื่อแสดงหัวกลุ่มเฉพาะที่มีรายการตรงกับตัวกรอง
  const groups = [];
  let currentGroup = { programRow: null, items: [] };
  groups.push(currentGroup);

  for (const r of rows) {
    if (r.kind === 'program') {
      currentGroup = { programRow: r, items: [] };
      groups.push(currentGroup);
    } else if (r.kind === 'item') {
      if (activeFilter === 'all' || r.status === activeFilter) {
        currentGroup.items.push(r);
      }
    }
  }

  let renderedItems = 0;
  let lastBrkKey = '';
  let progIdx = 0;

  for (const g of groups) {
    const shouldShowProgram =
      g.programRow && (activeFilter === 'all' || g.items.length > 0);

    if (shouldShowProgram) {
      progIdx++;
      const progId = `prog-${progIdx}`;
      const tr = document.createElement('tr');
      tr.className = 'row-program';
      tr.id = progId;
      const td = document.createElement('td');
      td.colSpan = 8;

      const badge = document.createElement('span');
      badge.className = 'program-badge';
      badge.textContent = 'PROGRAM';

      const name = document.createElement('span');
      name.textContent = g.programRow.title;

      td.append(badge, name);
      tr.appendChild(td);
      scheduleBody.appendChild(tr);
      lastBrkKey = '';

      // สร้างปุ่มในแถบรายการด้านซ้าย
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `program-btn${progIdx === 1 ? ' is-active' : ''}`;
      btn.dataset.target = progId;
      btn.title = g.programRow.title;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'program-btn-name';
      nameSpan.textContent = g.programRow.title;

      const metaSpan = document.createElement('span');
      metaSpan.className = 'program-btn-meta';
      if (g.items.length > 0) {
        const dot = document.createElement('span');
        dot.setAttribute('aria-hidden', 'true');
        if (g.items.some(i => i.status === 'missing')) {
          dot.className = 'tally-dot tally-missing';
        } else if (g.items.some(i => i.status === 'swapped')) {
          dot.className = 'tally-dot tally-swapped';
        } else if (g.items.some(i => i.status === 'played')) {
          dot.className = 'tally-dot tally-played';
        } else {
          dot.className = 'tally-dot tally-pending';
        }
        const countNode = document.createElement('span');
        countNode.textContent = g.items.length;
        metaSpan.append(dot, countNode);
      }

      btn.append(nameSpan, metaSpan);
      btn.addEventListener('click', () => {
        for (const b of programList.querySelectorAll('.program-btn')) {
          b.classList.toggle('is-active', b === btn);
        }
        tr.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });

      li.appendChild(btn);
      programList.appendChild(li);
    }

    for (const item of g.items) {
      appendExtraLogsGroup(item.extraLogsBefore);

      renderedItems++;
      const tr = document.createElement('tr');
      tr.className = `row-item row-${item.status}`;

      const brkKey = `${item.program}__${item.brk}`;
      const tdBrk = document.createElement('td');
      tdBrk.className = 'col-brk';
      tdBrk.textContent = brkKey !== lastBrkKey ? (item.brk || '') : '';
      lastBrkKey = brkKey;

      const tdTitle = document.createElement('td');
      tdTitle.className = 'col-title';
      renderTitleCell(tdTitle, item.title);

      const tdLen = document.createElement('td');
      tdLen.className = 'col-len';
      tdLen.textContent = item.length || '';

      const tdAoe = document.createElement('td');
      tdAoe.className = 'col-aoe';
      tdAoe.textContent = item.aoe || '';

      const tdQt = document.createElement('td');
      tdQt.className = 'col-qt';
      tdQt.textContent = item.quotation || '';

      const tdTime = document.createElement('td');
      tdTime.className = 'col-time';
      if ((item.status === 'played' || item.status === 'swapped') && item.playedAt) {
        tdTime.classList.add('timecode-played');
        tdTime.textContent = item.playedAt;
      } else {
        tdTime.classList.add('timecode-empty');
        tdTime.textContent = '—';
      }

      const tdStatus = document.createElement('td');
      tdStatus.className = 'col-status';
      tdStatus.appendChild(createStatusPill(item.status));

      const tdLogTitle = document.createElement('td');
      tdLogTitle.className = 'col-log-title';
      if (item.logTitle) {
        renderTitleCell(tdLogTitle, item.logTitle);
      }

      tr.append(tdBrk, tdTitle, tdLen, tdAoe, tdQt, tdTime, tdStatus, tdLogTitle);
      scheduleBody.appendChild(tr);

      appendExtraLogsGroup(item.extraLogsAfter);
    }
  }

  if (renderedItems === 0 && activeFilter !== 'all') {
    const tr = document.createElement('tr');
    tr.className = 'empty-filter-row';
    const td = document.createElement('td');
    td.colSpan = 8;
    td.textContent = 'ไม่มีรายการในสถานะที่เลือก';
    tr.appendChild(td);
    scheduleBody.appendChild(tr);
  }
}

function setFilter(filter) {
  if (activeFilter === filter && filter !== 'all') {
    activeFilter = 'all';
  } else {
    activeFilter = filter;
  }

  for (const btn of filterBtns) {
    const isActive = btn.dataset.filter === activeFilter;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  }

  if (currentData) {
    renderTableRows(currentData.rows);
  }
}

for (const btn of filterBtns) {
  btn.addEventListener('click', () => setFilter(btn.dataset.filter));
}

tableWrap.addEventListener('scroll', () => {
  const progRows = scheduleBody.querySelectorAll('.row-program');
  if (progRows.length === 0) return;
  const wrapRect = tableWrap.getBoundingClientRect();
  let activeId = progRows[0].id;
  for (const row of progRows) {
    if (row.getBoundingClientRect().top - wrapRect.top <= 60) {
      activeId = row.id;
    } else {
      break;
    }
  }
  for (const btn of programList.querySelectorAll('.program-btn')) {
    btn.classList.toggle('is-active', btn.dataset.target === activeId);
  }
});

datePickerBtn.addEventListener('click', () => {
  if (calendarPopover.hidden) {
    openCalendar();
  } else {
    closeCalendar();
  }
});

calPrevMonth.addEventListener('click', () => {
  calMonth--;
  if (calMonth < 0) {
    calMonth = 11;
    calYear--;
  }
  renderCalendar();
});

calNextMonth.addEventListener('click', () => {
  calMonth++;
  if (calMonth > 11) {
    calMonth = 0;
    calYear++;
  }
  renderCalendar();
});

document.addEventListener('click', e => {
  if (!calendarPopover.hidden && !datePickerWrap.contains(e.target)) {
    closeCalendar();
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !calendarPopover.hidden) {
    closeCalendar();
    datePickerBtn.focus();
  }
});

window.addEventListener('hashchange', () => {
  const hashDate = getHashDate();
  if (hashDate && hashDate !== currentDate && schedules.some(s => s.date === hashDate)) {
    selectDate(hashDate, false);
  }
});

toggleExtraBtn.addEventListener('click', () => {
  showAllExtraLogs = !showAllExtraLogs;
  updateExtraToggleBtn();
  if (currentData) {
    renderTableRows(currentData.rows);
  }
});

refreshBtn.addEventListener('click', () => {
  if (currentDate) loadComparison(currentDate);
});

exportBtn.addEventListener('click', () => {
  if (!currentDate) return;
  window.location.href = `/api/compare/${encodeURIComponent(currentDate)}/export`;
});

function openFilePicker() {
  hideNotice();
  fileInput.value = '';
  fileInput.click();
}

importBtn.addEventListener('click', openFilePicker);
emptyImportBtn.addEventListener('click', openFilePicker);

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  hideNotice();
  const filename = file.name.trim();

  if (/\.xls$/i.test(filename)) {
    showNotice('ไม่รองรับไฟล์ .xls แบบเก่า กรุณาเปิดไฟล์ใน Excel แล้ว Save As เป็น .xlsx (ชื่อไฟล์ YYYY-MM-DD.xlsx)');
    return;
  }

  const m = filename.match(/^(\d{4}-\d{2}-\d{2})\.xlsx$/i);
  if (!m) {
    showNotice('ชื่อไฟล์ต้องเป็นรูปแบบ YYYY-MM-DD.xlsx เช่น 2026-11-16.xlsx');
    return;
  }

  const parsedDate = m[1];
  const ok = await askConfirm({
    title: 'ยืนยันการ Import ผังออกอากาศ',
    message: `อ่านวันที่ได้จากชื่อไฟล์: ${parsedDate} (${filename}) ต้องการนำเข้าผังออกอากาศนี้หรือไม่?`,
    confirmLabel: 'Import ผัง'
  });
  if (!ok) return;

  await uploadScheduleFile(file, parsedDate, false);
});

async function uploadScheduleFile(file, parsedDate, overwrite) {
  const qs = new URLSearchParams({ filename: file.name.trim() });
  if (overwrite) qs.set('overwrite', '1');

  try {
    const buf = await file.arrayBuffer();
    const res = await fetch(`/api/schedules?${qs.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: buf
    });
    const data = await res.json();

    if (res.status === 409) {
      const replaceOk = await askConfirm({
        title: 'พบผังออกอากาศซ้ำ',
        message: `มีผังวันที่ ${parsedDate} อยู่แล้ว ต้องการแทนที่หรือไม่`,
        confirmLabel: 'แทนที่ผังเดิม'
      });
      if (replaceOk) {
        await uploadScheduleFile(file, parsedDate, true);
      }
      return;
    }

    if (!res.ok) {
      showNotice(data.error || 'ไม่สามารถนำเข้าไฟล์ผังออกอากาศได้');
      return;
    }

    await fetchSchedules();
    await selectDate(data.date, true);
  } catch (err) {
    showNotice(`อัปโหลดไฟล์ไม่สำเร็จ: ${err.message}`);
  }
}

async function init() {
  try {
    await fetchSchedules();
    if (schedules.length > 0) {
      const hashDate = getHashDate();
      const target = schedules.some(s => s.date === hashDate)
        ? hashDate
        : schedules[0].date;
      await selectDate(target, true);
    }
  } catch (err) {
    showNotice(`เริ่มต้นระบบไม่สำเร็จ: ${err.message}`);
  }
}

init();
