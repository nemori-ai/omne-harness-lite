export default {
  owner: 'fixture.projection-owner',
  id: 'fixture-projection-1',
  up(port) {
    port.execute('CREATE TABLE pr_value (id INTEGER PRIMARY KEY, value TEXT NOT NULL) STRICT', [])
  },
  verify(port) {
    port.execute('SELECT value FROM pr_value LIMIT 0', [])
    return { kind: 'verified' }
  },
}
