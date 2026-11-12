export const attendanceColumns = [
  ['日付', 8], ['曜日', 6], ['シフト予定', 21],
  ['出勤時刻', 11], ['退勤時刻', 11], ['実働時間', 11], ['休憩時間', 10],
  ['遅刻', 8], ['早退', 8], ['所定外', 10], ['法定時間外', 13]
];
export const attendanceColors = {
  ink: '382719', accent: 'FF9E53', header: 'F9CDA1', summary: 'FFF6EE',
  line: 'D5BDA8', saturday: 'E8F5FB', sunday: 'FFEDEA', white: 'FFFFFF', alternate: 'FFFBF7'
};
const durationFields = ['work', 'breakMin', 'late', 'early', 'scheduledOver', 'statutoryOver'];

export function indexFullDayPaidLeave(requests, transactions, month) {
  const byStaff = new Map();
  function add(entry) {
    if (!entry.staffId || typeof entry.date !== 'string' || !entry.date.startsWith(month + '-')) return;
    if (!byStaff.has(entry.staffId)) byStaff.set(entry.staffId, new Set());
    byStaff.get(entry.staffId).add(entry.date);
  }
  for (const request of Object.values(requests)) {
    if (request?.type === 'paid' && request.status === 'approved' && !request.cancelled) add(request);
  }
  for (const entry of Object.values(transactions)) {
    // The Jobcan history importer accepts only recorded whole-day uses.
    if (entry?.source === 'jobcan-leave-history' && Number(entry.days) === -1) add(entry);
  }
  return byStaff;
}

export function buildAttendanceReport(name, month, { rows, totals }, approvedDates, formatClock) {
  const [year, monthNumber] = month.split('-').map(Number);
  let creditedDays = 0;
  const days = rows.map(day => {
    const date = new Date(`${day.ds}T00:00:00Z`);
    const weekday = date.getUTCDay();
    const { start, end } = day.shift;
    const credit = day.work === 0 && approvedDates?.has(day.ds);
    if (credit) creditedDays++;
    const work = credit ? 8 * 60 : day.work;
    return {
      date, dateLabel: `${monthNumber}/${date.getUTCDate()}`, weekdayLabel: '日月火水木金土'[weekday],
      plannedHours: start && end ? `${start}〜${end}` : '',
      inTime: day.firstIn ? formatClock(day.firstIn) : '',
      outTime: day.lastOut ? formatClock(day.lastOut) : '',
      durations: [work, ...durationFields.slice(1).map(field => day[field])],
      background: weekday === 6 ? 'saturday' : weekday === 0 ? 'sunday' : date.getUTCDate() % 2 === 0 ? 'alternate' : 'white'
    };
  });
  return {
    name, monthLabel: `${year}年${monthNumber}月`, days, creditedDays,
    workedDays: rows.filter(day => day.work > 0).length,
    totals: { ...totals, work: totals.work + creditedDays * 8 * 60 }
  };
}

export function monthlyReportMetrics({ workedDays, totals }) {
  return [
    ['勤務日数', workedDays, 'days'], ['実働時間', totals.work, 'duration'],
    ['休憩時間', totals.breakMin, 'duration'], ['要確認日数', totals.missing, 'days'],
    ['所定外', totals.scheduledOver, 'duration'], ['法定時間外', totals.statutoryOver, 'duration'],
    ['遅刻時間', totals.late, 'duration'], ['早退時間', totals.early, 'duration']
  ];
}

export function monthlyReportDurations({ totals }) {
  return durationFields.map(field => totals[field]);
}

export function paidLeaveReportNote({ creditedDays }) {
  return creditedDays ? `実働時間に全日有給 ${creditedDays}日（1日8時間）を含みます。` : '';
}

function durationText(minutes) {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

function escapeReportText(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, character => entities[character]);
}

export function renderAttendancePrint(report) {
  const width = attendanceColumns.reduce((sum, [, size]) => sum + size, 0);
  const colgroup = attendanceColumns.map(([, size]) => `<col style="width:${size / width * 100}%">`).join('');
  const metrics = monthlyReportMetrics(report).map(([label, value, type]) =>
    `<div><dt>${label}</dt><dd>${type === 'days' ? `${value} 日` : durationText(value)}</dd></div>`).join('');
  const header = attendanceColumns.map(([label]) => `<th scope="col">${label}</th>`).join('');
  const days = report.days.map(day => {
    const cells = [day.dateLabel, day.weekdayLabel, day.plannedHours, day.inTime, day.outTime,
      ...day.durations.map(value => value ? durationText(value) : '')];
    return `<tr class="report-${day.background}">${cells.map(value => `<td>${escapeReportText(value)}</td>`).join('')}</tr>`;
  }).join('');
  const totals = monthlyReportDurations(report);
  const totalCells = totals.map(value => `<td>${durationText(value)}</td>`).join('');
  const note = paidLeaveReportNote(report);
  const colors = Object.entries(attendanceColors).map(([key, hex]) => `--report-${key}:#${hex}`).join(';');
  return `<div class="report-page" style="${colors}"><h1>月次勤怠表</h1>
    <div class="report-identity"><span>対象月　${report.monthLabel}</span><span>氏名　${escapeReportText(report.name)}</span></div>
    <dl class="report-summary">${metrics}</dl>
    ${note ? `<p class="report-note">${note}</p>` : ''}
    <table aria-label="日別勤怠"><colgroup>${colgroup}</colgroup><thead><tr>${header}</tr></thead>
      <tbody>${days}</tbody><tfoot><tr><th scope="row" colspan="${attendanceColumns.length - totals.length}">月合計</th>${totalCells}</tr></tfoot>
    </table></div>`;
}
