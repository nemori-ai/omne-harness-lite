import type { AttemptId, RunId } from '@omne-harness-lite/call-accounts'
import type { JsonNumber, JsonValue, OpaqueJson } from '@omne-harness-lite/content-blocks'
import type { TenantId } from '@omne-harness-lite/identity-values'
import type { SessionRef } from '@omne-harness-lite/messages'

export type { AttemptId, RunId, JsonNumber, JsonValue, OpaqueJson, TenantId, SessionRef }

export interface LogEntryInput {
  readonly tenant: TenantId
  readonly run?: RunId
  readonly attempt?: AttemptId
  readonly dedupeKey?: string
  readonly readKeys: readonly string[]
  /** An external value is accepted only after the strict core JSON copying boundary. */
  readonly payload: unknown
}
/** Owned exchange data: opaque wrappers have passed the core copying boundary. */
export interface OwnedLogEntry extends Omit<LogEntryInput, 'payload'> {
  readonly payload: JsonValue
}
export interface LogEntry extends OwnedLogEntry {
  readonly session: SessionRef
  readonly position: JsonNumber
}
export type AppendFence =
  | { readonly kind: 'unfenced' }
  | { readonly kind: 'fenced'; readonly run: RunId; readonly attempt: AttemptId }
export type AppendCondition =
  { readonly kind: 'unconditional' } | { readonly kind: 'tailEquals'; readonly tail: JsonNumber }
export interface AppendRequest {
  readonly session: SessionRef
  readonly entries: readonly OwnedLogEntry[]
  readonly fence: AppendFence
  readonly condition: AppendCondition
}
export type InvalidInput = { readonly failure: 'invalidInput' }
export type Unavailable = { readonly failure: 'unavailable' }
export type AppendRejection =
  | { readonly failure: 'tenantMismatch' }
  | { readonly failure: 'attemptSuperseded' }
  | { readonly failure: 'alreadyRecorded'; readonly keys: readonly string[] }
  | { readonly failure: 'tailChanged'; readonly tail: JsonNumber }
export interface AppendSuccess {
  readonly positions: readonly JsonNumber[]
  readonly tail: JsonNumber
}
export type AppendResult = AppendSuccess | InvalidInput | Unavailable | AppendRejection
export type ReadResult =
  { readonly entries: readonly LogEntry[]; readonly tail: JsonNumber } | InvalidInput | Unavailable
export interface SessionLog {
  readonly append: (
    session: SessionRef,
    entries: readonly LogEntryInput[],
    fence: AppendFence,
    condition: AppendCondition,
  ) => Promise<AppendResult>
  readonly readByKey: (session: SessionRef, key: string) => Promise<ReadResult>
  readonly readSince: (session: SessionRef, after: JsonNumber) => Promise<ReadResult>
}
export interface JsonlSessionLog extends SessionLog {
  /** Stops admission, drains physical tasks, closes handles, then releases ownership. */
  readonly close: () => Promise<void>
}
export interface LogState {
  readonly tenant?: TenantId
  readonly tail: JsonNumber
  readonly dedupeKeys: readonly string[]
  readonly readPositions: readonly (readonly [string, JsonNumber])[]
  readonly maxAttempts: readonly (readonly [RunId, AttemptId])[]
}
export interface LogCommit {
  readonly v: 1
  readonly session: SessionRef
  readonly first: JsonNumber
  readonly entries: readonly OwnedLogEntry[]
}
export interface LocatedCommit {
  readonly commit: LogCommit
  readonly start: number
  readonly end: number
}
export type LogDecodeResult =
  | {
      readonly commits: readonly LocatedCommit[]
      readonly validBytes: number
      readonly needsTruncation: boolean
    }
  | {
      readonly failure: 'corrupt'
      readonly line: number
      readonly reason: 'representation' | 'session' | 'position' | 'tenant'
    }
