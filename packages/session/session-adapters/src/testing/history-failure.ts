import type { SessionFailure } from '@omne-harness/session-contract'
export class HistoryFailure extends Error {
  readonly failure: SessionFailure
  constructor(failure: SessionFailure) {
    super(failure.kind)
    this.failure = failure
  }
}
export function unavailable(field: string): never {
  throw new HistoryFailure({ kind: 'unavailable', owner: 'session-history', diagnostic: field })
}
export function corrupt(field: string): never {
  throw new HistoryFailure({ kind: 'quarantined', diagnostic: field })
}
