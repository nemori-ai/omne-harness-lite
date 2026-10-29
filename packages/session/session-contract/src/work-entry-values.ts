import type { ConsumptionId, EntryId, SessionOperationId } from './identity.ts'

export type SessionCallEntryReferences = Readonly<{
  consumption: ConsumptionId
  registered: EntryId
  association: EntryId | null
  waits: readonly Readonly<{ position: string; entry: EntryId }>[]
}>
export type SessionControlEntryReferences = Readonly<{
  operation: SessionOperationId
  intent: EntryId
  progress: EntryId | null
  selected: readonly Readonly<{
    consumption: ConsumptionId
    position: string
    registered: EntryId
    waiting: EntryId
    association: EntryId | null
  }>[]
}>
export type SessionWorkEntryIndex = Readonly<{
  calls: readonly SessionCallEntryReferences[]
  controls: readonly SessionControlEntryReferences[]
}>
