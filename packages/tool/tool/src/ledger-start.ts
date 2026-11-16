import { syntheticChannels } from './ledger-decider.ts'
import type { PreparedSynthetic, SyntheticDecision } from './ledger-result-preparation.ts'

import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  Adoption,
  ClockSegment,
  DurableEvidence,
  FixedToolRequest,
  QueuePosition,
  ToolCallId,
  ToolExecutionRef,
  ToolFailure,
  ToolOperationId,
  ToolRenderedResult,
  ToolRevision,
  ToolStartRecord,
  ToolState,
  ToolTerminal,
} from '@omne-harness/tool-contract'
import type {
  PreparationRecord,
  StartProgress,
  ToolTask,
} from '@omne-harness/tool-contract/provider'
import { invalid } from './boundary.ts'
import { mintEvidence, digestOf, sameFactValue } from './evidence.ts'
import {
  operationRecord,
  put,
  queueTask,
  recall,
  reply,
  settlementWrites,
  stateRevision,
  type Decision,
  type Mint,
  type Snapshot,
} from './ledger-decider.ts'
import {
  queueEntryKey,
  taskKey,
  type CallRecord,
  type LedgerDomain,
  type LedgerRead,
  type LedgerWrite,
  type OperationReceipt,
  type QueueEntryRecord,
  type ReleaseBasis,
  type StartRejection,
  type TenantId,
  CHECKPOINT_STATE_KEY,
  WAIT_REQUEST_KEY,
} from './ledger-store.ts'

export function queueKeyOf(request: FixedToolRequest): string {
  const { scope } = request
  return JSON.stringify([scope.owner, scope.key])
}

export type QueueSnapshot = Readonly<{
  domain: Extract<LedgerDomain, { kind: 'queue' }>
  revision: ToolRevision
  entries: ReadonlyMap<string, QueueEntryRecord>
  next: string
}>

const FIRST_ORDINAL = '1'

export function queueSnapshotOf(
  domain: Extract<LedgerDomain, { kind: 'queue' }>,
  read: Extract<LedgerRead, { kind: 'complete' }>,
): QueueSnapshot {
  const entries = new Map<string, QueueEntryRecord>()
  let next = FIRST_ORDINAL
  for (const record of read.records) {
    if (record.kind === 'queue-entry') entries.set(record.entry.call, record.entry)
    else if (record.kind === 'queue-counter') next = record.counter.next
    else throw new Error(`a ${record.kind} record does not belong to a queue domain`)
  }
  return { domain, revision: read.revision, entries, next }
}

function nextOrdinal(ordinal: string): string {
  return (BigInt(ordinal) + 1n).toString()
}

export function isEarlier(left: string, right: string): boolean {
  return BigInt(left) < BigInt(right)
}

function queueUnavailable(diagnostic: string): Outcome<never, ToolFailure> {
  return fail({ kind: 'unavailable', dependency: 'tool-queue', diagnostic })
}

function entryWrite(entry: QueueEntryRecord): LedgerWrite {
  return put({ kind: 'queue-entry', entry })
}

function recalledBy<T>(
  entry: QueueEntryRecord,
  operation: ToolOperationId,
  answer: T,
): Outcome<T, ToolFailure> {
  return entry.operation === operation ? succeed(answer) : fail({ kind: 'conflict', operation })
}

export function decideQueueOrder(
  snapshot: QueueSnapshot,
  command: Readonly<{
    call: ToolCallId
    operation: ToolOperationId
    tool: string
    limit: number | null
    scopeBudget: number | null
  }>,
): Decision<QueueEntryRecord> {
  const existing = snapshot.entries.get(command.call)
  if (existing !== undefined)
    return reply(
      existing.stage === 'preparing'
        ? succeed(existing)
        : recalledBy(existing, command.operation, existing),
    )
  const entry: QueueEntryRecord = {
    call: command.call,
    ordinal: snapshot.next,
    stage: 'preparing',
    operation: command.operation,
    tool: command.tool,
    limit: command.limit,
    scopeBudget: command.scopeBudget,
  }
  return {
    kind: 'commit',
    writes: [
      entryWrite(entry),
      put({ kind: 'queue-counter', counter: { next: nextOrdinal(snapshot.next) } }),
    ],
    value: entry,
  }
}

export function decideQueueReady(
  snapshot: QueueSnapshot,
  command: Readonly<{ call: ToolCallId; operation: ToolOperationId }>,
): Decision<QueueEntryRecord> {
  const existing = snapshot.entries.get(command.call)
  if (existing === undefined)
    return reply(queueUnavailable(`call ${command.call} has no entry in this queue`))
  if (existing.stage !== 'preparing')
    return reply(recalledBy(existing, command.operation, existing))
  const entry: QueueEntryRecord = { ...existing, stage: 'ready', operation: command.operation }
  return { kind: 'commit', writes: [entryWrite(entry)], value: entry }
}

export type HoldOutcome =
  | Readonly<{ kind: 'held'; entry: QueueEntryRecord }>
  | Readonly<{
      kind: 'waiting'
      entry: QueueEntryRecord
      ahead: number
      toolHeld: number
      held: number
    }>

function aheadOf(snapshot: QueueSnapshot, entry: QueueEntryRecord): number {
  let ahead = 0
  for (const other of snapshot.entries.values())
    if (
      (other.stage === 'preparing' || other.stage === 'ready') &&
      isEarlier(other.ordinal, entry.ordinal)
    )
      ahead += 1
  return ahead
}

function heldCount(snapshot: QueueSnapshot, tool: string | null): number {
  let held = 0
  for (const other of snapshot.entries.values())
    if (other.stage === 'held' && (tool === null || other.tool === tool)) held += 1
  return held
}

function belowLimit(count: number, limit: number | null): boolean {
  return limit === null || count < limit
}

export function decideQueueHold(
  snapshot: QueueSnapshot,
  command: Readonly<{ call: ToolCallId; operation: ToolOperationId; keep?: boolean }>,
): Decision<HoldOutcome> {
  const existing = snapshot.entries.get(command.call)
  if (existing === undefined)
    return reply(queueUnavailable(`call ${command.call} has no entry in this queue`))
  if (
    existing.stage === 'held' &&
    existing.operation !== command.operation &&
    command.keep === true
  ) {
    const entry: QueueEntryRecord = { ...existing, operation: command.operation }
    return { kind: 'commit', writes: [entryWrite(entry)], value: { kind: 'held', entry } }
  }
  if (existing.stage === 'held')
    return reply(recalledBy(existing, command.operation, { kind: 'held', entry: existing }))
  if (existing.stage === 'preparing')
    return reply(queueUnavailable(`call ${command.call} was not enqueued`))
  if (existing.stage === 'parked')
    return reply(queueUnavailable(`call ${command.call} is parked until its decision is accepted`))
  const ahead = aheadOf(snapshot, existing)
  const toolHeld = heldCount(snapshot, existing.tool)
  const held = heldCount(snapshot, null)
  if (ahead > 0 || !belowLimit(toolHeld, existing.limit) || !belowLimit(held, existing.scopeBudget))
    return reply(succeed({ kind: 'waiting', entry: existing, ahead, toolHeld, held }))
  const entry: QueueEntryRecord = { ...existing, stage: 'held', operation: command.operation }
  return { kind: 'commit', writes: [entryWrite(entry)], value: { kind: 'held', entry } }
}

export type ParkOutcome =
  | Readonly<{ kind: 'parked'; entry: QueueEntryRecord }>
  | Readonly<{ kind: 'not-parked'; reason: 'no-entry' | 'not-held' }>

export function decideQueuePark(
  snapshot: QueueSnapshot,
  command: Readonly<{ call: ToolCallId; operation: ToolOperationId; holder: ToolOperationId }>,
): Decision<ParkOutcome> {
  const existing = snapshot.entries.get(command.call)
  if (existing === undefined) return reply(succeed({ kind: 'not-parked', reason: 'no-entry' }))
  if (existing.stage === 'parked' && existing.operation === command.operation)
    return reply(succeed({ kind: 'parked', entry: existing }))
  if (existing.stage !== 'held' || existing.operation !== command.holder)
    return reply(succeed({ kind: 'not-parked', reason: 'not-held' }))
  const entry: QueueEntryRecord = { ...existing, stage: 'parked', operation: command.operation }
  return { kind: 'commit', writes: [entryWrite(entry)], value: { kind: 'parked', entry } }
}

export type RequeueOutcome =
  | Readonly<{ kind: 'requeued'; entry: QueueEntryRecord }>
  | Readonly<{ kind: 'kept'; entry: QueueEntryRecord }>

export function decideQueueRequeue(
  snapshot: QueueSnapshot,
  command: Readonly<{ call: ToolCallId; operation: ToolOperationId }>,
): Decision<RequeueOutcome> {
  const existing = snapshot.entries.get(command.call)
  if (existing === undefined)
    return reply(queueUnavailable(`call ${command.call} has no entry in this queue`))
  if (existing.stage === 'held') return reply(succeed({ kind: 'kept', entry: existing }))
  if (existing.stage === 'ready' && existing.operation === command.operation)
    return reply(succeed({ kind: 'requeued', entry: existing }))
  if (existing.stage !== 'parked')
    return reply(queueUnavailable(`call ${command.call} is ${existing.stage}, not parked`))
  const entry: QueueEntryRecord = {
    ...existing,
    stage: 'ready',
    ordinal: snapshot.next,
    operation: command.operation,
  }
  return {
    kind: 'commit',
    writes: [
      entryWrite(entry),
      put({ kind: 'queue-counter', counter: { next: nextOrdinal(snapshot.next) } }),
    ],
    value: { kind: 'requeued', entry },
  }
}

export function releaseBasisOf(snapshot: Snapshot): ReleaseBasis | null {
  const record = snapshot.call
  if (record === null) return null
  if (record.startRejection !== null)
    return { kind: 'pre-start-rejection', exclusion: record.startRejection.exclusion }
  const rejected = ledgerRejectedResult(snapshot)
  if (rejected !== null) return { kind: 'ledger-rejected', result: rejected }
  if (record.state.phase === 'settled' && record.state.execution.kind === 'suspended')
    return suspendedExclusionOf(snapshot, record.state.execution.checkpoint)
  if (record.state.phase === 'settled' && record.state.execution.kind === 'lost')
    return { kind: 'lost-continuity', continuity: record.state.execution.evidence }
  if (
    record.state.phase !== 'settled' ||
    record.state.execution.kind !== 'ended' ||
    record.start === null
  )
    return null
  const result = snapshot.results.get(record.state.result)
  if (result === undefined || result.custody.kind !== 'execution') return null
  const proof = record.state.execution.evidence
  const saved = [...snapshot.facts.values()].find(
    saved => digestOf(saved.evidence) === digestOf(proof),
  )
  if (
    saved === undefined ||
    saved.fact.kind !== 'final' ||
    digestOf(saved.start) !== digestOf(record.start) ||
    digestOf(record.execution) !== digestOf(record.start.execution) ||
    digestOf(result.custody.final) !== digestOf(proof) ||
    !sameFactValue(result.custody.finalValue, saved.value) ||
    digestOf(result.terminal) !== digestOf(saved.fact.terminal) ||
    digestOf(result.effect) !== digestOf(saved.fact.effect)
  )
    return null
  return { kind: 'physical-end', proof }
}

function ledgerRejectedResult(snapshot: Snapshot): DurableEvidence | null {
  const record = snapshot.call
  if (record === null || record.start !== null || record.state.phase !== 'settled') return null
  const result = snapshot.results.get(record.state.result)
  if (result === undefined) return null
  const settled = snapshot.operations.get(result.settledBy)
  return settled?.receipt.kind === 'ledger-rejected' ? result.source : null
}

function suspendedExclusionOf(
  snapshot: Snapshot,
  checkpoint: DurableEvidence,
): ReleaseBasis | null {
  for (const { checkpoint: committed } of snapshot.suspensions.values())
    if (committed !== null && digestOf(committed.payload) === digestOf(checkpoint))
      return { kind: 'suspended-exclusion', checkpoint, exclusion: committed.exclusion }
  return null
}

export function decideQueueRelease(
  snapshot: QueueSnapshot,
  calls: readonly ToolCallId[],
): Decision<readonly ToolCallId[]> {
  const deleted = calls.filter(call => snapshot.entries.has(call))
  if (deleted.length === 0) return reply(succeed([]))
  return {
    kind: 'commit',
    writes: deleted.map(call => ({ kind: 'delete', key: queueEntryKey(call) })),
    value: deleted,
  }
}

export type WriteCommand = Readonly<{
  tenant: TenantId
  call: ToolCallId
  operation: ToolOperationId
  expected: ToolRevision
  inputDigest: string
}>

export function gate(snapshot: Snapshot, command: WriteCommand): Outcome<CallRecord, ToolFailure> {
  if (snapshot.call === null) return invalid('call', 'unknown-call')
  if (stateRevision(snapshot) !== command.expected)
    return fail({ kind: 'stale-revision', current: stateRevision(snapshot) })
  return succeed(snapshot.call)
}

export function wrongPhase(phase: ToolState['phase']): Outcome<never, ToolFailure> {
  return invalid('call', `phase:${phase}`)
}

export function deleteTasks(snapshot: Snapshot, kinds: readonly ToolTask['kind'][]): LedgerWrite[] {
  return snapshot.tasks
    .filter(task => kinds.includes(task.kind))
    .map(task => ({ kind: 'delete', key: taskKey(task) }))
}

export function dropSuspensionContent(snapshot: Snapshot): LedgerWrite[] {
  const writes: LedgerWrite[] = []
  if (snapshot.waitRequest !== null) writes.push({ kind: 'delete', key: WAIT_REQUEST_KEY })
  if (snapshot.checkpointState !== null) writes.push({ kind: 'delete', key: CHECKPOINT_STATE_KEY })
  return writes
}

export type CommonState = Pick<
  ToolState,
  | 'call'
  | 'revision'
  | 'foreground'
  | 'effect'
  | 'execution'
  | 'timing'
  | 'queue'
  | 'controls'
  | 'delivery'
  | 'supplements'
>

export type StateBody = ToolState extends infer S
  ? S extends ToolState
    ? Omit<S, 'source'>
    : never
  : never

export function commonOf(state: ToolState): CommonState {
  const { call, revision, foreground, effect, execution, timing, queue, controls, delivery } = state
  return {
    call,
    revision,
    foreground,
    effect,
    execution,
    timing,
    queue,
    controls,
    delivery,
    supplements: state.supplements,
  }
}

export function nextState(record: CallRecord, body: StateBody, revision: ToolRevision): ToolState {
  const place = { tenant: record.tenant, call: record.call }
  const next: StateBody = { ...body, revision }
  return { ...next, source: mintEvidence('state', place, revision, next) }
}

type PendingPhase = 'accepted' | 'preparing' | 'queued' | 'starting'

function pendingState(
  record: CallRecord,
  phase: PendingPhase,
  changes: Partial<CommonState>,
  revision: ToolRevision,
): ToolState {
  const body: StateBody = {
    ...commonOf(record.state),
    ...changes,
    phase,
    wait: { kind: 'none' },
    relation: record.state.relation,
  }
  return nextState(record, body, revision)
}

export type PlanPreparationCommand = WriteCommand &
  Readonly<{
    request: FixedToolRequest
    environmentAdoption: Adoption
    entry: QueueEntryRecord
    key: string
  }>

export function refusePlan(
  record: CallRecord,
  command: Pick<PlanPreparationCommand, 'request'>,
  requestDigest: (request: FixedToolRequest) => string,
): Outcome<void, ToolFailure> {
  if (record.state.phase !== 'accepted') return wrongPhase(record.state.phase)
  if (requestDigest(command.request) !== requestDigest(record.request))
    return invalid('request', 'not-the-fixed-request')
  return succeed(undefined)
}

export function decidePlanPreparation(
  snapshot: Snapshot,
  command: PlanPreparationCommand,
  requestDigest: (request: FixedToolRequest) => string,
  mint: Mint,
): Decision<PreparationRecord> {
  const known = recall(snapshot, command.operation, command.inputDigest, 'plan-preparation')
  if ('failure' in known) return reply(known)
  if (known.ok !== undefined) return reply(succeed(preparationOf(known.ok.receipt)))
  const gated = gate(snapshot, command)
  if ('failure' in gated) return reply(gated)
  const record = gated.ok
  const refused = refusePlan(record, command, requestDigest)
  if ('failure' in refused) return reply(refused)
  const { tenant, call, operation } = command
  const preparation: PreparationRecord = {
    tenant,
    call,
    operation,
    adoption: command.environmentAdoption,
    inputDigest: command.inputDigest,
    purpose: 'initial',
  }
  const queue: QueuePosition = {
    kind: 'waiting',
    key: command.key,
    ordinal: command.entry.ordinal,
  }
  const state = pendingState(record, 'preparing', { queue }, mint.revision)
  const task: ToolTask = {
    kind: 'prepare',
    operation,
    state: 'pending',
    diagnostic: null,
    preparation,
  }
  return {
    kind: 'commit',
    writes: [
      put({
        kind: 'call',
        call: { ...record, state, preparations: [...record.preparations, preparation] },
      }),
      put(operationRecord(command, { kind: 'plan-preparation', preparation }, mint)),
      put({ kind: 'task', task }),
      ...deleteTasks(snapshot, ['queue']),
    ],
    value: preparation,
  }
}

function preparationOf(receipt: OperationReceipt): PreparationRecord {
  if (receipt.kind !== 'plan-preparation') throw new Error('recall checked the receipt kind')
  return receipt.preparation
}

export type PreparedCommand = WriteCommand &
  Readonly<{ preparation: PreparationRecord; resources: DurableEvidence }>

export function decidePrepared(
  snapshot: Snapshot,
  command: PreparedCommand,
  preparationDigest: (preparation: PreparationRecord) => string,
  mint: Mint,
): Decision<ToolState> {
  const known = recall(snapshot, command.operation, command.inputDigest, 'prepared')
  if ('failure' in known) return reply(known)
  if (known.ok !== undefined) return reply(succeed(stateOf(known.ok.receipt)))
  const gated = gate(snapshot, command)
  if ('failure' in gated) return reply(gated)
  const record = gated.ok
  const planned = record.preparations.find(
    candidate => candidate.operation === command.preparation.operation,
  )
  if (
    planned === undefined ||
    preparationDigest(planned) !== preparationDigest(command.preparation)
  )
    return reply(invalid('preparation', 'not-planned-for-this-call'))
  if (planned.purpose === 'resume') return decideResumePrepared(snapshot, command, record, mint)
  if (record.state.phase !== 'preparing') return reply(wrongPhase(record.state.phase))
  if (record.environment !== null) return reply(invalid('call', 'already-prepared'))
  const state = pendingState(record, 'preparing', {}, mint.revision)
  const environment = { preparation: planned.operation, resources: command.resources }
  return {
    kind: 'commit',
    writes: [
      put({ kind: 'call', call: { ...record, state, environment } }),
      put(operationRecord(command, { kind: 'prepared', state }, mint)),
      ...deleteTasks(snapshot, ['prepare']),
      put({ kind: 'task', task: queueTask(command.operation, state.source) }),
    ],
    value: state,
  }
}

function decideResumePrepared(
  snapshot: Snapshot,
  command: PreparedCommand,
  record: CallRecord,
  mint: Mint,
): Decision<ToolState> {
  const current = record.state
  if (current.phase !== 'suspended') return reply(wrongPhase(current.phase))
  if (record.preparations.at(-1)?.operation !== command.preparation.operation)
    return reply(invalid('preparation', 'not-the-current-preparation'))
  const body: StateBody = {
    ...commonOf(current),
    phase: 'suspended',
    checkpoint: current.checkpoint,
    relation: 'foreground',
    wait: current.wait,
  }
  const state = nextState(record, body, mint.revision)
  const environment = { preparation: command.preparation.operation, resources: command.resources }
  return {
    kind: 'commit',
    writes: [
      put({ kind: 'call', call: { ...record, state, environment } }),
      put(operationRecord(command, { kind: 'prepared', state }, mint)),
      ...deleteTasks(snapshot, ['prepare']),
    ],
    value: state,
  }
}

function stateOf(receipt: OperationReceipt): ToolState {
  if (!('state' in receipt)) throw new Error('recall checked the receipt kind')
  return receipt.state
}

export function refuseEnqueue(record: CallRecord): Outcome<void, ToolFailure> {
  if (record.state.phase !== 'preparing') return wrongPhase(record.state.phase)
  if (record.environment === null) return invalid('call', 'not-prepared')
  return succeed(undefined)
}

export type EnqueueCommand = WriteCommand & Readonly<{ entry: QueueEntryRecord }>

export function decideEnqueue(
  snapshot: Snapshot,
  command: EnqueueCommand,
  mint: Mint,
): Decision<ToolState> {
  const known = recall(snapshot, command.operation, command.inputDigest, 'enqueue')
  if ('failure' in known) return reply(known)
  if (known.ok !== undefined) return reply(succeed(stateOf(known.ok.receipt)))
  const gated = gate(snapshot, command)
  if ('failure' in gated) return reply(gated)
  const record = gated.ok
  const refused = refuseEnqueue(record)
  if ('failure' in refused) return reply(refused)
  const state = pendingState(record, 'queued', {}, mint.revision)
  return {
    kind: 'commit',
    writes: [
      put({ kind: 'call', call: { ...record, state } }),
      put(operationRecord(command, { kind: 'enqueue', state }, mint)),
      ...deleteTasks(snapshot, ['queue']),
      put({ kind: 'task', task: queueTask(command.operation, state.source) }),
    ],
    value: state,
  }
}

export function refuseStart(record: CallRecord): Outcome<void, ToolFailure> {
  if (record.startRejection !== null) return invalid('call', 'start-rejected')
  if (record.state.phase !== 'queued') return wrongPhase(record.state.phase)
  if (record.request.availability.kind !== 'available') return invalid('call', 'not-available')
  return succeed(undefined)
}

export type PrepareStartCommand = WriteCommand &
  Readonly<{ hold: HoldOutcome; execution: ToolExecutionRef }>

export type StartIntent = Readonly<{
  state: ToolState
  start: Extract<ToolStartRecord, { kind: 'start' }>
}>

export function waitingInQueue(hold: Extract<HoldOutcome, { kind: 'waiting' }>): ToolFailure {
  const { entry, ahead, toolHeld, held } = hold
  const limit = entry.limit === null ? 'no tool limit' : `tool limit ${entry.limit}`
  const budget =
    entry.scopeBudget === null ? 'no scope budget' : `scope budget ${entry.scopeBudget}`
  return {
    kind: 'unavailable',
    dependency: 'tool-queue',
    diagnostic: `call ${entry.call} waits at ordinal ${entry.ordinal}: ${ahead} ahead, ${toolHeld} held of this tool (${limit}), ${held} held in the scope (${budget})`,
  }
}

export function decidePrepareStart(
  snapshot: Snapshot,
  command: PrepareStartCommand,
  mint: Mint,
): Decision<StartIntent> {
  const known = recall(snapshot, command.operation, command.inputDigest, 'prepare-start')
  if ('failure' in known) return reply(known)
  if (known.ok !== undefined) return reply(succeed(intentOf(known.ok.receipt)))
  const gated = gate(snapshot, command)
  if ('failure' in gated) return reply(gated)
  const record = gated.ok
  const refused = refuseStart(record)
  if ('failure' in refused) return reply(refused)
  if (record.request.availability.kind !== 'available') throw new Error('refuseStart checked')
  if (command.hold.kind === 'waiting') return reply(fail(waitingInQueue(command.hold)))
  const { operation } = command
  const start = {
    kind: 'start',
    operation,
    executor: record.request.availability.executor,
    execution: command.execution,
  } as const
  const queue: QueuePosition = {
    kind: 'held',
    key: queueKeyOf(record.request),
    ordinal: command.hold.entry.ordinal,
  }
  const state = pendingState(
    record,
    'starting',
    { queue, execution: { kind: 'starting', start: operation } },
    mint.revision,
  )
  const task: ToolTask = { kind: 'start', operation, state: 'pending', diagnostic: null, start }
  return {
    kind: 'commit',
    writes: [
      put({ kind: 'call', call: { ...record, state, start } }),
      put(operationRecord(command, { kind: 'prepare-start', state, start }, mint)),
      ...deleteTasks(snapshot, ['queue']),
      put({ kind: 'task', task }),
    ],
    value: { state, start },
  }
}

function intentOf(receipt: OperationReceipt): StartIntent {
  if (receipt.kind !== 'prepare-start') throw new Error('recall checked the receipt kind')
  return { state: receipt.state, start: receipt.start }
}

export type TerminalText<B extends ContentBlock> = (
  terminal: Extract<ToolTerminal, { kind: 'unavailable' | 'failed' }>,
) => Outcome<ToolRenderedResult<B>, ToolFailure>

export type ClosedWaitText<B extends ContentBlock> = (
  closedResult: string,
) => Outcome<ToolRenderedResult<B>, ToolFailure>

function rejectedState(
  record: CallRecord,
  version: Extract<ToolState, { phase: 'settled' }>['result'],
  terminal: Extract<ToolTerminal, { kind: 'unavailable' | 'failed' }>,
  delivery: NonNullable<ToolState['delivery']>,
  release: DurableEvidence,
  revision: ToolRevision,
): ToolState {
  const current = commonOf(record.state)
  const queue: QueuePosition =
    current.queue.kind === 'none'
      ? current.queue
      : {
          kind: 'released',
          key: current.queue.key,
          ordinal: current.queue.ordinal,
          evidence: release,
        }
  const shared = {
    ...current,
    effect: { kind: 'not-started' },
    execution: { kind: 'not-started' },
    timing: { kind: 'closed', accumulatedMs: current.timing.accumulatedMs },
    queue,
    delivery,
    wait: { kind: 'none' },
    phase: 'settled',
    result: version,
    terminal,
  } as const
  const body: StateBody =
    record.state.relation === 'background'
      ? { ...shared, relation: 'background' }
      : { ...shared, relation: 'foreground', foreground: { kind: 'final', result: version } }
  return nextState(record, body, revision)
}

function rejectionWrites(
  snapshot: Snapshot,
  record: CallRecord,
  command: WriteCommand,
  rejection: StartRejection,
  prepared: PreparedSynthetic | null,
  mint: Mint,
): SyntheticDecision<ToolState> {
  const terminal = { kind: 'unavailable', reason: rejection.reason } as const
  return unstartedWrites(snapshot, record, command, terminal, rejection, prepared, mint)
}

function unstartedWrites(
  snapshot: Snapshot,
  record: CallRecord,
  command: WriteCommand,
  terminal: Extract<ToolTerminal, { kind: 'unavailable' | 'failed' }>,
  rejection: StartRejection | null,
  prepared: PreparedSynthetic | null,
  mint: Mint,
): SyntheticDecision<ToolState> {
  const made = syntheticChannels(command, { terminal, consumer: record.request.consumer }, prepared)
  if ('kind' in made) return made
  if ('failure' in made) return reply(made)
  const settledReply = settlementWrites(
    snapshot,
    command,
    record.request.consumer,
    terminal,
    made.ok,
    mint,
  )
  if ('failure' in settledReply) return reply(settledReply)
  const settled = settledReply.ok
  const { version, delivery, record: result } = settled.version
  const release = rejection?.exclusion ?? result.source
  const state = rejectedState(record, version, terminal, delivery, release, mint.revision)
  const queue: LedgerWrite[] =
    record.request.availability.kind === 'available'
      ? [put({ kind: 'task', task: queueTask(command.operation, state.source) })]
      : []
  const startRejection = rejection ?? record.startRejection
  return {
    kind: 'commit',
    writes: [
      put({ kind: 'call', call: { ...record, state, startRejection } }),
      ...settled.writes,
      ...deleteTasks(snapshot, ['queue', 'prepare', 'start']),
      ...dropSuspensionContent(snapshot),
      ...queue,
    ],
    value: state,
  }
}

const PENDING_PHASES: readonly ToolState['phase'][] = ['accepted', 'preparing', 'queued']

export type RejectPendingCommand = WriteCommand & StartRejection

export function decideRejectPending(
  snapshot: Snapshot,
  command: RejectPendingCommand,
  prepared: PreparedSynthetic | null,
  mint: Mint,
): SyntheticDecision<ToolState> {
  const known = recall(snapshot, command.operation, command.inputDigest, 'reject-pending')
  if ('failure' in known) return reply(known)
  if (known.ok !== undefined) return reply(succeed(stateOf(known.ok.receipt)))
  const gated = gate(snapshot, command)
  if ('failure' in gated) return reply(gated)
  const record = gated.ok
  if (record.start !== null) return reply(invalid('call', 'has-start-record'))
  if (!PENDING_PHASES.includes(record.state.phase)) return reply(wrongPhase(record.state.phase))
  const rejection = { reason: command.reason, exclusion: command.exclusion }
  return withReceipt(
    rejectionWrites(snapshot, record, command, rejection, prepared, mint),
    command,
    'reject-pending',
    mint,
  )
}

export const LEDGER_REJECTED_DIAGNOSTIC = 'ledger-store rejected: '

export type LedgerRejectedCommand = WriteCommand & Readonly<{ reason: string }>

export function decideLedgerRejected(
  snapshot: Snapshot,
  command: LedgerRejectedCommand,
  prepared: PreparedSynthetic | null,
  mint: Mint,
): SyntheticDecision<ToolState> {
  const known = recall(snapshot, command.operation, command.inputDigest, 'ledger-rejected')
  if ('failure' in known) return reply(known)
  if (known.ok !== undefined) return reply(succeed(stateOf(known.ok.receipt)))
  const gated = gate(snapshot, command)
  if ('failure' in gated) return reply(gated)
  const record = gated.ok
  if (record.start !== null) return reply(invalid('call', 'has-start-record'))
  if (!PENDING_PHASES.includes(record.state.phase)) return reply(wrongPhase(record.state.phase))
  const terminal = {
    kind: 'failed',
    cause: 'runtime-lost',
    diagnostic: `${LEDGER_REJECTED_DIAGNOSTIC}${command.reason}`,
  } as const
  return withReceipt(
    unstartedWrites(snapshot, record, command, terminal, null, prepared, mint),
    command,
    'ledger-rejected',
    mint,
  )
}

function withReceipt(
  decided: SyntheticDecision<ToolState>,
  command: WriteCommand,
  kind: 'reject-pending' | 'ledger-rejected' | 'record-start',
  mint: Mint,
): SyntheticDecision<ToolState> {
  if (decided.kind !== 'commit') return decided
  const receipt = operationRecord(command, { kind, state: decided.value }, mint)
  return { ...decided, writes: [...decided.writes, put(receipt)] }
}

export type RecordStartCommand = WriteCommand &
  Readonly<{
    invocation: ToolStartRecord
    outcome: StartProgress
    segment: ClockSegment | null
    execution: ToolExecutionRef
  }>

function startingCall(
  snapshot: Snapshot,
  command: RecordStartCommand,
  recordDigest: (record: ToolStartRecord) => string,
): Outcome<CallRecord & Readonly<{ start: NonNullable<CallRecord['start']> }>, ToolFailure> {
  const gated = gate(snapshot, command)
  if ('failure' in gated) return gated
  const { start } = gated.ok
  if (start === null || recordDigest(start) !== recordDigest(command.invocation))
    return invalid('invocation', 'not-the-start-record')
  if (gated.ok.state.phase !== 'starting') return wrongPhase(gated.ok.state.phase)
  return succeed({ ...gated.ok, start })
}

export function decideRecordStart(
  snapshot: Snapshot,
  command: RecordStartCommand,
  prepared: PreparedSynthetic | null,
  recordDigest: (record: ToolStartRecord) => string,
  mint: Mint,
): SyntheticDecision<ToolState> {
  const known = recall(snapshot, command.operation, command.inputDigest, 'record-start')
  if ('failure' in known) return reply(known)
  if (known.ok !== undefined) return reply(succeed(stateOf(known.ok.receipt)))
  const gated = startingCall(snapshot, command, recordDigest)
  if ('failure' in gated) return reply(gated)
  const record = gated.ok
  const { outcome } = command
  switch (outcome.kind) {
    case 'started':
      return started(snapshot, record, command, mint)
    case 'rejected': {
      const rejection = { reason: outcome.reason, exclusion: outcome.exclusion }
      const decided = rejectionWrites(snapshot, record, command, rejection, prepared, mint)
      return withReceipt(decided, command, 'record-start', mint)
    }
    case 'not-started':
      return kept(
        record,
        command,
        { execution: { kind: 'starting', start: record.start.operation } },
        mint,
      )
    case 'unknown':
      return kept(
        record,
        command,
        { execution: { kind: 'unknown', start: record.start.operation } },
        mint,
      )
    default: {
      const exhaustive: never = outcome
      return exhaustive
    }
  }
}

function started(
  snapshot: Snapshot,
  record: CallRecord,
  command: RecordStartCommand,
  mint: Mint,
): Decision<ToolState> {
  const current = commonOf(record.state)
  const { relation } = record.state
  if (relation === 'foreground' && command.segment === null)
    return reply(invalid('segment', 'missing-for-foreground'))
  const timing: ToolState['timing'] =
    relation === 'foreground' && command.segment !== null
      ? { kind: 'running', accumulatedMs: current.timing.accumulatedMs, segment: command.segment }
      : { kind: 'paused', accumulatedMs: current.timing.accumulatedMs }
  const body: StateBody = {
    ...current,
    phase: 'running',
    instance: command.execution.instance,
    execution: { kind: 'live', start: command.invocation.operation },
    timing,
    relation,
    wait: { kind: 'none' },
  }
  const state = nextState(record, body, mint.revision)
  return {
    kind: 'commit',
    writes: [
      put({ kind: 'call', call: { ...record, state, execution: command.execution } }),
      put(operationRecord(command, { kind: 'record-start', state }, mint)),
      ...deleteTasks(snapshot, ['start']),
      put({
        kind: 'task',
        task: {
          kind: 'facts',
          operation: command.invocation.operation,
          state: 'pending',
          diagnostic: null,
          basis: mintEvidence(
            'fact-reader',
            { tenant: record.tenant, call: record.call, start: command.invocation.operation },
            mint.revision,
            command.invocation,
          ),
        },
      }),
    ],
    value: state,
  }
}

function kept(
  record: CallRecord,
  command: RecordStartCommand,
  changes: Partial<CommonState>,
  mint: Mint,
): Decision<ToolState> {
  const state = pendingState(record, 'starting', changes, mint.revision)
  return {
    kind: 'commit',
    writes: [
      put({ kind: 'call', call: { ...record, state } }),
      put(operationRecord(command, { kind: 'record-start', state }, mint)),
    ],
    value: state,
  }
}

export function decideCloseQueueTask(
  snapshot: Snapshot,
  operation: ToolOperationId,
): Decision<Readonly<{ closed: boolean }>> {
  const key = taskKey({ kind: 'queue', operation })
  const open = snapshot.tasks.some(task => task.kind === 'queue' && task.operation === operation)
  if (!open) return reply(succeed({ closed: false }))
  return { kind: 'commit', writes: [{ kind: 'delete', key }], value: { closed: true } }
}
