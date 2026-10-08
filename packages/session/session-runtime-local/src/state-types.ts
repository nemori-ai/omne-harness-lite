import type { AtomicStorage, StorageUnit } from '@omne-harness-lite/storage'
import type { TenantId } from '@omne-harness-lite/identity-values'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type {
  AttemptPermit,
  SessionStateParticipant,
  SessionStateAuthorityOperations,
} from '@omne-harness-lite/session-runtime'
import type { AttemptId, RunId } from '@omne-harness-lite/call-accounts'

export interface StatePolicy {
  readonly maxPendingPerSession: number
  readonly maxBatchSize: number
  readonly maxRecordBytes: number
}
/** Internal provider construction. The authority reads actual current evidence in the supplied unit. */
export interface StateOptions {
  readonly storage: AtomicStorage
  readonly tenant: TenantId
  readonly authority: SessionStateAuthorityOperations
  readonly policy: StatePolicy
  readonly isOpen: () => boolean
  readonly workSettledIn: (
    unit: StorageUnit,
    scope: SessionScope,
    run: RunId,
  ) => Promise<'settled' | 'pending' | 'unavailable'>
}
export interface LocalSessionState {
  readonly participant: SessionStateParticipant
  readonly checkPermitIn: (
    unit: StorageUnit,
    permit: AttemptPermit,
    scope: SessionScope,
    run: RunId,
    attempt: AttemptId,
  ) => Promise<boolean>
}
