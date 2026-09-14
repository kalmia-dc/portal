import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');

function source(name) {
  return fs.readFileSync(path.join(root, name), 'utf8');
}

function parseInlineScripts(name) {
  const html = source(name);
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  for (const [index, match] of scripts.entries()) {
    if (/\bsrc\s*=/.test(match[1])) continue;
    const id = `${name}#script-${index + 1}`;
    if (/\btype\s*=\s*["']module["']/.test(match[1])) new vm.SourceTextModule(match[2], { identifier:id });
    else new vm.Script(match[2], { filename:id });
  }
}

for (const name of ['index.html', 'attendance.html', 'meeting-management.html', 'terminal-setup.html']) {
  parseInlineScripts(name);
}

const index = source('index.html');
assert.match(index, /portalTerminalMode/);
assert.match(index, /mode === 'attendance'/);
assert.match(index, /location\.replace\(['"]\.\/meeting-management\.html['"]\)/);
assert.doesNotMatch(index, /共用PCの設定が必要です/);
assert.match(index, /authenticatedProfile\?\.portalRole !== 'terminal'/);

const setup = source('terminal-setup.html');
assert.match(setup, /profile\.portalRole!==['"]admin['"]/);
assert.match(setup, /data-mode="attendance"/);
assert.match(setup, /data-mode="meeting"/);

const attendance = source('attendance.html');
assert.match(attendance, /classList\.toggle\(['"]terminal-mode['"],isTerminal\(\)\)/);
assert.match(attendance, /class="tab staff-only" data-tab="records"/);
assert.match(attendance, /portalTerminalMode['"]\)!==['"]attendance['"]/);

const meeting = source('meeting-management.html');
assert.match(meeting, /function isReadOnlyTerminal\(\)/);
assert.match(meeting, /incidentFormPanel['"]\)\.hidden = isReadOnlyTerminal\(\)/);
assert.match(meeting, /if \(isReadOnlyTerminal\(\)\) return;/);
assert.match(meeting, /portalTerminalMode['"]\) === ['"]attendance['"]/);

const rules = JSON.parse(source('database.rules.json'));
const meetingRules = rules.rules.meetingManagement;
for (const key of ['tasks', 'opinions']) {
  assert.match(meetingRules[key]['.write'], /role'\)\.val\(\) !== 'terminal'/);
}
assert.match(meetingRules.incidentReports['.read'], /role'\)\.val\(\) === 'terminal'/);
assert.match(meetingRules.incidentReports.$reportId['.write'], /role'\)\.val\(\) !== 'terminal'/);

console.log('terminalModeValidation=ok scripts=4 routing=ok meetingReadOnly=ok rules=ok');
