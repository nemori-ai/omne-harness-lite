import type { GovernanceOperationRef } from '@omne-harness/identity'
import type { ReadResult } from '@omne-harness/sql-contract'
import type { Instant } from '@omne-harness/utc-instant'

export class IdentitySqlResultUnknown extends Error {
  override readonly name = 'IdentitySqlResultUnknown'
  readonly operation: GovernanceOperationRef | undefined
  constructor(message: string, operation?: GovernanceOperationRef) {
    super(message)
    this.operation = operation
  }
}

export type Unavailable = Readonly<{ kind: 'basis-unavailable'; diagnostic: string }>

export type TimeBasis = Readonly<{ kind: 'read'; instant: Instant }> | Unavailable

export function unavailable(diagnostic: string): Unavailable {
  return Object.freeze({ kind: 'basis-unavailable', diagnostic })
}

export function readReason(result: Exclude<ReadResult, { kind: 'read' }>): string {
  return result.kind === 'cancelled' ? 'cancelled' : result.reason
}
