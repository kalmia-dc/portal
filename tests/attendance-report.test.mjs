import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAttendanceReport, indexFullDayPaidLeave, renderAttendancePrint } from '../attendance-report.mjs';

test('monthly reports credit whole-day paid leave once and preserve actual work and overtime', () => {
  const month = '2026-11';
  const person = 'fictional';
  const paidRequest = (day, status, cancelled = false) =>
    ({ staffId: person, date: `${month}-${day}`, type: 'paid', status, cancelled });
  const history = (day, days) =>
    ({ staffId: person, date: `${month}-${day}`, source: 'jobcan-leave-history', days });
  const dates = indexFullDayPaidLeave({
    approved: paidRequest('09', 'approved'),
    overlapping: paidRequest('10', 'approved'),
    pending: paidRequest('11', 'pending'),
    cancelled: paidRequest('12', 'approved', true)
  }, {
    duplicate: history('09', -1),
    historical: history('13', -1),
    partial: history('14', -0.5)
  }, month);
  const rows = ['09', '10', '11', '12', '13', '14'].map(day => ({
    ds: `${month}-${day}`, shift: {}, work: day === '10' ? 240 : 0,
    breakMin: 0, late: 0, early: 0, scheduledOver: 0, statutoryOver: 0
  }));
  const totals = { work: 240, breakMin: 0, late: 0, early: 0, scheduledOver: 25, statutoryOver: 15, missing: 0 };
  const report = buildAttendanceReport('架空スタッフ', month, { rows, totals }, dates.get(person), String);
  assert.deepEqual(report.days.map(day => day.durations[0]), [480, 240, 0, 0, 480, 0]);
  assert.equal(report.workedDays, 1);
  assert.equal(report.creditedDays, 2);
  assert.equal(report.totals.work, 1200);
  assert.equal(report.totals.scheduledOver, 25);
  assert.equal(report.totals.statutoryOver, 15);
  assert.equal(totals.work, 240);
  const print = renderAttendancePrint(report);
  assert.match(print, /月合計<\/th><td>20:00<\/td>/);
  assert.match(print, /全日有給 2日/);
});
