// The pure deciders of a checkpointed call's wait (P06, P07): the plan of a suspension, the
// suspend commit that opens the wait, the attachment of its registration, and the duty that parks
// the queue entry. Each reads one call-domain snapshot and one command; nothing here reads a port.
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  decodeToolOperationId,
  type Adoption,
  type DurableEvidence,
  type ToolFailure,
  type ToolOperationId,
  type ToolStartRecord,
  type ToolState,
  type ToolTiming,
  type ToolWaitId,
  type WaitIntent,
  type WaitRecord,
  type WaitState,
} from '@omne-harness/tool-contract'
import type { Checkpoint, SuspensionRecord, ToolTask } from '@omne-harness/tool-contract/provider'
import { invalid, judgeEvidenceField } from './boundary.ts'
import { digestOf, mintEvidence } from './evidence.ts'
import type { RecordTaskCommand } from './ledger-environment-release.ts'
import {
  operationRecord,
  put,
  recall,
  reply,
  type Decision,
  type Mint,
  type Snapshot,
} from './ledger-decider.ts'
import {
  commonOf,
  gate,
  nextState,
  wrongPhase,
  type StateBody,
  type WriteCommand,
} from './ledger-start.ts'
import {
  taskKey,
  type CallRecord,
  type FactEventRecord,
  type LedgerWrite,
  type OperationReceipt,
  type WaitLedgerRecord,
} from './ledger-store.ts'

type AskIntent = Extract<WaitIntent, { kind: 'ask' }>
type SavedWait<B extends ContentBlock> = FactEventRecord<B> &
  Readonly<{ fact: Readonly<{ kind: 'wait'; value: AskIntent }> }>

function same(left: unknown, right: unknown): boolean {
  return digestOf(left) === digestOf(right)
}

/**
 * The operation of the registration of a wait (P06 ensure). It is derived from the wait alone, and
 * a call never uses a wait identity twice, so the call and the wait fix it: a resend after an
 * unknown answer uses it again, and a second wait of the same call gets another one.
 */
export function registrationOperation(wait: ToolWaitId): Outcome<ToolOperationId, ToolFailure> {
  const decoded = decodeToolOperationId(`${wait}/ensure`)
  return 'ok' in decoded ? decoded : invalid('wait', decoded.failure.reason)
}

/** The saved Ask wait fact that the segment of `start` ended with, or undefined. */
export function savedWaitOf<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  start: ToolStartRecord,
): SavedWait<B> | undefined {
  for (const saved of snapshot.facts.values())
    if (saved.fact.kind === 'wait' && saved.fact.value.kind === 'ask' && same(saved.start, start))
      return saved as SavedWait<B>
  return undefined
}

/** The same state at a new revision: a commit that changes the call's records but not its phase. */
function touched(record: CallRecord, revision: Mint['revision']): ToolState {
  const { source: _source, ...body } = record.state
  return nextState(record, body as StateBody, revision)
}

/** The call a suspension step addresses: gated, running in the foreground, on its own start. */
function runningCall<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  command: WriteCommand,
  start: ToolStartRecord,
): Outcome<CallRecord, ToolFailure> {
  const gated = gate(snapshot, command)
  if ('failure' in gated) return gated
  const record = gated.ok
  if (record.state.phase !== 'running') return wrongPhase(record.state.phase)
  // P06: a background call cannot open a wait.
  if (record.state.relation !== 'foreground') return invalid('call', 'background-cannot-wait')
  if (record.start === null || !same(record.start, start))
    return invalid('start', 'not-the-start-record')
  return succeed(record)
}

function receiptOf<K extends OperationReceipt['kind']>(
  receipt: OperationReceipt,
  kind: K,
): Extract<OperationReceipt, { kind: K }> {
  if (receipt.kind !== kind) throw new Error('recall checked the receipt kind')
  return receipt as Extract<OperationReceipt, { kind: K }>
}

export type PlanSuspensionCommand = WriteCommand &
  Readonly<{ start: ToolStartRecord; schema: Adoption }>

/**
 * Plans the suspension of the running segment (P07 planSuspension): the call runs in the
 * foreground on `start`, the segment ended with a saved Ask wait fact, and no suspension of this
 * start was planned before. One commit saves the suspension with its start and checkpoint schema,
 * and the `suspend` task that owes its checkpoint commit.
 */
export function decidePlanSuspension<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  command: PlanSuspensionCommand,
  mint: Mint,
): Decision<SuspensionRecord, B> {
  const known = recall(snapshot, command.operation, command.inputDigest, 'plan-suspension')
  if ('failure' in known) return reply(known)
  if (known.ok !== undefined)
    return reply(succeed(receiptOf(known.ok.receipt, 'plan-suspension').suspension))
  const running = runningCall(snapshot, command, command.start)
  if ('failure' in running) return reply(running)
  const record = running.ok
  if (savedWaitOf(snapshot, command.start) === undefined)
    return reply(invalid('start', 'no-saved-ask-wait'))
  for (const prior of snapshot.suspensions.values())
    if (same(prior.suspension.start, command.start))
      return reply(fail({ kind: 'conflict', operation: prior.suspension.operation }))
  const suspension: SuspensionRecord = {
    tenant: command.tenant,
    call: command.call,
    operation: command.operation,
    adoption: command.start.executor,
    inputDigest: command.inputDigest,
    start: command.start,
    schema: command.schema,
  }
  const state = touched(record, mint.revision)
  const task: ToolTask = {
    kind: 'suspend',
    operation: command.operation,
    state: 'pending',
    diagnostic: null,
    suspension,
  }
  return {
    kind: 'commit',
    writes: [
      put({ kind: 'call', call: { ...record, state } }),
      put({ kind: 'suspension', suspension: { suspension, checkpoint: null } }),
      put(operationRecord(command, { kind: 'plan-suspension', suspension }, mint)),
      put({ kind: 'task', task }),
    ],
    value: suspension,
  }
}

export type SuspendCommand = WriteCommand &
  Readonly<{
    suspension: SuspensionRecord
    checkpoint: Checkpoint
    /** The timing with the running segment closed, as the ledger sampled it before this decision. */
    timing: ToolTiming
  }>

/**
 * The responses this call accepted: only they may be named as consumed by a checkpoint. A wait
 * that a resume segment continued is closed, and its response stays named by the saved
 * `continued` fact of that segment.
 */
function acceptedResponses<B extends ContentBlock>(snapshot: Snapshot<B>): ReadonlySet<string> {
  const accepted = new Set<string>()
  for (const { record } of snapshot.waits.values())
    if (record.phase === 'responding') accepted.add(record.response.operation)
  for (const saved of snapshot.facts.values())
    if (saved.fact.kind === 'continued') accepted.add(saved.fact.response)
  return accepted
}

/** Why the checkpoint does not belong to the planned suspension and its wait, or nothing. */
function refuseCheckpoint<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  suspension: SuspensionRecord,
  checkpoint: Checkpoint,
  intent: AskIntent,
): Outcome<void, ToolFailure> {
  if (!same(checkpoint.schema, suspension.schema))
    return invalid('checkpoint.schema', 'not-the-planned-schema')
  if (!same(checkpoint.start, suspension.start))
    return invalid('checkpoint.start', 'not-the-planned-start')
  const accepted = acceptedResponses(snapshot)
  if (checkpoint.consumedResponses.some(response => !accepted.has(response)))
    return invalid('checkpoint.consumedResponses', 'not-accepted-by-this-call')
  if (!same(intent.resume, checkpoint.payload))
    return invalid('checkpoint.payload', 'not-the-resume-of-the-wait')
  if (snapshot.waits.has(intent.wait)) return invalid('wait', 'wait-identity-used')
  return succeed(undefined)
}

/**
 * Commits the suspension (P06 opening, P07 suspend): the call runs on the planned start, the
 * checkpoint is the binding's proof for the planned suspension, and the wait of the saved fact
 * resumes at that checkpoint. One commit writes `suspended` with the checkpoint and the closed
 * timing segment, the wait `opening`, the checkpoint on the suspension, the `wait-registration`
 * task that owes the registration, and the `suspend` task that owes the park of the queue entry. It
 * removes the task of the plan and the facts task: the segment's stream ended at its wait.
 */
export function decideSuspend<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  command: SuspendCommand,
  mint: Mint,
): Decision<ToolState, B> {
  const known = recall(snapshot, command.operation, command.inputDigest, 'suspend')
  if ('failure' in known) return reply(known)
  if (known.ok !== undefined) return reply(succeed(receiptOf(known.ok.receipt, 'suspend').state))
  const running = runningCall(snapshot, command, command.suspension.start)
  if ('failure' in running) return reply(running)
  const record = running.ok
  const planned = snapshot.suspensions.get(command.suspension.operation)
  if (planned === undefined || !same(planned.suspension, command.suspension))
    return reply(invalid('suspension', 'not-planned-for-this-call'))
  const saved = savedWaitOf(snapshot, planned.suspension.start)
  if (saved === undefined) return reply(invalid('suspension', 'no-saved-ask-wait'))
  const intent = saved.fact.value
  const refused = refuseCheckpoint(snapshot, planned.suspension, command.checkpoint, intent)
  if ('failure' in refused) return reply(refused)
  const registration = registrationOperation(intent.wait)
  if ('failure' in registration) return reply(registration)
  const { checkpoint } = command
  const body: StateBody = {
    ...commonOf(record.state),
    phase: 'suspended',
    checkpoint: checkpoint.payload,
    execution: { kind: 'suspended', checkpoint: checkpoint.payload },
    timing: command.timing,
    relation: 'foreground',
    wait: { kind: 'none' },
  }
  const state = nextState(record, body, mint.revision)
  const wait: WaitLedgerRecord = {
    record: { intent, phase: 'opening', operation: command.operation },
    fact: saved.evidence,
    suspension: planned.suspension.operation,
  }
  const pending = { state: 'pending', diagnostic: null } as const
  const writes: LedgerWrite<B>[] = [
    put({ kind: 'call', call: { ...record, state } }),
    put({ kind: 'suspension', suspension: { ...planned, checkpoint } }),
    put({ kind: 'wait', wait }),
    put(operationRecord(command, { kind: 'suspend', state }, mint)),
    { kind: 'delete', key: taskKey({ kind: 'suspend', operation: planned.suspension.operation }) },
    ...snapshot.tasks
      .filter(task => task.kind === 'facts')
      .map(task => ({ kind: 'delete', key: taskKey(task) }) as const),
    put({
      kind: 'task',
      task: {
        ...pending,
        kind: 'wait-registration',
        operation: registration.ok,
        wait: intent.wait,
        action: 'ensure',
        evidence: saved.evidence,
      },
    }),
    put({
      kind: 'task',
      task: {
        ...pending,
        kind: 'suspend',
        operation: command.operation,
        suspension: planned.suspension,
      },
    }),
  ]
  if (command.timing.kind === 'unknown')
    writes.push(
      put({
        kind: 'task',
        task: {
          kind: 'clock',
          operation: command.operation,
          state: 'blocked',
          diagnostic: command.timing.diagnostic,
          basis: saved.evidence,
        },
      }),
    )
  return { kind: 'commit', writes, value: state }
}

export type AttachRegistrationCommand = WriteCommand &
  Readonly<{ wait: ToolWaitId; registration: DurableEvidence }>

/**
 * Opens the wait on its registration (P06 attachRegistration): the call is suspended in the
 * foreground and the wait is `opening`. A closed wait is never opened again. One commit writes the
 * wait `open` with the registration, the same Ask wait state on the call, and removes the
 * `wait-registration` task of the ensure.
 */
export function decideAttachRegistration<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  command: AttachRegistrationCommand,
  mint: Mint,
): Decision<WaitRecord, B> {
  const known = recall(snapshot, command.operation, command.inputDigest, 'attach-registration')
  if ('failure' in known) return reply(known)
  if (known.ok !== undefined)
    return reply(succeed(receiptOf(known.ok.receipt, 'attach-registration').wait))
  const gated = gate(snapshot, command)
  if ('failure' in gated) return reply(gated)
  const record = gated.ok
  const found = snapshot.waits.get(command.wait)
  if (found === undefined) return reply(invalid('wait', 'unknown-wait'))
  const { intent } = found.record
  if (found.record.phase !== 'opening') return reply(invalid('wait', `phase:${found.record.phase}`))
  if (intent.kind !== 'ask') return reply(invalid('wait', 'not-an-ask'))
  if (record.state.phase !== 'suspended') return reply(wrongPhase(record.state.phase))
  const value: Extract<WaitState, { kind: 'ask' }> = {
    kind: 'ask',
    wait: intent.wait,
    registration: command.registration,
    resume: intent.resume,
    decision: null,
  }
  const opened: WaitRecord = { intent, phase: 'open', value }
  const body: StateBody = {
    ...commonOf(record.state),
    phase: 'suspended',
    checkpoint: record.state.checkpoint,
    relation: 'foreground',
    wait: value,
  }
  const state = nextState(record, body, mint.revision)
  return {
    kind: 'commit',
    writes: [
      put({ kind: 'call', call: { ...record, state } }),
      put({ kind: 'wait', wait: { ...found, record: opened } }),
      put(operationRecord(command, { kind: 'attach-registration', wait: opened }, mint)),
      ...snapshot.tasks
        .filter(
          task =>
            task.kind === 'wait-registration' &&
            task.action === 'ensure' &&
            task.wait === command.wait,
        )
        .map(task => ({ kind: 'delete', key: taskKey(task) }) as const),
    ],
    value: opened,
  }
}

/**
 * What the park duty `operation` asks now (P02): nothing when the duty is gone, a park when the
 * call is suspended and its wait has not reached `responding`, and otherwise only the closing of
 * the duty. A call whose decision was accepted before the park keeps its slot and resumes on it;
 * parking it then would release and retake the slot again and again.
 */
export type ParkDuty =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'park' | 'close'; record: CallRecord; holder: ToolOperationId }>

export function parkDutyOf<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  operation: ToolOperationId,
): ParkDuty {
  const record = snapshot.call
  const task = snapshot.tasks.find(
    candidate => candidate.kind === 'suspend' && candidate.operation === operation,
  )
  if (record === null || task?.kind !== 'suspend') return { kind: 'none' }
  const committed = snapshot.suspensions.get(task.suspension.operation)
  // The task of a plan names the plan's own operation; it owes the checkpoint, not a park.
  if (committed === undefined || committed.checkpoint === null) return { kind: 'none' }
  const waiting = [...snapshot.waits.values()].some(
    wait =>
      wait.suspension === task.suspension.operation &&
      (wait.record.phase === 'opening' || wait.record.phase === 'open'),
  )
  return {
    kind: record.state.phase === 'suspended' && waiting ? 'park' : 'close',
    record,
    // The slot to give up is the one the start of the suspended segment took.
    holder: task.suspension.start.operation,
  }
}

/** Removes the park duty `operation` after the queue domain answered it. */
export function decideClosePark<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  operation: ToolOperationId,
): Decision<Readonly<{ closed: boolean }>, B> {
  const open = snapshot.tasks.some(task => task.kind === 'suspend' && task.operation === operation)
  if (!open) return reply(succeed({ closed: false }))
  return {
    kind: 'commit',
    writes: [{ kind: 'delete', key: taskKey({ kind: 'suspend', operation }) }],
    value: { closed: true },
  }
}

/**
 * Blocks the registration duty of a wait that the decision owner refused for good (P06). The duty
 * stays with its original identity and its refusal reason; nothing answers for the person, and
 * the wait stays as it is until its call ends. One commit marks the task and keeps the receipt.
 */
export function decideBlockRegistration<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  command: RecordTaskCommand,
  mint: Mint,
): Decision<DurableEvidence, B> {
  const known = recall(snapshot, command.operation, command.inputDigest, 'record-task')
  if ('failure' in known) return reply(known)
  if (known.ok?.receipt.kind === 'record-task') return reply(succeed(known.ok.receipt.evidence))
  const record = snapshot.call
  if (record === null) return reply(invalid('call', 'unknown-call'))
  const task = snapshot.tasks.find(item => same(item, command.task))
  if (task?.kind !== 'wait-registration' || task.state === 'blocked')
    return reply(invalid('task', 'pending-registration-required'))
  const { resolution } = command
  if (
    typeof resolution !== 'object' ||
    resolution === null ||
    Reflect.get(resolution, 'kind') !== 'blocked' ||
    typeof Reflect.get(resolution, 'reason') !== 'string' ||
    Reflect.get(resolution, 'reason') === '' ||
    Object.keys(resolution).length !== 2
  )
    return reply(invalid('resolution', 'blocked-with-reason-required'))
  const reason = Reflect.get(resolution, 'reason') as string
  const evidence = mintEvidence(
    'operation',
    { tenant: record.tenant, call: record.call, operation: command.operation },
    mint.revision,
    { task, resolution },
  )
  return {
    kind: 'commit',
    writes: [
      put({ kind: 'task', task: { ...task, state: 'blocked', diagnostic: reason } }),
      put(operationRecord(command, { kind: 'record-task', evidence }, mint)),
      put({ kind: 'call', call: { ...record, state: touched(record, mint.revision) } }),
    ],
    value: evidence,
  }
}

/**
 * 完成一次等待失效（P06 invalidate，契约「recordTask(done) 核这个对端回执」）：待办是调用已收场后的
 * `wait-registration{action:'invalidate'}`，回执是决策方对原失效操作的回执（invalidate 的答复，或
 * inspectOperation 认回的 committed）。同一笔提交删除失效待办并保存回执。失效不改调用的终局。
 */
export function decideCompleteInvalidation<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  command: RecordTaskCommand,
  mint: Mint,
): Decision<DurableEvidence, B> {
  const known = recall(snapshot, command.operation, command.inputDigest, 'record-task')
  if ('failure' in known) return reply(known)
  if (known.ok?.receipt.kind === 'record-task') return reply(succeed(known.ok.receipt.evidence))
  const record = snapshot.call
  if (record === null) return reply(invalid('call', 'unknown-call'))
  if (record.state.phase !== 'settled') return reply(wrongPhase(record.state.phase))
  const task = snapshot.tasks.find(item => same(item, command.task))
  if (task?.kind !== 'wait-registration' || task.action !== 'invalidate')
    return reply(invalid('task', 'pending-invalidation-required'))
  const { resolution } = command
  if (
    typeof resolution !== 'object' ||
    resolution === null ||
    Reflect.get(resolution, 'kind') !== 'done' ||
    Object.keys(resolution).length !== 2
  )
    return reply(invalid('resolution', 'done-with-evidence-required'))
  const receipt = judgeEvidenceField(Reflect.get(resolution, 'evidence'), 'resolution.evidence')
  if ('failure' in receipt) return reply(receipt)
  return {
    kind: 'commit',
    writes: [
      { kind: 'delete', key: taskKey(task) },
      put(operationRecord(command, { kind: 'record-task', evidence: receipt.ok }, mint)),
      put({ kind: 'call', call: { ...record, state: touched(record, mint.revision) } }),
    ],
    value: receipt.ok,
  }
}
