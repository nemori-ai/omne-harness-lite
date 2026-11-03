// Result helpers that the operations and the governance port share: the `basis-unavailable`
// answer, the reason of a failed read, and the error that rejects a Promise whose outcome is not
// known. No diagnostic here carries a credential, a proof, a login identifier or a login identity.
import type { ReadResult } from '@omne-harness/sql-contract'
import type { Instant } from '@omne-harness/utc-instant'

/** The result of a commit or an issue is not known. The message names no secret. */
export class IdentitySqlResultUnknown extends Error {
  override readonly name = 'IdentitySqlResultUnknown'
}

export type Unavailable = Readonly<{ kind: 'basis-unavailable'; diagnostic: string }>

export type TimeBasis = Readonly<{ kind: 'read'; instant: Instant }> | Unavailable

export function unavailable(diagnostic: string): Unavailable {
  return Object.freeze({ kind: 'basis-unavailable', diagnostic })
}

export function readReason(result: Exclude<ReadResult, { kind: 'read' }>): string {
  return result.kind === 'cancelled' ? 'cancelled' : result.reason
}
