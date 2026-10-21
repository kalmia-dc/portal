// The punch-test account's exact staff ID was verified in the shift UI.
// Presentation/aggregate selection only: retain its account and source records.
function isNormalStatisticsStaff(staffId) {
  return staffId !== 'test';
}
