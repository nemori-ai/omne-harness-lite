import type {
  CalendarDispositionCommand,
  CalendarReactionAcknowledgement,
} from '@omne-harness/calendar'
import type { FactCommandV2 } from '@omne-harness/sql-contract'

export type CalendarPersistenceAuthorityRequirement =
  | Readonly<{
      action: 'disposition'
      address: CalendarDispositionCommand['address']
      fingerprint: string
      expectedGeneration: number
      authorityGuardRefs: readonly string[]
    }>
  | (Readonly<{ action: 'ackReaction' }> & CalendarReactionAcknowledgement)

export type CalendarPersistenceAuthorityFact = Readonly<{
  decision: 'allowed' | 'denied'
  binding: CalendarPersistenceAuthorityRequirement
}>

export type CalendarPersistenceAuthority = Readonly<{
  participant: string
  command(binding: CalendarPersistenceAuthorityRequirement): FactCommandV2
}>
