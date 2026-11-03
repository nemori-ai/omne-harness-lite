import {
  calendarPersistenceAuthorityFact,
  calendarSupplyStorageAuthorityFact,
} from '@omne-harness/calendar-local'

export default {
  participant: 'fixture.seed-authority',
  protocol: 'fixture.seed-authority/1',
  execute(facts, port) {
    const publication = facts.kind === 'publication'
    port.provideFact(calendarPersistenceAuthorityFact, {
      decision: publication ? 'allowed' : 'denied',
      binding: publication ? facts.binding : null,
    })
    port.provideFact(calendarSupplyStorageAuthorityFact, {
      decision: publication ? 'denied' : 'allowed',
      binding: publication ? null : facts.binding,
    })
    return { kind: 'participated', response: { fixtureOnly: true } }
  },
}
