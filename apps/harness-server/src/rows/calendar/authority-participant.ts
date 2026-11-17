import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import {
  calendarPersistenceAuthorityFact,
  calendarSupplyStorageAuthorityFact,
} from '@omne-harness/calendar-local'
import { CALENDAR_AUTHORITY } from './authority.ts'

/** The row writes calendar facts only for its seed: each store's own command is allowed, the other's denied. */
export default {
  ...CALENDAR_AUTHORITY,
  execute(facts, port) {
    const publication = facts['kind'] === 'publication'
    const binding = facts['binding'] ?? null
    port.provideFact(calendarPersistenceAuthorityFact, {
      decision: publication ? 'allowed' : 'denied',
      binding: publication ? binding : null,
    })
    port.provideFact(calendarSupplyStorageAuthorityFact, {
      decision: publication ? 'denied' : 'allowed',
      binding: publication ? null : binding,
    })
    return { kind: 'participated', response: null }
  },
} satisfies ParticipantModule
