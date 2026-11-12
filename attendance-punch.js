import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getDatabase, ref, get, onValue, set, update, runTransaction } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { startPortalAuth } from './portal-auth.js?v=labor-20261014-2';
import { createPageLifecycle } from './portal-page-lifecycle.mjs';
import { defaultStaff } from './portal-default-staff.mjs';
import { personName } from './portal-person-display.mjs?v=20261019-director';

const app = initializeApp({
  apiKey: 'AIzaSyDdMe7feUF6CKPHH0YIx7Suk-WnXtOYUu8',
  authDomain: 'kalmia-shift.firebaseapp.com',
  databaseURL: 'https://kalmia-shift-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'kalmia-shift',
  appId: '1:714175473480:web:7d6626a46e4a9dcb1fb57d'
});
const lifecycle = createPageLifecycle();
const profile = await startPortalAuth(app, { pageName: '受付打刻' });
if (lifecycle.active) {
  if (profile.portalRole === 'terminal' && localStorage.getItem('portalTerminalMode') !== 'attendance') {
    location.replace('./index.html');
  } else if (profile.portalRole === 'admin' || profile.portalRole === 'terminal') {
    startPunchScreen(getDatabase(app), profile);
  } else {
    location.replace('./attendance.html');
  }
}

function startPunchScreen(db, profile) {
  const terminalId = localStorage.getItem('attendanceTerminalId') || 'reception-1';
  const terminalPath = `attendance/terminals/${terminalId}`;
  const labels = { in: '出勤', breakStart: '休憩開始', breakEnd: '休憩終了', out: '退勤' };
  const buttons = [...document.querySelectorAll('[data-punch]')];
  const selection = document.getElementById('punchSelection');
  const result = document.getElementById('punchResult');
  const clock = document.getElementById('punchClock');
  const isAdmin = profile.portalRole === 'admin';
  let cards = null;
  let registration;
  let inbox = {};
  let selectedType = null;
  let changingType = false;
  let processing = false;
  let staff = {};
  let ready = false;
  let inboxAvailable = false;
  const failedEvents = new Set();

  document.getElementById('managementLink').hidden = !isAdmin;
  const timeFormat = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });
  const clockFormat = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' });
  const showClock = () => { clock.textContent = clockFormat.format(new Date()); };
  showClock();
  lifecycle.interval(showClock, 1000);
  lifecycle.add(() => {
    for (const button of buttons) button.disabled = true;
  });

  function message(text, error = false) {
    if (!lifecycle.active) return;
    result.textContent = text;
    result.dataset.error = String(error);
  }

  function updateControls() {
    const available = inboxAvailable && cards !== null && registration !== undefined && selectedType !== null;
    const registering = ['waiting', 'scanned'].includes(registration?.status);
    for (const button of buttons) {
      button.disabled = !available || registering || changingType;
      button.setAttribute('aria-pressed', String(button.dataset.punch === selectedType));
    }
    selection.textContent = registering ? 'カード登録中' : selectedType ? `「${labels[selectedType]}」を選択中` : '';
    if (available && !ready) message('カードをかざしてください');
    ready = available;
  }

  for (const button of buttons) {
    button.addEventListener('click', lifecycle.guard(async () => {
      changingType = true;
      updateControls();
      try {
        await set(ref(db, `${terminalPath}/selectedType`), button.dataset.punch);
        message('カードをかざしてください');
      } catch {
        message('打刻の種類を変更できませんでした。もう一度選んでください。', true);
      } finally {
        changingType = false;
        if (lifecycle.active) updateControls();
      }
    }));
  }

  function watch(path, callback, onError) {
    lifecycle.add(onValue(ref(db, path), lifecycle.guard(snapshot => callback(snapshot.val())), lifecycle.guard(() => {
      if (!onError) return;
      onError();
      message('受付端末に接続できません。管理者にお知らせください。', true);
    })));
  }

  watch('extra_staff', value => { staff = value || {}; });
  watch('attendance/cards', value => {
    cards = value || {};
    updateControls();
    void processInbox();
  }, () => { cards = null; updateControls(); });
  watch(`${terminalPath}/selectedType`, value => {
    selectedType = Object.hasOwn(labels, value) ? value : 'in';
    updateControls();
    void processInbox();
  }, () => { selectedType = null; updateControls(); });
  watch(`${terminalPath}/registration`, value => {
    const wasRegistering = ['waiting', 'scanned'].includes(registration?.status);
    registration = value;
    updateControls();
    if (value?.status === 'waiting') message('登録するカードをかざしてください');
    if (value?.status === 'scanned') message('カードを読み取りました。管理者の登録をお待ちください。');
    if (wasRegistering && !['waiting', 'scanned'].includes(value?.status)) message('カードをかざしてください');
    void processInbox();
  }, () => { registration = undefined; updateControls(); });
  watch(`${terminalPath}/inbox`, value => {
    inbox = value || {};
    inboxAvailable = true;
    updateControls();
    void processInbox();
  }, () => { inboxAvailable = false; updateControls(); });

  async function processInbox() {
    if (!ready || processing) return;
    processing = true;
    try {
      while (lifecycle.active && ready) {
        const pending = Object.entries(inbox).find(([id, event]) => event?.status === 'pending' && event.uid && !failedEvents.has(id));
        if (!pending) break;
        const [id, event] = pending;
        delete inbox[id];
        try {
          const error = await recordCard(id, event);
          lifecycle.assertActive();
          const outcome = error ? { status: 'error', error } : { status: 'processed', processedAt: new Date().toISOString() };
          await update(ref(db, `${terminalPath}/inbox/${id}`), outcome);
        } catch {
          failedEvents.add(id);
          message('打刻を確認できませんでした。管理者にお知らせください。', true);
        }
      }
    } finally {
      processing = false;
    }
  }

  async function recordCard(id, event) {
    const uid = String(event.uid).trim().toUpperCase().replace(/[^0-9A-F]/g, '');
    const occurred = event.occurredAt ? new Date(event.occurredAt) : new Date();
    const type = Object.hasOwn(labels, event.type) ? event.type : selectedType;
    if (!uid || !Number.isFinite(occurred.getTime())) {
      message('カードの読み取り情報を確認できませんでした。', true);
      return 'Invalid card event';
    }
    const registrationRef = ref(db, `${terminalPath}/registration`);
    const request = (await get(registrationRef)).val();
    lifecycle.assertActive();
    if (request?.scanEventId === id) return;
    if (['waiting', 'scanned'].includes(request?.status) && occurred >= new Date(request.requestedAt)) {
      const capture = await runTransaction(registrationRef, current => {
        if (current?.status !== 'waiting' || current.requestedAt !== request.requestedAt) return;
        return { ...current, status: 'scanned', uid, uidLast4: uid.slice(-4), scannedAt: occurred.toISOString(), scanEventId: id };
      }, { applyLocally: false });
      lifecycle.assertActive();
      const latest = capture.snapshot.val();
      if (capture.committed || latest?.scanEventId === id ||
          (latest?.status === 'scanned' && occurred >= new Date(latest.requestedAt))) return;
    }
    const mapping = cards[uid];
    if (!mapping?.staffId) {
      message('未登録のカードです。管理者にお知らせください。', true);
      return 'Unregistered card';
    }
    const staffId = mapping.staffId;
    const eventId = event.eventId || id;
    const punch = {
      id: eventId, staffId, type, occurredAt: occurred.toISOString(),
      source: 'card', terminalId: event.terminalId || terminalId,
      uidLast4: uid.slice(-4), createdAt: new Date().toISOString()
    };
    const destination = ref(db, `attendance/punches/${dateFormat.format(occurred)}/${staffId}/${eventId}`);
    const write = await runTransaction(destination, current => current === null ? punch : undefined, { applyLocally: false });
    lifecycle.assertActive();
    if (!write.committed) return;
    const name = personName(mapping.name || staff[staffId]?.name || defaultStaff.find(member => member.id === staffId)?.name, staffId) || staffId;
    const status = `${name}さん ${labels[type]} ${timeFormat.format(occurred)}`;
    message(status);
    if ('speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance(`${name}さん、${labels[type]}しました`));
  }
}
