// Presentation and task-list matching only. Never use these helpers to grant access,
// infer persisted staff IDs, migrate records, or combine accounts.
export const DIRECTOR_STAFF_ID = 'sugihira';
const directorAliases = new Set(['杉平', '院長', '杉平院長']);

function legacyNameParts(name) {
  const value = typeof name === 'string' ? name.trim() : '';
  const suffix = value.endsWith('（Google）') ? '（Google）' : '';
  return {base: suffix ? value.slice(0, -suffix.length) : value, suffix};
}

export function personDisplayName({staffId = '', name = ''} = {}) {
  const {base, suffix} = legacyNameParts(name);
  if (staffId === DIRECTOR_STAFF_ID || (!staffId && directorAliases.has(base))) return '院長' + suffix;
  return name || staffId || '';
}

export const personName = (name, staffId = '') => personDisplayName({name, staffId});

// Display only: verified director UID from the registered account list.
// Never use this mapping for authorization or persisted identity changes.
export function accountPersonName(name, uid = '', staffId = '') {
  if (staffId) return personName(name, staffId);
  if (uid === 'bYJNghzzWBeZ8iDOA67CM4q316p2') return personName(name, DIRECTOR_STAFF_ID);
  // An explicit other account must not be inferred from a matching old name.
  return uid ? name : personName(name);
}

export function personMatchesForDisplay(record = {}, person) {
  if (!person?.staffId) return false;
  // An explicit different ID must never be overridden by a matching name.
  if (record.staffId) return record.staffId === person.staffId;
  const saved = legacyNameParts(record.name).base;
  if (!saved) return false;
  if (person.staffId === DIRECTOR_STAFF_ID) return directorAliases.has(saved) || saved === person.name;
  return saved === person.name;
}

export function taskAssignedForDisplay(task = {}, person) {
  if (Array.isArray(task.assigneeRefs)) return task.assigneeRefs.some(ref => personMatchesForDisplay(ref, person));
  return Array.isArray(task.assignees) && task.assignees.some(name => personMatchesForDisplay({name}, person));
}

export function taskCreatedForDisplay(task = {}, person) {
  return personMatchesForDisplay({staffId:task.createdByStaffId || '', name:task.createdBy || ''}, person);
}

// Keep raw name fields intact: forms, CSV imports, audit records, and permission
// checks may still depend on them. Consumers explicitly render displayName.
export function withPersonDisplay(record = {}, id = record.staffId || record.id || '') {
  return {...record, displayName:personDisplayName({staffId:id, name:record.name})};
}
