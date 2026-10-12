import type {
  ModelCallEndedRecord,
  ModelCallInterruptIntentRecord,
} from '@omne-harness-lite/messages'
import type { AttemptId, RunId } from '@omne-harness-lite/call-accounts'
import type { AppendResult } from '@omne-harness-lite/session-log'
import type {
  SettlementLogBinding,
  SettlementOwner,
  SettlementRegistration,
  SettlementTask,
} from './settlement-types.ts'

export interface ControlAppendInput {
  readonly binding: SettlementLogBinding
  readonly owner: SettlementOwner
  readonly concurrent: import('@omne-harness-lite/content-blocks').JsonNumber
  readonly record: ModelCallInterruptIntentRecord | ModelCallEndedRecord
  /** Original Run/attempt only; no synthetic fence is permitted. */
  readonly run?: RunId
  readonly attempt?: AttemptId
  /** The caller owns this registration until actual stop and authoritative recognition. */
  readonly retainUnknown: (
    registration: SettlementRegistration,
    task: SettlementTask<AppendResult>,
  ) => void
  readonly trackTask?: (task: SettlementTask<AppendResult>) => () => void
}
