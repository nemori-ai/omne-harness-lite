import type { Failure, FailureCandidate } from '@omne-harness/agent-contract'

export type NodeFailureCategory = Extract<FailureCandidate, { kind: 'node-failed' }>['category']

const origins = new WeakMap<Failure, NodeFailureCategory>()

/** Keep local provenance private. Neither diagnostic text nor a port's owner grants it. */
export function localFailure<T extends Failure>(category: NodeFailureCategory, failure: T): T {
  const local = { ...failure }
  origins.set(local, category)
  return local
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
