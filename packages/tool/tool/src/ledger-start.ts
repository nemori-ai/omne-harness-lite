import { syntheticChannels } from './ledger-decider.ts'
import type { PreparedSynthetic, SyntheticDecision } from './ledger-result-preparation.ts'

// The pure deciders of the way from an accepted call to a recorded start (P02, P03, P04): the
// queue domain (order, readiness, head and slot, release) and the call domain (preparation plan
// and confirmation, enqueue, start intent, start record, first-start rejection). Each decision
// reads one domain snapshot and one command and answers a reply or a set of writes; the ledger
// sequences the two domains as docs/architecture.md describes. Nothing here reads a port.
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
} from './ledger-store.ts'

// ---------------------------------------------------------------------------------------------
// The queue domain
// ---------------------------------------------------------------------------------------------

/**
 * The FIFO key of a request within its tenant (P02): the scope owner, the scope key and the tool's
 * asset name. The tenant is part of the queue domain identity, so it is not in the key.
 */
export function queueKeyOf(request: FixedToolRequest): string {
  const { scope } = request
  return JSON.stringify([scope.owner, scope.key, request.availability.definition.name])
}

export type QueueSnapshot = Readonly<{
  domain: Extract<LedgerDomain, { kind: 'queue' }>
  revision: ToolRevision
  /** The entries by call: every call that holds a place in this queue. */
  entries: ReadonlyMap<string, QueueEntryRecord>
  /** The ordinal the next entry takes. */
  next: string
}>

/** The first ordinal of a queue is `1`. */
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

/** Whether `left` comes before `right` in the FIFO: ordinals are decimal counts, not texts. */
export function isEarlier(left: string, right: string): boolean {
  return BigInt(left) < BigInt(right)
}

function queueUnavailable(diagnostic: string): Outcome<never, ToolFailure> {
  return fail({ kind: 'unavailable', dependency: 'tool-queue', diagnostic })
}

function entryWrite(entry: QueueEntryRecord): LedgerWrite {
  return put({ kind: 'queue-entry', entry })
}

/**
 * The answer of a step on an entry that is past it: the operation that moved the entry recalls it,
 * another operation is a conflict (P01).
 */
function recalledBy<T>(
  entry: QueueEntryRecord,
  operation: ToolOperationId,
  answer: T,
): Outcome<T, ToolFailure> {
  return entry.operation === operation ? succeed(answer) : fail({ kind: 'conflict', operation })
}

/**
 * Gives the call its place in the order (admit, planPreparation). The entry is created once, at
 * the next ordinal, in the `preparing` stage. Whether the call may still take a place is not
 * this domain's to know: the ledger judges the call domain before this decision and asserts the
 * revision it judged in the commit that lands these writes (SPEC 22). An entry that is still
 * `preparing` is recalled by call: the two steps that create it, the admission and the plan, are
 * interchangeable, and this step never moves it. An entry that is past `preparing` was moved by
 * a later step, so only that step's own operation recalls it; another operation answers
 * `conflict`.
 */
export function decideQueueOrder(
  snapshot: QueueSnapshot,
  command: Readonly<{ call: ToolCallId; operation: ToolOperationId; limit: number | null }>,
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
    limit: command.limit,
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

/**
 * Makes the call eligible for the head (enqueue): a `preparing` entry becomes `ready`. An entry
 * already past that stage is recalled by the operation that moved it; another operation answers
 * `conflict`. A missing entry is not made up, because the order was assigned when the
 * preparation was planned.
 */
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

/** What the queue answers a start intent: the held entry, or why the call still waits. */
export type HoldOutcome =
  | Readonly<{ kind: 'held'; entry: QueueEntryRecord }>
  | Readonly<{
      kind: 'waiting'
      entry: QueueEntryRecord
      /** How many entries that do not hold a slot yet come before this one. */
      ahead: number
      /** How many entries hold a slot. */
      held: number
    }>

/**
 * Decides head and slot in one queue transaction (P02 prepareStart): the entry must be `ready`,
 * no earlier entry may still be `preparing` or `ready` (an earlier call that has not reached a
 * slot is not overtaken; an earlier call that holds one is not in the way), and the held entries
 * must be fewer than the concurrency the call fixed, null being no limit. A held entry is
 * recalled. Nothing is written when the call waits.
 */
export function decideQueueHold(
  snapshot: QueueSnapshot,
  command: Readonly<{ call: ToolCallId; operation: ToolOperationId }>,
): Decision<HoldOutcome> {
  const existing = snapshot.entries.get(command.call)
  if (existing === undefined)
    return reply(queueUnavailable(`call ${command.call} has no entry in this queue`))
  if (existing.stage === 'held')
    return reply(recalledBy(existing, command.operation, { kind: 'held', entry: existing }))
  if (existing.stage === 'preparing')
    return reply(queueUnavailable(`call ${command.call} was not enqueued`))
  let ahead = 0
  let held = 0
  for (const other of snapshot.entries.values()) {
    if (other.stage === 'held') held += 1
    else if (isEarlier(other.ordinal, existing.ordinal)) ahead += 1
  }
  if (ahead > 0 || (existing.limit !== null && held >= existing.limit))
    return reply(succeed({ kind: 'waiting', entry: existing, ahead, held }))
  const entry: QueueEntryRecord = { ...existing, stage: 'held', operation: command.operation }
  return { kind: 'commit', writes: [entryWrite(entry)], value: { kind: 'held', entry } }
}

/**
 * The basis a call domain holds for releasing its call's queue place, or null: this is the one
 * place that says what releases a place. A start rejection is one (the fence excluded the whole
 * invocation); a call that merely settled is not, because the logical end does not prove that the
 * place is free (P02). An ended execution also needs its exact original saved final and result.
 * The minimal failure terminal of a call that never started is one too (SPEC 23).
 */
export function releaseBasisOf(snapshot: Snapshot): ReleaseBasis | null {
  const record = snapshot.call
  if (record === null) return null
  if (record.startRejection !== null)
    return { kind: 'pre-start-rejection', exclusion: record.startRejection.exclusion }
  const rejected = ledgerRejectedResult(snapshot)
  if (rejected !== null) return { kind: 'ledger-rejected', result: rejected }
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

/**
 * The result evidence of the minimal failure terminal (SPEC 23), or null. The call holds no start
 * record, so nothing ever ran, and its result was settled by a committed `ledger-rejected`
 * operation of this call.
 */
function ledgerRejectedResult(snapshot: Snapshot): DurableEvidence | null {
  const record = snapshot.call
  if (record === null || record.start !== null || record.state.phase !== 'settled') return null
  const result = snapshot.results.get(record.state.result)
  if (result === undefined) return null
  const settled = snapshot.operations.get(result.settledBy)
  return settled?.receipt.kind === 'ledger-rejected' ? result.source : null
}

/**
 * Releases the places of the calls the caller names, in one commit: each entry is deleted and
 * nothing else is written, so the queue domain holds nothing for a released call. The caller
 * names only calls whose call domain holds a release basis (`releaseBasisOf`). A call without an
 * entry has nothing to release here: an entry that a step creates after this commit is kept out
 * by that step's assertion on the call domain, not by a record of this domain. The answer lists
 * the calls whose entry this commit deleted.
 */
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

// ---------------------------------------------------------------------------------------------
// The call domain
// ---------------------------------------------------------------------------------------------

/** The identity and the revision gate every write command carries (WriteContext). */
export type WriteCommand = Readonly<{
  tenant: TenantId
  call: ToolCallId
  operation: ToolOperationId
  expected: ToolRevision
  inputDigest: string
}>

/**
 * The call a write command addresses, after P01's gate: the call must exist and its state
 * revision must be the expected one. The gate comes after the recall, so a resend of a
 * committed operation answers its receipt whatever revision it names.
 */
function gate(snapshot: Snapshot, command: WriteCommand): Outcome<CallRecord, ToolFailure> {
  if (snapshot.call === null) return invalid('call', 'unknown-call')
  if (stateRevision(snapshot) !== command.expected)
    return fail({ kind: 'stale-revision', current: stateRevision(snapshot) })
  return succeed(snapshot.call)
}

/** A call that is not in one of the phases the command expects. */
export function wrongPhase(phase: ToolState['phase']): Outcome<never, ToolFailure> {
  return invalid('call', `phase:${phase}`)
}

/** The pending tasks of the kinds that a step of the way to a start replaces. */
function deleteTasks(snapshot: Snapshot, kinds: readonly ToolTask['kind'][]): LedgerWrite[] {
  return snapshot.tasks
    .filter(task => kinds.includes(task.kind))
    .map(task => ({ kind: 'delete', key: taskKey(task) }))
}

/** The fields every variant of ToolState shares; a transition changes some of them. */
type CommonState = Pick<
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

/** The body of a state before its evidence: one variant of ToolState without `source`. */
type StateBody = ToolState extends infer S
  ? S extends ToolState
    ? Omit<S, 'source'>
    : never
  : never

/** The common fields of the current state, which every transition starts from. */
function commonOf(state: ToolState): CommonState {
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

/** The next state: the body with the new revision and a fresh state evidence. */
function nextState(record: CallRecord, body: StateBody, revision: ToolRevision): ToolState {
  const place = { tenant: record.tenant, call: record.call }
  const next: StateBody = { ...body, revision }
  return { ...next, source: mintEvidence('state', place, revision, next) }
}

type PendingPhase = 'accepted' | 'preparing' | 'queued' | 'starting'

/** A state of a phase before the start: no wait, the relation unchanged, the given changes. */
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
    purpose: 'initial' | 'resume'
    /** The entry the queue domain gave the call before this decision. */
    entry: QueueEntryRecord
    key: string
  }>

/**
 * Why a preparation cannot be planned for the call now, or nothing. The ledger asks this before
 * it gives the call a queue entry, so a refused plan leaves no entry behind; the decider asks it
 * again under the transaction's snapshot.
 */
export function refusePlan(
  record: CallRecord,
  command: Pick<PlanPreparationCommand, 'request' | 'purpose'>,
  requestDigest: (request: FixedToolRequest) => string,
): Outcome<void, ToolFailure> {
  if (record.state.phase !== 'accepted') return wrongPhase(record.state.phase)
  if (command.purpose === 'resume')
    return fail({
      kind: 'unsupported',
      adoption: record.request.availability.definition.adoption,
      reason: 'a resume preparation needs a checkpointed executor (later increment)',
    })
  if (requestDigest(command.request) !== requestDigest(record.request))
    return invalid('request', 'not-the-fixed-request')
  return succeed(undefined)
}

/**
 * Plans the initial preparation (P03): the fixed request must be the admitted one, the call must
 * be `accepted`, and the resume purpose waits for checkpointed executors. One commit saves the
 * preparation record, the `prepare` task, the state `preparing` with the call's queue position,
 * and removes the task that carried the call to the queue.
 */
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
    request: record.request,
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

/**
 * Confirms the environment (P03 prepared): the preparation must be one this call planned, the
 * call must still be `preparing` without a confirmed environment. One commit records the
 * resources, removes the `prepare` task and writes the `queue` task that asks for the enqueue.
 */
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
  if (record.state.phase !== 'preparing') return reply(wrongPhase(record.state.phase))
  if (record.environment !== null) return reply(invalid('call', 'already-prepared'))
  const planned = record.preparations.find(
    candidate => candidate.operation === command.preparation.operation,
  )
  if (
    planned === undefined ||
    preparationDigest(planned) !== preparationDigest(command.preparation)
  )
    return reply(invalid('preparation', 'not-planned-for-this-call'))
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

function stateOf(receipt: OperationReceipt): ToolState {
  if (!('state' in receipt)) throw new Error('recall checked the receipt kind')
  return receipt.state
}

/** Why the call cannot be enqueued now, or nothing: it must be `preparing` with an environment. */
export function refuseEnqueue(record: CallRecord): Outcome<void, ToolFailure> {
  if (record.state.phase !== 'preparing') return wrongPhase(record.state.phase)
  if (record.environment === null) return invalid('call', 'not-prepared')
  return succeed(undefined)
}

export type EnqueueCommand = WriteCommand & Readonly<{ entry: QueueEntryRecord }>

/**
 * Records that the queue domain made the call ready (P02 enqueue): the call must be `preparing`
 * with a confirmed environment. One commit writes `queued` and the `queue` task that asks for
 * the start intent.
 */
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

/** Why the call cannot take a start intent now, or nothing (P02, P04). */
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

/** The answer of a start intent while the call waits for the head or a slot (P02). */
export function waitingInQueue(hold: Extract<HoldOutcome, { kind: 'waiting' }>): ToolFailure {
  const { entry, ahead, held } = hold
  const limit = entry.limit === null ? 'no limit' : `limit ${entry.limit}`
  return {
    kind: 'unavailable',
    dependency: 'tool-queue',
    diagnostic: `call ${entry.call} waits at ordinal ${entry.ordinal}: ${ahead} ahead, ${held} held, ${limit}`,
  }
}

/**
 * Saves the unique start intent (P02, P04): the call must be `queued`, never rejected, and the
 * queue domain must have given it the head and a slot in this very step. One commit writes the
 * start record, `starting` with the held position, the `start` task, and removes the queue task.
 */
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

/** The text factory of a terminal the ledger forms itself (dummy, first-start rejection). */
export type TerminalText<B extends ContentBlock> = (
  terminal: Extract<ToolTerminal, { kind: 'unavailable' | 'failed' }>,
) => Outcome<ToolRenderedResult<B>, ToolFailure>

/**
 * The settled state of a call that never started: the given logical terminal, nothing started,
 * the position released on `release` (the start exclusion, or the minimal terminal's result).
 */
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

/**
 * The writes of a first-start rejection (P04): the permanent rejection, the unavailable terminal
 * with `effect: not-started`, its delivery, the replacement account, and the release of the
 * queue position with the exclusion as its basis. The call domain settles first; the `queue`
 * task then asks the queue domain to drop the entry. A real tool always gets that task, even
 * when the state holds no position: an entry that the queue domain created before a crash
 * (planPreparation's second step) is dropped the same way.
 */
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

/**
 * The writes that settle a call that never started on a logical terminal: the terminal with
 * `effect: not-started`, its delivery, the replacement account, the release of the queue
 * position and the `queue` task that drops the entry. A start rejection releases on its
 * exclusion and is kept on the call; without one, the position is released on the terminal's
 * own result (the minimal failure terminal, SPEC 23).
 */
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
      ...queue,
    ],
    value: state,
  }
}

/** The pending phases a rejection without a start record applies to. */
const PENDING_PHASES: readonly ToolState['phase'][] = ['accepted', 'preparing', 'queued']

export type RejectPendingCommand = WriteCommand & StartRejection

/**
 * Rejects a call that never reached a start record (P04 rejectPending): the current host has
 * excluded the whole pending invocation. The call must be `accepted`, `preparing` or `queued`
 * and hold no start record; a call with a start record is rejected through recordStart.
 */
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

/** The diagnostic of the minimal failure terminal names the store's reason after this text. */
export const LEDGER_REJECTED_DIAGNOSTIC = 'ledger-store rejected: '

export type LedgerRejectedCommand = WriteCommand & Readonly<{ reason: string }>

/**
 * The minimal failure terminal (SPEC 23): the store rejected a commit of a step for good, and the
 * call never started (no start record, so nothing runs). The call settles `failed` with cause
 * `runtime-lost` and the store's reason, without raw output or result pages, and its queue
 * position is released on the terminal's result. A call with a start record is not settled here.
 */
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

/** Adds the operation receipt of a settlement decision to its writes. */
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
    /** The clock segment of a foreground start, begun by the ledger before this decision. */
    segment: ClockSegment | null
    /** The instance and generation that record the start: the write context's. */
    execution: ToolExecutionRef
  }>

/**
 * The call a recordStart addresses, after the revision gate: it holds exactly the start record
 * the command names, and it is still `starting`.
 */
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

/**
 * Records the outcome of the start fence for the call's start record (P04 recordStart):
 * `started` makes the call `running` with the live execution and the timing segment;
 * `rejected` settles it as unavailable with `effect: not-started` and releases the position;
 * `not-started` keeps the intent so the same identity may be started after a new permit;
 * `unknown` marks the execution unknown and keeps the task for reconciliation. Every outcome
 * commits an operation receipt, so a caller that records a non-final outcome and later a final
 * one must use a new operation for the second record.
 */
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
      // The exclusion is proven, so the start may be tried again under a new permit (P04).
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

/** The call is running: the live execution, the instance that recorded it, the timing segment. */
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

/** The outcome is recorded; the start record and its task stay for a later attempt or query. */
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

/**
 * Closes a cross-domain step: removes the `queue` task of `operation` after the queue domain
 * confirmed the transition. A task that is already gone was closed before.
 */
export function decideCloseQueueTask(
  snapshot: Snapshot,
  operation: ToolOperationId,
): Decision<Readonly<{ closed: boolean }>> {
  const key = taskKey({ kind: 'queue', operation })
  const open = snapshot.tasks.some(task => task.kind === 'queue' && task.operation === operation)
  if (!open) return reply(succeed({ closed: false }))
  return { kind: 'commit', writes: [{ kind: 'delete', key }], value: { closed: true } }
}
