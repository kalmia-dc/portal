import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = fs.readFileSync('schedule.html', 'utf8').replace(/\r\n/g, '\n');
function section(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a);
  return source.slice(a, b);
}
function harness(now = '2026-10-08T03:00:00Z') {
  const requests = [], saved = new Map(), writes = [];
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return new Date(now).valueOf(); }
  }
  const c = {
    Date: Clock, Intl, Set, JSON, console: { warn() {} }, NOTIFY_URL: 'https://example.invalid',
    state: { events: {}, currentEventId: 'e', user: { id: 'fixture' }, newName: 'Fixture',
      newDeadline: '2026-10-10', newDates: new Set(['2026-10-11']), newMembers: new Set() },
    window: {}, db: {}, DB_PATH: 'fixture', ref: () => ({}),
    update: async (_, value) => writes.push(value), render() {}, toast() {},
    canManageCurrentEvent: () => true, fmtDate: d => d,
    localStorage: { getItem: k => saved.get(k) || null, setItem: (k, v) => saved.set(k, v) },
    mode: 'ok', gate: null,
    fetch: async (_, options) => {
      requests.push(JSON.parse(options.body));
      if (c.gate) await c.gate;
      if (c.mode === 'network') throw Error('mock failure');
      return { ok: c.mode !== 'http500', json: async () => {
        if (c.mode === 'invalid-json') throw Error('mock JSON failure');
        return { ok: c.mode === 'ok' };
      } };
    },
    isGuestUser: () => false, saveFormState() {},
    saveEvent: async (id, value) => writes.push({ id, value }),
    create: { addEventListener: (_, callback) => { c.createHandler = callback; } }
  };
  vm.createContext(c);
  vm.runInContext(section('async function sendNotify(', 'async function saveEvent(') +
    section('window.toggleDecide =', 'window.doUndecide =') +
    section("  if (create) create.addEventListener('click', async () => {", '\n}\n\nwindow.openEvent'), c);
  return { c, requests, saved, writes };
}

test('inline module parses', () => {
  for (const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!match[2].trim()) continue;
    if (/type=["']module["']/.test(match[1])) new vm.SourceTextModule(match[2]);
    else new vm.Script(match[2]);
  }
});

for (const mode of ['http500', 'network', 'invalid-json', 'application-error']) {
  test(`${mode} is not marked; later successful check is marked once`, async () => {
    const h = harness();
    h.c.state.events.e = { name: 'Fixture', deadline: '2026-10-08' };
    h.c.mode = mode;
    await h.c.checkScheduleDeadlines();
    assert.equal(h.saved.get('schedule_notified_2026-10-08'), '[]');
    h.c.mode = 'ok';
    await h.c.checkScheduleDeadlines();
    await h.c.checkScheduleDeadlines();
    assert.equal(h.requests.length, 2);
    assert.equal(h.saved.get('schedule_notified_2026-10-08'), '["e"]');
  });
}

test('JST midnight, morning, year and leap-day boundaries', async () => {
  for (const [instant, today, tomorrow] of [
    ['2026-10-07T14:59:59Z', '2026-10-07', '2026-10-08'],
    ['2026-10-07T15:00:00Z', '2026-10-08', '2026-10-09'],
    ['2026-10-07T23:30:00Z', '2026-10-08', '2026-10-09'],
    ['2026-12-31T03:00:00Z', '2026-12-31', '2027-01-01'],
    ['2028-02-28T23:30:00Z', '2028-02-29', '2028-03-01']
  ]) {
    const h = harness(instant);
    h.c.state.events = { a: { name: 'Today', deadline: today }, b: { name: 'Tomorrow', deadline: tomorrow } };
    await h.c.checkScheduleDeadlines();
    assert.equal(h.requests.length, 2);
    assert.match(h.requests[0].text, /本日期限/);
    assert.match(h.requests[1].text, /明日期限/);
    assert.equal(h.saved.get(`schedule_notified_${today}`), '["a","b"]');
  }
});

test('concurrent and repeated checks do not duplicate a successful send in this page', async () => {
  const h = harness();
  h.c.state.events.e = { name: 'Fixture', deadline: '2026-10-08' };
  let release;
  h.c.gate = new Promise(resolve => { release = resolve; });
  const pending = h.c.checkScheduleDeadlines();
  await h.c.checkScheduleDeadlines();
  assert.equal(h.requests.length, 1);
  release(); await pending;
  await h.c.checkScheduleDeadlines();
  assert.equal(h.requests.length, 1);
});

test('old deadlines, future deadlines, decided and already notified events do not send', async () => {
  const h = harness();
  h.c.state.events = {
    old: { deadline: '2026-10-07' }, future: { deadline: '2026-10-10' },
    decided: { deadline: '2026-10-08', decided: ['2026-10-11'] },
    sent: { deadline: '2026-10-08' }, missing: {}
  };
  h.saved.set('schedule_notified_2026-10-08', '["sent"]');
  await h.c.checkScheduleDeadlines();
  assert.equal(h.requests.length, 0);
});

test('decision additions notify, cancellation saves without notification', async () => {
  const h = harness(); h.c.state.events.e = { name: 'Fixture' };
  await h.c.window.toggleDecide('2026-10-11');
  assert.equal(h.requests.length, 1);
  await h.c.window.toggleDecide('2026-10-11');
  assert.equal(h.requests.length, 1);
  assert.equal(h.writes.length, 2);
  assert.equal(h.writes[1].decided, null);
});

test('creation still saves and notifies; invalid input and guest do neither', async () => {
  for (const mode of ['valid', 'invalid', 'guest']) {
    const h = harness();
    if (mode === 'invalid') h.c.state.newName = '';
    if (mode === 'guest') h.c.isGuestUser = () => true;
    await h.c.createHandler();
    assert.equal(h.requests.length, Number(mode === 'valid'));
    assert.equal(h.writes.length, Number(mode === 'valid'));
  }
});
