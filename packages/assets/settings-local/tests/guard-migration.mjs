export default {
  owner: 'fixture.settings.guard',
  id: 'fixture-settings-1',
  up(port) {
    port.execute(
      'CREATE TABLE fixture_settings_authority (id TEXT PRIMARY KEY, authority TEXT NOT NULL)',
      [],
    )
  },
  verify(port) {
    port.execute('SELECT * FROM fixture_settings_authority LIMIT 0', [])
    return { kind: 'verified' }
  },
}
