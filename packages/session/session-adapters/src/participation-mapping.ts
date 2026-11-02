// AD-01: the Session side of a joint commit, translated into the Agent failure the Journal answers.
// One table for every participation the Journal provider derives: the four caller commits and the
// read-only checks of open, attach, submit and tryFinish (session-adapters SPEC AD-01).
import type { AgentOperationId, Failure } from '@omne-harness/agent-contract'
import type { SessionAccessDecision, SessionFailure } from '@omne-harness/session-contract'

/** The Journal method a participation belongs to. */
export type ParticipationMethod =
  | 'open'
  | 'attach'
  | 'submit'
  | 'tryFinish'
  | 'commit'
  | 'recordResult'

/**
 * A Session failure of the participation of `method`, as the Agent failure of the Journal call.
 * Failures of the Session's own dependencies stay `unavailable`; they are never a business answer.
 */
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
    // PA-01 items 1 and 3: a conflict of the source or grant check is denied, not changed.
    case 'open':
    case 'attach':
      return { kind: 'denied', action: method }
    // PA-01 item 2: an input Session did not admit is denied; another destination is terminal.
    case 'submit':
      return failure.kind === 'denied' ? { kind: 'denied', action: 'submit' } : { kind: 'terminal' }
    // PA-02: pending inputs, a cancel under another control or another terminal are changed.
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
      // A completion of a result whose Run ended conflicts with the result's own record.
      return method === 'recordResult' && command === 'completeConsumption'
        ? { kind: 'conflict', operation }
        : { kind: 'changed' }
    case 'changed':
      return { kind: 'changed' }
    default:
      return { kind: 'unsupported' }
  }
}

/**
 * The access decision of a derived Session participation (P6): a refusal is the Agent's `denied`
 * and an unavailable check is `unavailable`; neither writes nor opens a storage generation.
 */
export function participationAccessFailure(
  decision: Exclude<SessionAccessDecision, { kind: 'allowed' }>,
  action: string,
): Failure {
  return decision.kind === 'denied'
    ? { kind: 'denied', action }
    : { kind: 'unavailable', owner: 'session-access', diagnostic: action }
}
