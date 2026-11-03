export default {
  owner: 'fixture.schedule.guards',
  id: 'fixture-schedule-guards-1',
  up(port) {
    port.execute(
      'CREATE TABLE fixture_schedule_authority (scope TEXT PRIMARY KEY, access TEXT NOT NULL, basis_guard TEXT NOT NULL, quota_guard TEXT NOT NULL, mode TEXT NOT NULL, decision_at TEXT NOT NULL, capacity INTEGER NOT NULL, actions TEXT NOT NULL, purposes TEXT NOT NULL)',
      [],
    )
    port.execute(
      'CREATE TABLE fixture_schedule_quota (schedule_id TEXT PRIMARY KEY, bucket TEXT NOT NULL, reservation TEXT NOT NULL, held INTEGER NOT NULL)',
      [],
    )
  },
  verify(port) {
    port.execute('SELECT * FROM fixture_schedule_authority LIMIT 0', [])
    port.execute('SELECT * FROM fixture_schedule_quota LIMIT 0', [])
    return { kind: 'verified' }
  },
}
