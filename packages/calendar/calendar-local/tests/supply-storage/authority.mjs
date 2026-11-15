import { calendarSupplyStorageAuthorityFact } from '@omne-harness/calendar-local'
export default {
  participant: 'fixture.supply-authority',
  protocol: 'fixture-supply/1',
  execute(facts, port) {
    if ('mode' in facts) {
      port.execute('UPDATE fixture_supply_authority SET mode = ? WHERE id = 1', [facts.mode])
      port.provideFact(calendarSupplyStorageAuthorityFact, { decision: 'denied', binding: null })
      return { kind: 'participated', response: null }
    }
    const mode = port.execute('SELECT mode FROM fixture_supply_authority WHERE id = 1', [])
      .rows[0][0]
    if (mode === 'early-stop') return { kind: 'conflict', basis: { reason: 'fixtureEarlyStop' } }
    const binding = structuredClone(facts.binding)
    if (mode === 'wrong-scope') binding.systemScopeRef = 'wrong'
    if (mode === 'wrong-digest') binding.payloadDigest = '0'.repeat(64)
    port.provideFact(calendarSupplyStorageAuthorityFact, {
      decision: mode === 'denied' ? 'denied' : 'allowed',
      binding,
    })
    return { kind: 'participated', response: { fixtureOnly: true } }
  },
}
