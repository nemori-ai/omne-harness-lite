import { canonical } from './canonical.ts'
import {
  acceptanceIn,
  type AcceptedInput,
  type AgentJournal,
  type AgentOperationId,
  type DurableEvidence,
  type ExecutionHandoff,
  type Failure,
  type HandoffReference,
  type InputId,
  type JournalCommit,
  type OriginalInputAcceptance,
  type SettlementRequest,
} from '@omne-harness/agent-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { revisionOf } from './journal-values.ts'
import { candidateOf, routeOf } from './journal-finishing.ts'
import type { HandoffRecord, MemoryExecution } from './journal.ts'
import { closedHandoffRecord, closedInput, inputRecord } from './journal-records.ts'
import type { ExecutionView } from '../journal/index.ts'
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
  table: Parameters<typeof closedHandoffRecord>[0],
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
    const predecessor = heldHandoff(table, execution, request.predecessorHandoff)
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

type CustodyInput<P> = Parameters<AgentJournal<P>['recordHandoff']>[0]
type CustodyAttempt = MemoryExecution['custodyAttempts'] extends Map<unknown, infer V> ? V : never
type CustodyChain = Exclude<ExecutionHandoff['custody'], null> | null

// A recordHandoff attempt, checked against the record of its H and the custody chain it extends.
export function validatedCustody<P>(
  execution: Execution,
  input: CustodyInput<P>,
  request: HandoffRecord['request'],
  chain: CustodyChain,
): Outcome<CustodyAttempt, Failure> {
  const reference = request.reference
  const record = handoffRecord(execution, reference)
  if (record === undefined || !sameValue(record.request, request))
    return fail(invalid('original', 'the request is not on the authoritative record'))
  if (record.resolution !== null && !sameValue(record.resolution, input.original))
    return fail({ kind: 'conflict', operation: input.operation })
  const attempt: CustodyAttempt = {
    handoff: copy(reference),
    original: copy(input.original),
    custody: input.custody === null ? null : copy(input.custody),
  }
  const custody = input.custody
  if (custody === null) {
    if (chain !== null && chain.root !== input.operation)
      return fail(invalid('operation', 'the H already has its custody root'))
    return succeed(attempt)
  }
  if (chain === null || custody.custodyRoot !== chain.root)
    return fail(invalid('operation', 'the custody root is not the root of this H'))
  const rootAttempt = execution.custodyAttempts.get(chain.root)
  if (rootAttempt === undefined || !sameValue(rootAttempt.original, input.original))
    return fail({ kind: 'conflict', operation: input.operation })
  const last = chain.chain.at(-1)
  if (last === undefined || last.operation !== custody.predecessor.operation)
    return fail(invalid('operation', 'the predecessor is not the last attempt'))
  if (last.state !== 'excluded')
    return fail(invalid('operation', 'the predecessor is not permanently excluded'))
  const excludedChain = chain.chain.map(item => item.operation)
  if (
    custody.priorExcluded.length !== excludedChain.length ||
    custody.priorExcluded.some(
      (item, index) =>
        item.operation !== excludedChain[index] ||
        item.predecessor !== (index === 0 ? null : excludedChain[index - 1]),
    )
  )
    return fail(invalid('operation', 'the exclusion chain is not the chain of the root'))
  return succeed(attempt)
}

// A handoff of the execution: the open record, else the closed item read back by its reference.
export function heldHandoff(
  table: Parameters<typeof closedHandoffRecord>[0],
  execution: Execution,
  reference: HandoffReference,
): HandoffRecord | undefined {
  return handoffRecord(execution, reference) ?? closedHandoffRecord(table, execution, reference)
}

// An accepted input by its id: the one the record holds, else the closed item. A write that
// recognizes the input must know it, so it reads the closed item back; another one peeks.
export function acceptedInput(
  table: Parameters<typeof closedHandoffRecord>[0],
  execution: Execution,
  input: InputId,
  lineage: 'new-input' | 'recognize-input',
): Readonly<{ value: AcceptedInput; revision: number }> | undefined {
  const held = execution.inputs.find(item => (item as AcceptedInput | undefined)?.id === input)
  if (held === undefined) {
    const closed = closedInput(table, execution.id, input, lineage === 'recognize-input')
    return closed && { value: inputRecord(closed, table.blobs), revision: closed.revision }
  }
  const revision = execution.inputRevisions.get(input)
  if (revision === undefined)
    throw new Error('session Journal defect: an accepted input has no revision')
  return { value: held, revision }
}

// The acceptance of one input by its identity: the handoff of its entry, open or closed.
export function inputAcceptanceOf(
  table: Parameters<typeof closedHandoffRecord>[0],
  execution: Execution,
  view: Pick<ExecutionView, 'inputs'>,
  input: InputId,
): OriginalInputAcceptance | null {
  const held = view.inputs.find(item => item.input === input)
  const entry = (held ?? closedInput(table, execution.id, input, true))?.entry
  if (entry === undefined) return null
  const record = heldHandoff(table, execution, {
    kind: 'input',
    execution: execution.id,
    entry,
    input,
  })
  return acceptanceIn(record === undefined ? [] : [record], input)
}
