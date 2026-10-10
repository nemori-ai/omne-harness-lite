import type { AtomicStorage, StorageUnit } from '@omne-harness-lite/storage'
import type { RecoveryAccess } from '@omne-harness-lite/execution-environments'
import type { SessionAccess, SessionScope } from '@omne-harness-lite/session-tenancy'
import type { AppendRequest, InvalidInput, JsonNumber, LogEntry, Unavailable } from './types.ts'
import type { SourceToken } from './source-token.ts'

export type LogAuthority = SessionAccess | RecoveryAccess
export type LogAccessDecision =
  { readonly kind: 'authorized' } | { readonly kind: 'denied' | 'unavailable' }

/** Trusted construction port; current authorization reads use the supplied transaction. */
export interface LogAuthorityOperations {
  readonly storage: AtomicStorage
  readonly authorize: (
    unit: StorageUnit,
    authority: LogAuthority,
    scope: SessionScope,
    operation: 'read' | 'write',
  ) => Promise<LogAccessDecision>
  readonly authorizeEnumeration: (
    unit: StorageUnit,
    authority: RecoveryAccess,
  ) => Promise<LogAccessDecision>
}
export type LogParticipationFailure =
  | InvalidInput
  | Unavailable
  | { readonly failure: 'denied' | 'staleAttempt' }
  | { readonly failure: 'conditionFailed'; readonly tail: JsonNumber }
  | { readonly failure: 'dedupeConflict'; readonly keys: readonly string[] }

export interface SessionLogParticipant {
  /** Reads (after, source.tail] in the caller's unit, with current authorization. */
  readonly readSinceIn: (
    unit: StorageUnit,
    authority: LogAuthority,
    source: SourceToken,
    after: JsonNumber,
  ) => Promise<
    | {
        readonly kind: 'suffix'
        readonly entries: readonly LogEntry[]
        readonly source: SourceToken
      }
    | InvalidInput
    | Unavailable
    | { readonly failure: 'denied' }
  >
  readonly readByKeyIn: (
    unit: StorageUnit,
    authority: LogAuthority,
    source: SourceToken,
    key: string,
  ) => Promise<
    | {
        readonly kind: 'keyed'
        readonly entries: readonly LogEntry[]
        readonly source: SourceToken
      }
    | InvalidInput
    | Unavailable
    | { readonly failure: 'denied' }
  >
  /** Reads the staged current journal coordinate in the supplied shared unit; no independent transaction. */
  readonly sourceIn: (
    unit: StorageUnit,
    authority: LogAuthority,
    scope: SessionScope,
  ) => Promise<
    | { readonly kind: 'source'; readonly source: SourceToken }
    | InvalidInput
    | Unavailable
    | { readonly failure: 'denied' }
  >
  /** Stages only. The caller owns commit, rollback and unknown-commit reconciliation. */
  readonly appendIn: (
    unit: StorageUnit,
    authority: LogAuthority,
    request: AppendRequest,
    expectedSource?: SourceToken,
  ) => Promise<
    | {
        readonly kind: 'staged'
        readonly entries: readonly LogEntry[]
        readonly nextTail: JsonNumber
      }
    | LogParticipationFailure
  >
  /** Reads a fixed complete prefix in the caller's unit. It never starts or commits a transaction. */
  readonly readPrefixIn: (
    unit: StorageUnit,
    authority: LogAuthority,
    source: SourceToken,
  ) => ReturnType<SessionLogParticipant['readPrefix']>
  readonly readPrefix: (
    authority: LogAuthority,
    source: SourceToken,
  ) => Promise<
    | {
        readonly kind: 'prefix'
        readonly entries: readonly LogEntry[]
        readonly source: SourceToken
      }
    | InvalidInput
    | Unavailable
    | { readonly failure: 'denied' }
  >
  readonly source: (
    authority: LogAuthority,
    scope: SessionScope,
  ) => Promise<
    | { readonly kind: 'source'; readonly source: SourceToken }
    | InvalidInput
    | Unavailable
    | { readonly failure: 'denied' }
  >
}
