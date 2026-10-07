import type { AtomicStorage } from '@omne-harness-lite/storage'
import type {
  LogAuthorityOperations,
  SessionLog,
  SessionLogBackingOperations,
  SessionLogOwnerOperations,
  SessionLogParticipant,
} from '@omne-harness-lite/session-log'

export interface SessionLogSqlOptions {
  readonly storage: AtomicStorage
  readonly authority: LogAuthorityOperations
  /** Maximum operations per handle and owner, unresolved participant batches, and held borrows in each category. Capacity refusal precedes IO. */
  readonly operationLimit: number
}
export interface SqlSessionLog extends SessionLog {
  /** Stop the trusted raw handle and reconcile its writes. Bound recovery borrows remain usable. */
  readonly drainRaw: () => Promise<void>
  readonly participant: SessionLogParticipant
  readonly backing: SessionLogBackingOperations
  readonly owner: SessionLogOwnerOperations
  /** Stops admission and drains. Unresolved commits or held borrows reject and retain responsibility. */
  readonly close: () => Promise<void>
}
