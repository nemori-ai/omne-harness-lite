export default {
  owner: 'fixture.supply-authority',
  id: 'fixture-supply-1',
  up(port) {
    port.execute(
      'CREATE TABLE fixture_supply_authority (id INTEGER PRIMARY KEY, mode TEXT NOT NULL)',
      [],
    )
    port.execute("INSERT INTO fixture_supply_authority VALUES (1, 'allowed')", [])
  },
  verify(port) {
    port.execute('SELECT id FROM fixture_supply_authority LIMIT 1', [])
    return { kind: 'verified' }
  },
}
