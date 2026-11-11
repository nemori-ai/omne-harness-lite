// The pure deciders of a checkpointed call after a person answered its wait (P06, P07): the
// acceptance of the decision, the resume that takes the slot again, and the closing of the wait
// at the resume segment's `continued` fact. Each reads one call-domain snapshot and one command;
// nothing here reads a port. The step names follow verification/models/SuspendedSlots.tla:
// `decideAcceptDecision` is `Answer`, `decidePrepareResume` is `Resume`.
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  decodeToolOperationId,
  type Adoption,
  type DecisionValue,
  type DurableEvidence,
  type QueuePosition,
  type ResponseRecord,
  type ToolExecutionRef,
  type FixedToolRequest,
  type ToolFailure,
  type ToolOperationId,
  type ToolStartRecord,
  type ToolState,
  type ToolWaitId,
  type WaitState,
} from '@omne-harness/tool-contract'
import type { PreparationRecord, ToolTask } from '@omne-harness/tool-contract/provider'
import { invalid } from './boundary.ts'
import { digestOf, mintEvidence } from './evidence.ts'
import {
  operationRecord,
  put,
  queueTask,
  recall,
  reply,
  type Decision,
  type Mint,
  type Snapshot,
} from './ledger-decider.ts'
import {
  commonOf,
  deleteTasks,
  gate,
  nextState,
  queueKeyOf,
  waitingInQueue,
  wrongPhase,
  type HoldOutcome,
  type StateBody,
  type WriteCommand,
} from './ledger-start.ts'
import type { CallRecord, OperationReceipt, TenantId, WaitLedgerRecord } from './ledger-store.ts'

type Resume = Extract<ToolStartRecord, { kind: 'resume' }>

function same(left: unknown, right: unknown): boolean {
  return digestOf(left) === digestOf(right)
}

function receiptOf<K extends OperationReceipt['kind']>(
  receipt: OperationReceipt,
  kind: K,
): Extract<OperationReceipt, { kind: K }> {
  if (receipt.kind !== kind) throw new Error('recall checked the receipt kind')
  return receipt as Extract<OperationReceipt, { kind: K }>
}

export type AcceptDecisionCommand = Readonly<{
  tenant: TenantId
  call: CallRecord['call']
  operation: WriteCommand['operation']
  inputDigest: string
  wait: ToolWaitId
  /** The decision evidence the decision owner reported for the wait (`inspect`). */
  decision: DurableEvidence
  /** The decision the owner resolved from that evidence (`resolve`) before this decision. */
  value: DecisionValue
}>

/**
 * Why the wait of the call cannot take a decision now, or the wait. The call must be suspended on
 * that very Ask wait, and the wait must be `open`. A call that settled first, a closed wait, or a
 * wait that took a decision already is refused: P06 orders the cancellation and the answer on the
 * call record, so a decision that comes after the cancellation is not an answer.
 */
export function refuseDecision<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  wait: ToolWaitId,
): Outcome<Readonly<{ record: CallRecord; found: WaitLedgerRecord }>, ToolFailure> {
  const record = snapshot.call
  if (record === null) return invalid('call', 'unknown-call')
  if (record.state.phase !== 'suspended') return wrongPhase(record.state.phase)
  const found = snapshot.waits.get(wait)
  if (found === undefined) return invalid('wait', 'unknown-wait')
  if (found.record.phase !== 'open') return invalid('wait', `phase:${found.record.phase}`)
  if (record.state.wait.kind !== 'ask' || record.state.wait.wait !== wait)
    return invalid('wait', 'not-the-current-wait')
  return succeed({ record, found })
}

/**
 * Accepts the decision of an open Ask wait (P06 acceptDecision, the model's `Answer`). One commit
 * fixes the ResponseRecord on the wait, moves the wait to `responding`, writes the decision
 * evidence into the call's wait state, and adds the `queue` task that owes the queue domain the
 * requeue and the hold of the resume. The same commit plans the environment of the resume
 * segment: the resume is a new execution of the executor, so it prepares its own environment from
 * the binding of the segment that suspended, under `<wait>/resume/prepare`, in whatever process
 * runs it. The ResponseRecord names the start of the segment that suspended and the decision as
 * the owner resolved it. A resend of the same operation recalls
 * the wait state; any other acceptance of the same wait is refused, so one wait has one answer.
 */
export function decideAcceptDecision<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  command: AcceptDecisionCommand,
  mint: Mint,
): Decision<WaitState, B> {
  const known = recall(snapshot, command.operation, command.inputDigest, 'accept-decision')
  if ('failure' in known) return reply(known)
  if (known.ok !== undefined)
    return reply(succeed(receiptOf(known.ok.receipt, 'accept-decision').wait))
  const refused = refuseDecision(snapshot, command.wait)
  if ('failure' in refused) return reply(refused)
  const { record, found } = refused.ok
  const suspension = snapshot.suspensions.get(found.suspension)
  if (suspension === undefined || record.state.phase !== 'suspended')
    return reply(invalid('wait', 'no-suspension'))
  const { intent } = found.record
  if (record.state.wait.kind !== 'ask') return reply(invalid('wait', 'not-an-ask'))
  const preparation = resumePreparation(record, command)
  if ('failure' in preparation) return reply(preparation)
  const value: WaitState = { ...record.state.wait, decision: command.decision }
  const response: ResponseRecord = {
    tenant: command.tenant,
    call: command.call,
    operation: command.operation,
    adoption: intent.schemas.contract,
    inputDigest: command.inputDigest,
    start: suspension.suspension.start,
    wait: command.wait,
    response: { kind: 'decision', value: command.value, source: command.decision },
  }
  const receipt = mintEvidence(
    'operation',
    { tenant: command.tenant, call: command.call, operation: command.operation },
    mint.revision,
    response,
  )
  const body: StateBody = {
    ...commonOf(record.state),
    phase: 'suspended',
    checkpoint: record.state.checkpoint,
    relation: 'foreground',
    wait: value,
  }
  const state = nextState(record, body, mint.revision)
  const responding: WaitLedgerRecord = {
    ...found,
    record: {
      intent,
      phase: 'responding',
      value,
      response,
      progress: { kind: 'accepted', receipt },
    },
  }
  return {
    kind: 'commit',
    writes: [
      put({
        kind: 'call',
        call: { ...record, state, preparations: [...record.preparations, preparation.ok] },
      }),
      put({ kind: 'wait', wait: responding }),
      put(operationRecord(command, { kind: 'accept-decision', wait: value }, mint)),
      put({ kind: 'task', task: queueTask(command.operation, state.source) }),
      put({ kind: 'task', task: prepareTask(preparation.ok) }),
    ],
    value,
  }
}

/**
 * The preparation of the resume segment: the environment binding of the segment that suspended,
 * the fixed request and its environment adoption, planned again under the wait's own operation.
 */
function resumePreparation(
  record: CallRecord,
  command: AcceptDecisionCommand,
): Outcome<PreparationRecord, ToolFailure> {
  const bound = record.preparations.at(-1)
  if (bound === undefined) return invalid('call', 'no-preparation')
  const operation = resumePreparationOperation(record.preparations, command.wait)
  if ('failure' in operation) return operation
  return succeed({
    tenant: command.tenant,
    call: command.call,
    operation: operation.ok,
    adoption: bound.adoption,
    inputDigest: digestOf({ wait: command.wait, adoption: bound.adoption, request: bound.request }),
    purpose: 'resume',
    request: bound.request,
  })
}

/**
 * The operation of the next preparation of the resume segment of `wait`: `<wait>/resume/prepare`
 * at the acceptance, then `<wait>/resume/prepare/<k>` for the k-th, when an earlier one was lost.
 */
export function resumePreparationOperation(
  preparations: readonly PreparationRecord[],
  wait: ToolWaitId,
): Outcome<ToolOperationId, ToolFailure> {
  const base = `${wait}/resume/prepare`
  const earlier = preparations.filter(
    preparation =>
      preparation.purpose === 'resume' &&
      (preparation.operation === base || preparation.operation.startsWith(`${base}/`)),
  ).length
  const operation = decodeToolOperationId(earlier === 0 ? base : `${base}/${earlier + 1}`)
  return 'failure' in operation ? invalid('operation', operation.failure.reason) : operation
}

export type ResumePlanCommand = WriteCommand &
  Readonly<{ request: FixedToolRequest; environmentAdoption: Adoption }>

/**
 * Plans the resume segment's environment again (P03 planPreparation, purpose `resume`): the
 * preparation planned for it answered `lost`, so the segment is prepared under the next resume
 * preparation of the accepted wait. The call stays suspended; the `queue` task of the acceptance
 * still owes the requeue. One commit records the preparation, drops the call's environment and
 * replaces the `prepare` task.
 */
export function decideResumePlan<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  command: ResumePlanCommand,
  mint: Mint,
): Decision<PreparationRecord, B> {
  const known = recall(snapshot, command.operation, command.inputDigest, 'plan-preparation')
  if ('failure' in known) return reply(known)
  if (known.ok !== undefined)
    return reply(succeed(receiptOf(known.ok.receipt, 'plan-preparation').preparation))
  const gated = gate(snapshot, command)
  if ('failure' in gated) return reply(gated)
  const record = gated.ok
  const suspended = record.state
  if (suspended.phase !== 'suspended') return reply(wrongPhase(suspended.phase))
  const current = record.preparations.at(-1)
  if (current?.purpose !== 'resume') return reply(invalid('call', 'no-resume-planned'))
  if (!same(command.request, record.request))
    return reply(invalid('request', 'not-the-fixed-request'))
  if (!same(command.environmentAdoption, current.adoption))
    return reply(invalid('environmentAdoption', 'not-the-bound-adoption'))
  const accepted = [...snapshot.waits.values()].find(wait => wait.record.phase === 'responding')
  if (accepted === undefined) return reply(invalid('call', 'no-accepted-decision'))
  const next = resumePreparationOperation(record.preparations, accepted.record.intent.wait)
  if ('failure' in next) return reply(next)
  if (next.ok !== command.operation)
    return reply(invalid('operation', 'not-the-next-resume-preparation'))
  const preparation: PreparationRecord = {
    tenant: command.tenant,
    call: command.call,
    operation: command.operation,
    adoption: current.adoption,
    inputDigest: command.inputDigest,
    purpose: 'resume',
    request: record.request,
  }
  const body: StateBody = {
    ...commonOf(suspended),
    phase: 'suspended',
    checkpoint: suspended.checkpoint,
    relation: 'foreground',
    wait: suspended.wait,
  }
  const state = nextState(record, body, mint.revision)
  return {
    kind: 'commit',
    writes: [
      put({
        kind: 'call',
        call: {
          ...record,
          state,
          environment: null,
          preparations: [...record.preparations, preparation],
        },
      }),
      put(operationRecord(command, { kind: 'plan-preparation', preparation }, mint)),
      ...deleteTasks(snapshot, ['prepare']),
      put({ kind: 'task', task: prepareTask(preparation) }),
    ],
    value: preparation,
  }
}

function prepareTask(preparation: PreparationRecord): ToolTask {
  return {
    kind: 'prepare',
    operation: preparation.operation,
    state: 'pending',
    diagnostic: null,
    preparation,
  }
}

/** The responding wait whose decision resumes at `checkpoint`, or undefined. */
function respondingAt<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  checkpoint: DurableEvidence,
): WaitLedgerRecord | undefined {
  for (const wait of snapshot.waits.values())
    if (wait.record.phase === 'responding' && same(wait.record.intent.resume, checkpoint))
      return wait
  return undefined
}

/**
 * Why the call cannot prepare a resume from `checkpoint` now, or nothing (P07 prepareResume): the
 * call is suspended on that checkpoint, never rejected, its `suspend` committed that checkpoint with
 * the exclusion of the execution that suspended, and the wait that resumes there took a decision.
 * The ledger asks this before the queue steps, so a refused resume moves no entry; the decider asks
 * it again under the transaction's snapshot.
 */
export function refuseResume<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  record: CallRecord,
  checkpoint: DurableEvidence,
): Outcome<WaitLedgerRecord, ToolFailure> {
  if (record.startRejection !== null) return invalid('call', 'start-rejected')
  if (record.state.phase !== 'suspended') return wrongPhase(record.state.phase)
  if (record.request.availability.kind !== 'available') return invalid('call', 'not-available')
  if (!same(record.state.checkpoint, checkpoint))
    return invalid('checkpoint', 'not-the-current-checkpoint')
  const committed = [...snapshot.suspensions.values()].some(
    entry => entry.checkpoint !== null && same(entry.checkpoint.payload, checkpoint),
  )
  if (!committed) return invalid('checkpoint', 'not-committed-by-suspend')
  const wait = respondingAt(snapshot, checkpoint)
  if (wait === undefined) return invalid('wait', 'no-accepted-decision')
  const prepared = record.preparations.at(-1)
  if (prepared?.purpose !== 'resume' || record.environment?.preparation !== prepared.operation)
    return invalid('call', 'resume-not-prepared')
  return succeed(wait)
}

export type PrepareResumeCommand = WriteCommand &
  Readonly<{
    checkpoint: DurableEvidence
    /** The queue domain's answer to the hold of this resume, given before this decision. */
    hold: HoldOutcome
    execution: ToolExecutionRef
  }>

export type ResumeIntent = Readonly<{ state: ToolState; start: Resume }>

/**
 * Saves the unique successor of a checkpoint (P07 prepareResume, the model's `Resume`): the call is
 * suspended on that checkpoint with an accepted decision, and the queue domain gave it a slot in
 * this very step. One commit writes the resume record as the call's current start, `starting` with
 * the held position, the `start` task, and removes the `queue` task. The checkpoint is consumed: a
 * later resume of it finds the call no longer suspended.
 */
export function decidePrepareResume<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  command: PrepareResumeCommand,
  mint: Mint,
): Decision<ResumeIntent, B> {
  const known = recall(snapshot, command.operation, command.inputDigest, 'prepare-resume')
  if ('failure' in known) return reply(known)
  if (known.ok !== undefined) {
    const receipt = receiptOf(known.ok.receipt, 'prepare-resume')
    return reply(succeed({ state: receipt.state, start: receipt.start }))
  }
  const gated = gate(snapshot, command)
  if ('failure' in gated) return reply(gated)
  const record = gated.ok
  const refused = refuseResume(snapshot, record, command.checkpoint)
  if ('failure' in refused) return reply(refused)
  if (command.hold.kind === 'waiting') return reply(fail(waitingInQueue(command.hold)))
  if (record.request.availability.kind !== 'available') throw new Error('refuseResume checked')
  const start: Resume = {
    kind: 'resume',
    operation: command.operation,
    // The executor the call was admitted with: a resume never takes a newer implementation.
    executor: record.start?.executor ?? record.request.availability.executor,
    execution: command.execution,
    checkpoint: command.checkpoint,
  }
  const queue: QueuePosition = {
    kind: 'held',
    key: queueKeyOf(record.request),
    ordinal: command.hold.entry.ordinal,
  }
  const body: StateBody = {
    ...commonOf(record.state),
    queue,
    execution: { kind: 'starting', start: command.operation },
    phase: 'starting',
    wait: { kind: 'none' },
    relation: 'foreground',
  }
  const state = nextState(record, body, mint.revision)
  const task: ToolTask = {
    kind: 'start',
    operation: command.operation,
    state: 'pending',
    diagnostic: null,
    start,
  }
  return {
    kind: 'commit',
    writes: [
      put({ kind: 'call', call: { ...record, state, start } }),
      put(operationRecord(command, { kind: 'prepare-resume', state, start }, mint)),
      ...deleteTasks(snapshot, ['queue']),
      put({ kind: 'task', task }),
    ],
    value: { state, start },
  }
}

export type CloseWaitCommand = WriteCommand &
  Readonly<{ wait: ToolWaitId; continuation: DurableEvidence }>

/**
 * Closes a responding wait at the `continued` fact of its resume segment (P06 closeWait): the call
 * runs that resume, the wait's response progressed to `continued` with `continuation`, and the
 * saved fact behind that evidence is the resume's own `continued` fact for this wait and response.
 * One commit closes the wait with cause `continued` and touches the call state. The timing segment
 * of the resume began when its start was recorded, at the segment's real start.
 */
export function decideCloseWait<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  command: CloseWaitCommand,
  mint: Mint,
): Decision<ToolState, B> {
  const known = recall(snapshot, command.operation, command.inputDigest, 'close-wait')
  if ('failure' in known) return reply(known)
  if (known.ok !== undefined) return reply(succeed(receiptOf(known.ok.receipt, 'close-wait').state))
  const gated = gate(snapshot, command)
  if ('failure' in gated) return reply(gated)
  const record = gated.ok
  if (record.state.phase !== 'running') return reply(wrongPhase(record.state.phase))
  const found = snapshot.waits.get(command.wait)
  if (found === undefined) return reply(invalid('wait', 'unknown-wait'))
  const { record: wait } = found
  if (wait.phase !== 'responding') return reply(invalid('wait', `phase:${wait.phase}`))
  if (wait.progress.kind !== 'continued' || !same(wait.progress.receipt, command.continuation))
    return reply(invalid('continuation', 'not-the-continued-fact'))
  const saved = [...snapshot.facts.values()].find(fact => same(fact.evidence, command.continuation))
  if (
    saved?.fact.kind !== 'continued' ||
    record.start === null ||
    !same(saved.start, record.start) ||
    saved.fact.wait !== command.wait ||
    saved.fact.response !== wait.response.operation
  )
    return reply(invalid('continuation', 'not-the-continued-fact'))
  const { source: _source, ...body } = record.state
  const state = nextState(record, body as StateBody, mint.revision)
  return {
    kind: 'commit',
    writes: [
      put({ kind: 'call', call: { ...record, state } }),
      put({
        kind: 'wait',
        wait: {
          ...found,
          record: {
            intent: wait.intent,
            phase: 'closed',
            cause: 'continued',
            evidence: command.continuation,
          },
        },
      }),
      put(operationRecord(command, { kind: 'close-wait', state }, mint)),
    ],
    value: state,
  }
}
