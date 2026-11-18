import type { AgentOperationId, Failure } from '@omne-harness/agent-contract'
import type { SessionAccessDecision, SessionFailure } from '@omne-harness/session-contract'

export type ParticipationMethod =
  | 'open'
  | 'attach'
  | 'submit'
  | 'tryFinish'
  | 'commit'
  | 'recordResult'

export function participationFailure(
  method: ParticipationMethod,
  failure: SessionFailure,
  operation: AgentOperationId,
  command?: string,
): Failure {
  if (failure.kind === 'unavailable') return failure
  if (failure.kind === 'quarantined')
    return { kind: 'unavailable', owner: 'session-history', diagnostic: failure.diagnostic }
  if (failure.kind === 'commit-unknown') return { kind: 'commit-unknown', operation }
  switch (method) {
    case 'open':
    case 'attach':
      return { kind: 'denied', action: method }
    case 'submit':
      return failure.kind === 'denied' ? { kind: 'denied', action: 'submit' } : { kind: 'terminal' }
    case 'tryFinish':
      return { kind: 'changed' }
    case 'commit':
    case 'recordResult':
      break
  }
  switch (failure.kind) {
    case 'denied':
      return { kind: 'denied', action: failure.action }
    case 'invalid':
      return { kind: 'invalid', field: failure.field, reason: failure.reason }
    case 'conflict':
      return { kind: 'conflict', operation }
    case 'archived':
    case 'terminal':
    case 'stale-advance':
      return method === 'recordResult' && command === 'completeConsumption'
        ? { kind: 'conflict', operation }
        : { kind: 'changed' }
    case 'changed':
      return { kind: 'changed' }
    default:
      return { kind: 'unsupported' }
  }
}

export function participationAccessFailure(
  decision: Exclude<SessionAccessDecision, { kind: 'allowed' }>,
  action: string,
): Failure {
  return decision.kind === 'denied'
    ? { kind: 'denied', action }
    : { kind: 'unavailable', owner: 'session-access', diagnostic: action }
}

export function participationMethodOf(method: string): ParticipationMethod | null {
  return method === 'open' ||
    method === 'attach' ||
    method === 'submit' ||
    method === 'tryFinish' ||
    method === 'commit' ||
    method === 'recordResult'
    ? method
    : null
}
