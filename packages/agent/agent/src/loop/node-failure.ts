import type { Failure, FailureCandidate } from '@omne-harness/agent-contract'

export type NodeFailureCategory = Extract<FailureCandidate, { kind: 'node-failed' }>['category']

const origins = new WeakMap<Failure, NodeFailureCategory>()

/** Keep local provenance private. Neither diagnostic text nor a port's owner grants it. */
export function localFailure(category: NodeFailureCategory, failure: Failure): Failure {
  const local = snapshotFailure(failure)
  origins.set(local, category)
  return local
}

function snapshotFailure(failure: Failure): Failure {
  switch (failure.kind) {
    case 'denied':
      return { kind: failure.kind, action: failure.action }
    case 'invalid':
      return { kind: failure.kind, field: failure.field, reason: failure.reason }
    case 'unavailable':
      return { kind: failure.kind, owner: failure.owner, diagnostic: failure.diagnostic }
    case 'commit-unknown':
    case 'conflict':
      return { kind: failure.kind, operation: failure.operation }
    case 'stale-advance':
    case 'not-ready':
    case 'terminal':
    case 'busy':
    case 'changed':
    case 'unsupported':
      return { kind: failure.kind }
    default: {
      const exhaustive: never = failure
      return exhaustive
    }
  }
}

export function nodeFailureCategory(failure: Failure): NodeFailureCategory | null {
  const local = origins.get(failure)
  if (local !== undefined) return local
  switch (failure.kind) {
    case 'invalid':
    case 'unsupported':
    case 'conflict':
      return 'rejected'
    default:
      return null
  }
}
