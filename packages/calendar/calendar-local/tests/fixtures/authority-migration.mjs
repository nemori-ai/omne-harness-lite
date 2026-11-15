export default {
  owner: 'fixture.calendar-authority',
  id: 'fixture-calendar-authority-1',
  up(port) {
    port.execute(
      'CREATE TABLE fixture_calendar_grants (id INTEGER PRIMARY KEY, publish_allowed INTEGER NOT NULL, ack_allowed INTEGER NOT NULL, mode TEXT NOT NULL)',
      [],
    )
    port.execute("INSERT INTO fixture_calendar_grants VALUES (1, 1, 1, 'normal')", [])
  },
  verify(port) {
    return port.execute('SELECT id FROM fixture_calendar_grants WHERE id = 1', []).rows.length === 1
      ? { kind: 'verified' }
      : { kind: 'failed', diagnostic: 'fixture grant missing' }
  },
}
