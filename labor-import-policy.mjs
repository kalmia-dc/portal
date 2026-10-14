// Q053: shared scheduling/test slots stay in the portal, outside HR roster import.
export const IMPORT_EXCLUDED_IDS = Object.freeze(['test','hanowa','kyosei']);
export const canImportStaff = staff => !IMPORT_EXCLUDED_IDS.includes(staff.id);
