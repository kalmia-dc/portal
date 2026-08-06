import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import pcsclite from 'pcsclite';

const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, '$1'));
const config = JSON.parse(fs.readFileSync(path.join(root, 'reader-config.json'), 'utf8'));
const stateDir = path.join(os.homedir(), 'AppData', 'Local', 'KalmiaAttendanceReader');
const queuePath = path.join(stateDir, 'offline-queue.json');
fs.mkdirSync(stateDir, { recursive: true });
let queue = readQueue();
let selectedType = 'in';
let busy = false;

function readQueue() {
  try { return JSON.parse(fs.readFileSync(queuePath, 'utf8')); } catch { return []; }
}
function saveQueue() { fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2), 'utf8'); }
function endpoint(relative) { return `${config.databaseUrl}/${relative}.json`; }
async function put(relative, value) {
  const response = await fetch(endpoint(relative), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  if (!response.ok) throw new Error(`Firebase HTTP ${response.status}`);
}
async function getJson(relative) {
  const response = await fetch(endpoint(relative), { cache: 'no-store' });
  if (!response.ok) throw new Error(`Firebase HTTP ${response.status}`);
  return response.json();
}
async function refreshSelectedType() {
  try { selectedType = await getJson(`attendance/terminals/${config.terminalId}/selectedType`) || 'in'; } catch {}
}
async function heartbeat() {
  try { await put(`attendance/terminals/${config.terminalId}/heartbeat`, new Date().toISOString()); } catch {}
}
async function sendEvent(event) {
  await put(`attendance/terminals/${config.terminalId}/inbox/${event.eventId}`, { ...event, status: 'pending' });
}
async function flushQueue() {
  if (!queue.length) return;
  const remaining = [];
  for (const event of queue) {
    try { await sendEvent(event); } catch { remaining.push(event); }
  }
  queue = remaining;
  saveQueue();
}
async function recordUid(uid) {
  const now = new Date();
  const event = { eventId: crypto.randomUUID(), uid, type: selectedType, occurredAt: now.toISOString(), terminalId: config.terminalId, source: 'rc-s300-p' };
  try { await sendEvent(event); console.log(`${now.toLocaleString('ja-JP')} ${selectedType} ${uid.slice(-4)} 送信済み`); }
  catch { queue.push(event); saveQueue(); console.log(`${now.toLocaleString('ja-JP')} ${selectedType} ${uid.slice(-4)} オフライン保存`); }
}

const pcsc = pcsclite();
pcsc.on('reader', reader => {
  if (config.readerNameContains && !reader.name.toUpperCase().includes(config.readerNameContains.toUpperCase())) {
    console.log(`対象外リーダー: ${reader.name}`);
    return;
  }
  console.log(`接続: ${reader.name}`);
  reader.on('status', status => {
    const changes = reader.state ^ status.state;
    if (!(changes & reader.SCARD_STATE_PRESENT) || !(status.state & reader.SCARD_STATE_PRESENT) || busy) return;
    busy = true;
    reader.connect({ share_mode: reader.SCARD_SHARE_SHARED }, (connectError, protocol) => {
      if (connectError) { busy = false; return console.error(connectError.message); }
      reader.transmit(Buffer.from([0xff, 0xca, 0x00, 0x00, 0x00]), 32, protocol, async (error, data) => {
        reader.disconnect(reader.SCARD_LEAVE_CARD, () => {});
        if (!error && data?.length > 2) {
          const uid = data.subarray(0, -2).toString('hex').toUpperCase();
          await refreshSelectedType();
          await recordUid(uid);
        } else console.error(error?.message || 'カードIDを取得できませんでした');
        setTimeout(() => { busy = false; }, 1200);
      });
    });
  });
  reader.on('error', error => console.error(`リーダーエラー: ${error.message}`));
});
pcsc.on('error', error => console.error(`PC/SCエラー: ${error.message}`));

setInterval(refreshSelectedType, 3000);
setInterval(heartbeat, 15000);
setInterval(flushQueue, 10000);
await refreshSelectedType();
await heartbeat();
await flushQueue();
console.log(`カルミアDC勤怠カード読取を開始しました（端末: ${config.terminalId}）`);
