import type {
  DurableEvidence,
  Failure,
  FailureCandidate,
  StepId,
} from '@omne-harness/agent-contract'
import { AGENT_OWNER } from './identities.ts'

export type NodeFailureCategory = Extract<FailureCandidate, { kind: 'node-failed' }>['category']

const origins = new WeakMap<Failure, NodeFailureCategory>()

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
      return {
        kind: failure.kind,
        field: failure.field,
        reason: failure.reason,
      }
    case 'unavailable':
      return {
        kind: failure.kind,
        owner: failure.owner,
        diagnostic: failure.diagnostic,
      }
    case 'commit-unknown':
    case 'conflict':
      return { kind: failure.kind, operation: failure.operation }
    case 'stale-advance':
    case 'not-ready':
    case 'terminal':
    case 'busy':
    case 'changed':
    case 'unsupported':
    case 'reclaimed':
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
    case 'reclaimed':
      return 'invariant'
    default:
      return null
  }
}

const namedStops = new WeakSet<Failure>()

export function namedStop(): Failure {
  const stop: Failure = { kind: 'stale-advance' }
  namedStops.add(stop)
  return stop
}

export function revocationWait(
  failure: Failure,
  advancement: Readonly<{ kind: string }>,
): Extract<Failure, { kind: 'unavailable' }> | null {
  if (failure.kind !== 'stale-advance' || namedStops.has(failure)) return null
  if (advancement.kind !== 'current') return null
  return {
    kind: 'unavailable',
    owner: AGENT_OWNER,
    diagnostic: 'the advance is revoked and its cause is not in the Journal yet',
  }
}

const DIAGNOSTIC_LIMIT = 200

export function failureDiagnostic(failure: Failure): string | null {
  if (failure.kind !== 'invalid' && failure.kind !== 'unavailable') return null
  if (failure.disclosed === undefined || failure.disclosed === '') return null
  const line = [...failure.disclosed]
    .map(char => (char < ' ' || char === '\u007f' ? ' ' : char))
    .join('')
  return line.slice(0, DIAGNOSTIC_LIMIT)
}

type NodeFailed = Extract<FailureCandidate, { kind: 'node-failed' }>

export type NodeFault = Readonly<{
  node: string
  category: NodeFailureCategory
  failureKind: Failure['kind']
  diagnostic: string | null
  step: StepId | null
  history: DurableEvidence | null
}>

export function nodeFault(
  at: Pick<NodeFault, 'node' | 'category' | 'step' | 'history'>,
  failure: Failure,
): NodeFault {
  return { ...at, failureKind: failure.kind, diagnostic: failureDiagnostic(failure) }
}

export function savedNodeFault(failure: NodeFailed): NodeFault {
  const { node, category, failureKind, step } = failure
  return {
    node,
    category,
    failureKind,
    diagnostic: failure.diagnostic ?? null,
    step,
    history: null,
  }
}

export function nodeFailed(
  fault: NodeFault,
  at: NodeFailed['at'],
  source: DurableEvidence,
): NodeFailed {
  const { node, category, failureKind, diagnostic, step } = fault
  return {
    kind: 'node-failed',
    node,
    category,
    failureKind,
    ...(diagnostic === null ? {} : { diagnostic }),
    step,
    at,
    source,
  }
}
