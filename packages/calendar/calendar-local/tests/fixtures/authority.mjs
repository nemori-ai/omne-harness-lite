import { calendarPersistenceAuthorityFact } from '@omne-harness/calendar-local'

export default {
  participant: 'fixture.calendar-authority',
  protocol: 'fixture-calendar-authority/1',
  execute(facts, port) {
    if (facts.action === 'configure') {
      port.execute(
        'UPDATE fixture_calendar_grants SET publish_allowed = ?, ack_allowed = ?, mode = ? WHERE id = 1',
        [facts.publish, facts.ack, facts.mode],
      )
      port.provideFact(calendarPersistenceAuthorityFact, { decision: 'denied', binding: null })
      return { kind: 'participated', response: { configured: true } }
    }
    const row = port.execute(
      'SELECT publish_allowed, ack_allowed, mode FROM fixture_calendar_grants WHERE id = 1',
      [],
    ).rows[0]
    if (row[2] === 'early-stop') return { kind: 'conflict', basis: { reason: 'fixtureEarlyStop' } }
    const binding = structuredClone(facts.binding)
    if (row[2] === 'wrong-calendar' && binding.action === 'disposition')
      binding.address.calendarId = 'another-calendar'
    if (row[2] === 'wrong-fingerprint') binding.fingerprint = '0'.repeat(64)
    if (row[2] === 'wrong-generation') binding.expectedGeneration += 1
    if (row[2] === 'wrong-refs') binding.authorityGuardRefs = ['another-guard']
    const allowed = binding.action === 'disposition' ? row[0] : row[1]
    port.provideFact(calendarPersistenceAuthorityFact, {
      decision: allowed === 1 || allowed === 1n ? 'allowed' : 'denied',
      binding,
    })
    return { kind: 'participated', response: { fixtureOnly: true } }
  },
}
