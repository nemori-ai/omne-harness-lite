export const VALUE_FACT = { key: 'fixture.projection-value', protocol: '1' }
export default {
  participant: 'fixture.projection-owner',
  protocol: '1',
  execute(facts, port) {
    if (facts.kind === 'set') {
      port.execute(
        'INSERT INTO pr_value (id, value) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET value = excluded.value',
        [facts.value],
      )
      return { kind: 'participated', response: null }
    }
    const row = port.execute('SELECT value FROM pr_value WHERE id = 1 LIMIT 1', []).rows[0]
    const value = row === undefined ? null : row[0]
    port.provideFact(VALUE_FACT, value)
    return { kind: 'participated', response: value }
  },
}
