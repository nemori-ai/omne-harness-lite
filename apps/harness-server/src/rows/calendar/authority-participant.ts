import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import {
  calendarPersistenceAuthorityFact,
  calendarSupplyStorageAuthorityFact,
} from '@omne-harness/calendar-local'
import { CALENDAR_AUTHORITY } from './authority.ts'

/**
 * The calendar row writes calendar facts only for its own seed import, so a command that the
 * persistence or the supply store binds here is allowed for that store and denied for the other.
 */
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
