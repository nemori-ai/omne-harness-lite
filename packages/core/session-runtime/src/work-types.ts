import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import type { SessionRef } from '@omne-harness-lite/messages'
import type { SessionLog, SourceToken, LogEntry } from '@omne-harness-lite/session-log'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { StorageUnit } from '@omne-harness-lite/storage'
import type { CoordinationAuthority, SessionHead, Failure } from './types.ts'

/** Trusted Session work observations. Neither operation grants execution authority. */
export interface SessionWorkReading {
  /** Trusted keyset scan of this tenant's durable work index. Candidates grant no execution. */
  readonly scanWork: (
    authority: CoordinationAuthority,
    after: SessionRef | null,
    limit: number,
  ) => Promise<
    | {
        readonly kind: 'workPage'
        readonly sessions: readonly SessionRef[]
        readonly next: SessionRef | null
      }
    | Failure<'invalidInput' | 'denied' | 'unavailable'>
  >
  /** Trusted coordinator snapshot. This read neither consumes pending work nor issues a permit. */
  readonly readWork: (
    authority: CoordinationAuthority,
    scope: SessionScope,
    limit: number,
  ) => Promise<
    | {
        readonly kind: 'work'
        readonly head: SessionHead
        readonly source: SourceToken
        readonly inputs: readonly JsonNumber[]
      }
    | Failure<'invalidInput' | 'denied' | 'unavailable' | 'notFound'>
  >
}

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
