export function readerMatches(name, configuredNames) {
  const candidate = String(name || '').toUpperCase();
  const names = Array.isArray(configuredNames) ? configuredNames : [configuredNames];
  return names.filter(Boolean).some(value => candidate.includes(String(value).toUpperCase()));
}

export function readerPaths(config) {
  const terminalId = String(config.terminalId || '').trim();
  if (!terminalId || !/^[A-Za-z0-9_-]+$/.test(terminalId)) throw new Error('terminalId が不正です。');
  if (config.mode === 'production-pilot') {
    return {
      selectedType:`attendance/terminals/${terminalId}/selectedType`,
      heartbeat:`attendance/terminals/${terminalId}/heartbeat`,
      event:eventId => `attendance/terminals/${terminalId}/inbox/${eventId}`,
      status:'pending',
      label:'本番パイロット',
    };
  }
  if (config.mode !== 'test') throw new Error('mode は test または production-pilot を指定してください。');
  const root = 'attendanceTest/v1';
  return {
    selectedType:`${root}/deviceTerminals/${terminalId}/selectedType`,
    heartbeat:`${root}/deviceTerminals/${terminalId}/heartbeat`,
    event:eventId => `${root}/devicePunches/${terminalId}/${eventId}`,
    status:'test-pending',
    label:'分離テスト',
  };
}
