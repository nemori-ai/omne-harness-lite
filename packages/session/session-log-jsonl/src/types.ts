import { type OwnedLogEntry, type SessionLog } from '@omne-harness-lite/session-log'
import type { AttemptId, RunId } from '@omne-harness-lite/call-accounts'
import type { JsonNumber, JsonValue, OpaqueJson } from '@omne-harness-lite/content-blocks'
import type { TenantId } from '@omne-harness-lite/identity-values'
import type { SessionRef } from '@omne-harness-lite/messages'

export type { AttemptId, RunId, JsonNumber, JsonValue, OpaqueJson, TenantId, SessionRef }
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
