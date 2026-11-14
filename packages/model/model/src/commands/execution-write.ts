import type { ModelFailure, Termination } from '@omne-harness/model-contract'

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
    case 'not-settled':
      return 'refused'
  }
}

export function drivable(failure: ModelFailure): boolean {
  const verdict = verdictOf(failure)
  return verdict === 'unconfirmed' || verdict === 'outdated'
}

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
