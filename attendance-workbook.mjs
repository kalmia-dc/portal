const columns = [
  ['日付', 8], ['曜日', 6], ['シフト予定', 21],
  ['出勤時刻', 11], ['退勤時刻', 11], ['実働時間', 11], ['休憩時間', 10],
  ['遅刻', 8], ['早退', 8], ['所定外', 10], ['法定時間外', 13]
];
const headerRow = 9;
const firstDurationColumn = 6;
const weekdays = '日月火水木金土';
const timeFormat = 'hh:mm';
const durationFormat = '[h]:mm';
const dailyDurationFormat = '[h]:mm;[h]:mm;""';
const palette = {
  ink: 'FF382719', accent: 'FFFF9E53', header: 'FFF9CDA1', summary: 'FFFFF6EE',
  line: 'FFD5BDA8', saturday: 'FFE8F5FB', sunday: 'FFFFEDEA',
  white: 'FFFFFFFF', alternate: 'FFFFFBF7'
};

function fill(color) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
}

function styleCell(cell, background, { bold = false, left = false, size = 10 } = {}) {
  cell.fill = fill(background);
  cell.font = { name: 'Yu Gothic', size, bold, color: { argb: palette.ink } };
  cell.alignment = { vertical: 'middle', horizontal: left ? 'left' : 'center', wrapText: true };
}

function band(sheet, row, first, last, value, background, options) {
  sheet.mergeCells(row, first, row, last);
  const cell = sheet.getCell(row, first);
  cell.value = value;
  styleCell(cell, background, options);
  return cell;
}

function styleTableRow(row, background, bold = false) {
  const edge = { style: 'thin', color: { argb: palette.line } };
  row.eachCell({ includeEmpty: true }, cell => {
    styleCell(cell, background, { bold });
    cell.border = { top: edge, bottom: edge, left: edge, right: edge };
  });
}

function asDuration(minutes) {
  return Number.isFinite(minutes) ? minutes / 1440 : null;
}

function asClock(text) {
  if (!/^\d{2}:\d{2}$/.test(text)) return null;
  const [hours, minutes] = text.split(':').map(Number);
  return (hours * 60 + minutes) / 1440;
}

function uniqueSheetName(name, usedNames) {
  const cleaned = String(name ?? '').replace(/[\\/?*:[\]\u0000-\u001f]/g, ' ').trim();
  const base = cleaned.replace(/^'+|'+$/g, '').trim() || '勤怠';
  let number = 1;
  while (true) {
    const suffix = number === 1 ? '' : ` (${number})`;
    const candidate = base.slice(0, 31 - suffix.length).replace(/'+$/, '') + suffix;
    const key = candidate.toLowerCase();
    if (key !== 'history' && !usedNames.has(key)) {
      usedNames.add(key);
      return candidate;
    }
    number++;
  }
}

function addSummary(sheet, report, month) {
  const { name, rows, totals } = report;
  const [year, monthNumber] = month.split('-').map(Number);
  band(sheet, 1, 1, columns.length, '月次勤怠表', palette.accent, { bold: true, size: 17 });
  band(sheet, 2, 1, 4, `対象月　${year}年${monthNumber}月`, palette.header, { bold: true });
  band(sheet, 2, 5, columns.length, `氏名　${name}`, palette.header, { bold: true, left: true });
  sheet.getRow(1).height = 29;
  sheet.getRow(2).height = 22;
  sheet.getRow(3).height = 6;
  const metrics = [
    ['勤務日数', rows.filter(row => row.work > 0).length, '0" 日"'],
    ['実働時間', asDuration(totals.work), durationFormat],
    ['休憩時間', asDuration(totals.breakMin), durationFormat],
    ['要確認日数', totals.missing, '0" 日"'],
    ['所定外', asDuration(totals.scheduledOver), durationFormat],
    ['法定時間外', asDuration(totals.statutoryOver), durationFormat],
    ['遅刻時間', asDuration(totals.late), durationFormat],
    ['早退時間', asDuration(totals.early), durationFormat]
  ];
  const summaryBands = [[1, 3], [4, 5], [6, 8], [9, columns.length]];
  metrics.forEach(([label, value, format], index) => {
    const row = index < 4 ? 4 : 6;
    const [first, last] = summaryBands[index % summaryBands.length];
    band(sheet, row, first, last, label, palette.header, { bold: true });
    band(sheet, row + 1, first, last, value, palette.summary, { bold: true, size: 12 }).numFmt = format;
  });
  for (const row of [4, 6]) sheet.getRow(row).height = 15;
  for (const row of [5, 7]) sheet.getRow(row).height = 21;
  sheet.getRow(8).height = 7;
}

function addDailyRows(sheet, { rows, totals }) {
  const header = sheet.getRow(headerRow);
  header.values = columns.map(([label]) => label);
  header.height = 21;
  styleTableRow(header, palette.accent, true);

  rows.forEach((day, index) => {
    const date = new Date(`${day.ds}T00:00:00Z`);
    const weekday = date.getUTCDay();
    const { start, end } = day.shift;
    const plannedHours = start && end ? `${start}〜${end}` : null;
    const row = sheet.addRow([
      date, weekdays[weekday], plannedHours, asClock(day.inTime), asClock(day.outTime),
      asDuration(day.work), asDuration(day.breakMin), asDuration(day.late), asDuration(day.early),
      asDuration(day.scheduledOver), asDuration(day.statutoryOver)
    ]);
    const background = weekday === 6 ? palette.saturday : weekday === 0 ? palette.sunday : index % 2 ? palette.alternate : palette.white;
    styleTableRow(row, background);
    row.height = 16;
    row.getCell(1).numFmt = 'm"/"d';
    row.getCell(4).numFmt = timeFormat;
    row.getCell(5).numFmt = timeFormat;
    for (let column = firstDurationColumn; column <= columns.length; column++) row.getCell(column).numFmt = dailyDurationFormat;
  });

  const total = sheet.addRow([
    '月合計', '', '', '', '', asDuration(totals.work), asDuration(totals.breakMin),
    asDuration(totals.late), asDuration(totals.early), asDuration(totals.scheduledOver), asDuration(totals.statutoryOver)
  ]);
  styleTableRow(total, palette.header, true);
  sheet.mergeCells(total.number, 1, total.number, firstDurationColumn - 1);
  total.height = 22;
  for (let column = firstDurationColumn; column <= columns.length; column++) total.getCell(column).numFmt = durationFormat;
  return total.number;
}

export function createAttendanceWorkbook(Workbook, reports, month) {
  const workbook = new Workbook();
  const usedNames = new Set();
  for (const report of reports) {
    const sheet = workbook.addWorksheet(uniqueSheetName(report.name, usedNames), {
      views: [{ state: 'frozen', ySplit: headerRow, showGridLines: false }],
      pageSetup: {
        paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1,
        horizontalCentered: true,
        margins: { left: 0.25, right: 0.25, top: 0.25, bottom: 0.25, header: 0.1, footer: 0.1 }
      }
    });
    sheet.columns = columns.map(([, width]) => ({ width }));
    addSummary(sheet, report, month);
    const lastRow = addDailyRows(sheet, report);
    sheet.pageSetup.printArea = `A1:${sheet.getCell(lastRow, columns.length).address}`;
  }
  return workbook;
}
