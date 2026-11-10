import type { ModelFailure, Termination } from '@omne-harness/model-contract'

/**
 * What a failed execution write means for the owner of the execution:
 *
 * - `unconfirmed`: the write may or may not be durable. Keep the write and ask again later.
 * - `outdated`: another writer advanced the call. Read the call again, then decide again.
 * - `superseded`: the execution is no longer this owner's. Stop, and write no terminal.
 * - `refused`: the write can never be accepted. The call ends as an execution failure.
 */
export type WriteVerdict = 'unconfirmed' | 'outdated' | 'superseded' | 'refused'

export function verdictOf(failure: ModelFailure): WriteVerdict {
  switch (failure.kind) {
    case 'commit-unknown':
    case 'unavailable':
      return 'unconfirmed'
    case 'conflict':
      return 'outdated'
    case 'stale-instance':
    case 'handoff-invalid':
    case 'denied':
      return 'superseded'
    case 'invalid':
    case 'unsupported':
    case 'capacity':
    case 'not-settled':
      return 'refused'
  }
}

/** The owner can drive this call again: it still owns the execution and the call has not ended. */
export function drivable(failure: ModelFailure): boolean {
  const verdict = verdictOf(failure)
  return verdict === 'unconfirmed' || verdict === 'outdated'
}

/** The terminal of a call whose execution write was refused. The shape is fixed and small. */
export function executionFailure(refusal: ModelFailure): Termination {
  return {
    kind: 'failed',
    fault: {
      cause: 'persistence',
      upstreamStatus: null,
      diagnostic: `execution-write-refused:${refusal.kind}`,
    },
  }
}
