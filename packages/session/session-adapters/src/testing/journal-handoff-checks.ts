import { canonical } from './canonical.ts'
import type {
  AgentOperationId,
  DurableEvidence,
  Failure,
  HandoffReference,
  JournalCommit,
  SettlementRequest,
} from '@omne-harness/agent-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { revisionOf } from './journal-values.ts'
import { candidateOf, routeOf } from './journal-finishing.ts'
import type { HandoffRecord, MemoryExecution } from './journal.ts'
type Execution = MemoryExecution

export type HandoffApply = (revision: number, evidence: DurableEvidence) => void
export type CandidateRequest<P> = Extract<
  SettlementRequest<P>,
  { kind: 'establish-cancellation' | 'migrate-cancellation' | 'judge-cancellation' }
>
export type CustodyRequest<P> = Exclude<SettlementRequest<P>, CandidateRequest<P>>

// Handoff and custody checks of the memory Journal that read none of its state.

export const invalid = (field: string, reason: string): Failure => ({
  kind: 'invalid',
  field,
  reason,
})

export function copy<T>(value: T): T {
  return structuredClone(value)
}

export function sameEvidence(left: DurableEvidence | null, right: DurableEvidence | null): boolean {
  if (left === null || right === null) return left === right
  return (
    left.owner === right.owner &&
    left.record === right.record &&
    left.revision === right.revision &&
    left.digest === right.digest
  )
}

export function sameValue(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right)
}

export function handoffRecord(
  execution: Execution,
  reference: HandoffReference,
): HandoffRecord | undefined {
  return execution.handoffs.find(record => sameValue(record.handoff, reference))
}

export function undetermined(record: HandoffRecord): boolean {
  return record.history.kind === 'pending' && record.retirement === null
}

export function custodyTargetFailure<P>(
  execution: Execution,
  input: CustodyRequest<P>,
): Failure | undefined {
  const finishing = execution.finishing
  const known = (candidate: AgentOperationId, route: DurableEvidence): Failure | undefined =>
    candidateOf(finishing, candidate) === undefined
      ? invalid('candidate', 'not a candidate of this execution')
      : routeOf(finishing, route) === undefined
        ? invalid('route', 'not a route of this execution')
        : undefined
  switch (input.kind) {
    case 'record-card-reconciliation': {
      const passage = execution.checkpoint.passages.find(item => item.id === input.passage)
      const round =
        passage?.progress.kind === 'asked'
          ? passage.progress.rounds.find(item => item.round === input.round)
          : undefined
      if (passage === undefined || round === undefined)
        return invalid('round', 'not a card round of this execution')
      return known(input.candidate, input.route)
    }
    case 'record-legacy-return': {
      const passage = execution.checkpoint.passages.find(item => item.id === input.passage)
      if (passage === undefined || passage.position !== 'before_terminal')
        return invalid('passage', 'not a before-terminal passage of this execution')
      if (!sameEvidence(passage.input, input.request))
        return invalid('request', 'not the input record of the passage')
      return known(input.candidate, input.route)
    }
    case 'record-tool-association': {
      const effect = execution.effects.find(item => item.action === input.intent.action)
      if (
        effect === undefined ||
        effect.pending.kind !== 'tool' ||
        finishing.effectOperations.get(input.intent.action) !== input.intent.intent ||
        !sameValue(effect.pending.position, input.intent.position)
      )
        return invalid('intent', 'not a Tool intent of this execution')
      return undefined
    }
    default: {
      const _exhaustive: never = input
      return _exhaustive
    }
  }
}

export function preparedHandoff<P>(
  execution: Execution,
  input: JournalCommit<P>,
  request: Extract<NonNullable<JournalCommit<P>['handoff']>, { kind: 'prepare' }>['request'],
): Outcome<HandoffApply, Failure> {
  const reference = request.reference
  if (reference.execution !== execution.id)
    return fail(invalid('handoff', 'the request is not of this execution'))
  if (execution.checkpoint.currentHandoff !== null)
    return fail(invalid('checkpoint.currentHandoff', 'another H is still the current one'))
  if (!sameValue(input.checkpoint.currentHandoff, reference))
    return fail(invalid('checkpoint.currentHandoff', 'P points the checkpoint at its H'))
  if (request.predecessor !== input.expected)
    return fail(invalid('handoff', 'the predecessor of P is the expected revision'))
  if (handoffRecord(execution, reference) !== undefined)
    return fail(invalid('handoff', 'the H is already prepared'))
  const occupied = execution.handoffs.find(
    record =>
      record.request.kind === 'execution' &&
      sameValue(record.request.position, request.position) &&
      undetermined(record),
  )
  if (occupied !== undefined)
    return fail(invalid('handoff', 'the source position has an undetermined handoff'))
  if (request.predecessorHandoff !== null) {
    const predecessor = handoffRecord(execution, request.predecessorHandoff)
    if (predecessor === undefined || predecessor.retirement === null)
      return fail(invalid('handoff', 'the predecessor handoff is not retired'))
  }
  return succeed((_revision, evidence) => {
    execution.handoffs.push({
      handoff: copy(reference),
      request: copy(request),
      prepared: evidence,
      resolution: null,
      history: { kind: 'pending' },
      retirement: null,
    })
  })
}

export function retiredHandoff<P>(
  execution: Execution,
  input: JournalCommit<P>,
  change: Extract<NonNullable<JournalCommit<P>['handoff']>, { kind: 'retire' }>,
): Outcome<HandoffApply, Failure> {
  const request = change.excluded.request
  if (request.kind !== 'execution')
    return fail(invalid('handoff', 'a retire applies to an internal request'))
  const record = handoffRecord(execution, request.reference)
  if (record === undefined || !sameValue(record.request, request))
    return fail(invalid('handoff', 'the exclusion does not name the prepared request'))
  if (!undetermined(record))
    return fail(invalid('handoff', 'the H already has its history disposition'))
  if (record.resolution !== null && record.resolution.kind !== 'excluded')
    return fail(invalid('handoff', 'a recorded H is not retired'))
  if (!sameValue(execution.checkpoint.currentHandoff, request.reference))
    return fail(invalid('checkpoint.currentHandoff', 'the H is not the current one'))
  if (input.checkpoint.currentHandoff !== null)
    return fail(invalid('checkpoint.currentHandoff', 'a retire clears the pointer'))
  if (input.checkpoint.position !== request.position.node)
    return fail(invalid('checkpoint.position', 'a retire keeps the source node'))
  if (
    input.events.length > 0 ||
    input.effects.length > 0 ||
    input.replyAdmission !== null ||
    input.caller.kind !== 'none'
  )
    return fail(invalid('handoff', 'a retire carries no event, effect, admission or caller'))
  return succeed(revision => {
    record.resolution = copy(change.excluded)
    record.history = { kind: 'not-applicable' }
    record.retirement = {
      operation: input.operation,
      revision: revisionOf(revision),
      reason: copy(change.reason),
    }
  })
}
