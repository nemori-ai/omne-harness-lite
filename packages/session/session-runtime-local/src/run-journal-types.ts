import type { SessionLog, SourceToken, LogEntry } from '@omne-harness-lite/session-log'
import type { CoordinationAuthority } from '@omne-harness-lite/session-runtime'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { StorageUnit } from '@omne-harness-lite/storage'

/** Trusted borrowed original-Run log. It cannot be sent in a client protocol. */
export interface BorrowedRunJournal {
  readonly scope: SessionScope
  readonly run: string
  /** Process-local borrow identity, distinct from the durable journal generation. */
  readonly generation: object
  readonly currentGeneration: () => object | null
  readonly log: SessionLog
  /** Trusted local input reads under this original Run grant. No external IO or escaped unit. */
  readonly withReadUnit: <T>(
    read: (unit: StorageUnit) => Promise<T>,
  ) => Promise<{ readonly read: T } | { readonly unavailable: true }>
  readonly readPrefix: () => Promise<
    | {
        readonly entries: readonly LogEntry[]
        readonly tail: SourceToken['tail']
        readonly source: SourceToken
      }
    | { readonly failure: 'unavailable' }
  >
  /** Revoke this borrow, drain its original units, then return it to the Session owner. */
  readonly close: () => Promise<void>
}
export interface OriginalRunJournal {
  readonly borrow: (
    authority: CoordinationAuthority,
    scope: SessionScope,
    run: string,
  ) => Promise<
    | { readonly journal: BorrowedRunJournal }
    | { readonly failure: 'denied' | 'invalidInput' | 'unavailable' }
  >
}
