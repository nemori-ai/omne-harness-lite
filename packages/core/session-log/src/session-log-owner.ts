import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import type { SessionAccess, SessionScope } from '@omne-harness-lite/session-tenancy'
import type { LogEntry, SessionLog } from './types.ts'
import type { RecoveryAccess } from '@omne-harness-lite/execution-environments'

export interface OwnedSession {readonly scope: SessionScope; readonly locator: string}
export type OwnerFailure = {readonly kind: 'rejected'; readonly reason: 'invalidInput' | 'notAuthorized' | 'unavailable' | 'ownerStopped' | 'unresolvedWrites'}
export interface CheckedPrefix {
  readonly scope: SessionScope
  readonly ownerGeneration: string
  readonly tail: JsonNumber
  /** Complete, ordered, decoded business values; never a collection of key-query fragments. */
  readonly entries: readonly LogEntry[]
}
export interface SessionLogOwnerOperations {
  readonly enumerate: (authority: RecoveryAccess) => Promise<{readonly kind: 'sessions'; readonly sessions: readonly OwnedSession[]} | OwnerFailure>
  /** SessionAccess must carry private coordinator authority; tool.read is insufficient. */
  readonly readPrefix: (authority: SessionAccess | RecoveryAccess, scope: SessionScope) => Promise<{readonly kind: 'prefix'; readonly prefix: CheckedPrefix} | OwnerFailure>
  /** A held owner borrow; release waits for this borrow's unresolved physical jobs. */
  readonly borrow: (authority: SessionAccess | RecoveryAccess, scope: SessionScope) => Promise<{readonly kind: 'borrowed'; readonly log: SessionLog; readonly ownerGeneration: string; readonly release: () => Promise<void>} | OwnerFailure>
}
