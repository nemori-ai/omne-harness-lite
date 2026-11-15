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
  decision: DurableEvidence
  value: DecisionValue
}>

export function refuseDecision(
  snapshot: Snapshot,
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

export function decideAcceptDecision(
  snapshot: Snapshot,
  command: AcceptDecisionCommand,
  mint: Mint,
): Decision<WaitState> {
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
    inputDigest: digestOf({
      wait: command.wait,
      adoption: bound.adoption,
      request: record.request,
    }),
    purpose: 'resume',
  })
}

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

export function decideResumePlan(
  snapshot: Snapshot,
  command: ResumePlanCommand,
  mint: Mint,
): Decision<PreparationRecord> {
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

function respondingAt(
  snapshot: Snapshot,
  checkpoint: DurableEvidence,
): WaitLedgerRecord | undefined {
  for (const wait of snapshot.waits.values())
    if (wait.record.phase === 'responding' && same(wait.record.intent.resume, checkpoint))
      return wait
  return undefined
}

export function refuseResume(
  snapshot: Snapshot,
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
    hold: HoldOutcome
    execution: ToolExecutionRef
  }>

export type ResumeIntent = Readonly<{ state: ToolState; start: Resume }>

export function decidePrepareResume(
  snapshot: Snapshot,
  command: PrepareResumeCommand,
  mint: Mint,
): Decision<ResumeIntent> {
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

export function decideCloseWait(
  snapshot: Snapshot,
  command: CloseWaitCommand,
  mint: Mint,
): Decision<ToolState> {
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
