// The execution coordinator: the effects of the Loop for one execution, node by node, as the
// pseudocode of docs/architecture/loop-algorithm.md "正常路径伪代码" groups them (runExecution,
// settle, runIter, prepareRequest, callModel, admitMessage). Each node is one handler that runs the
// node's effect and names its outcome; where the node goes next is never decided here but looked up
// in the transition table of nodes.ts. E4 uses a pure recovery route (J5), and delegates input
// boundaries and iteration decisions to the evaluator. I8 uses the evaluator's Next.
//
// #502 1.2 is the skeleton of the normal path. Its temporary choices, each also named where it is
// made and in tests/README.md:
//
// - 临时简化，1.3–1.9 按节点表收紧: every node from E3 on writes one commit when it ends, and the
//   commit moves `position` to the next node. The exact commit points of the node table are not
//   followed yet. Q1 writes P for an internal source before it calls `prepare` (SPEC "消息准入");
//   for the external input, U0 to Q4 run before the execution exists and write nothing; E1, E2 and
//   E4 only read, because a commit there would overwrite the `position` that E4 reads (the initial
//   E3); and after F3 the execution is ended, so F4, O0 and E9 use their own records only.
// - #514: I2 is local; M0 commits PendingCall, the fixed request adoption and the effect together.
//   M6, M1 settlement, M4 (without extensions) and M5 make no checkpoint commit. M3 carries producer.
// - The input-taken event is written by the I0 commit; `open` writes no event (same-shape fact 7).
//
// E1/E2 dependency failures save a W0 wait. Unknown R0 operations keep their original revision. Other
// Unsupported outcomes stop with a named failure. Its owner distinguishes a port failure,
// an unimplemented stage and a coordinator defect:
//
// - a port's failure (Journal, Model, handoff, conditions, ...) is passed on as the port gave it;
// - `AGENT_OWNER` (`unavailable`): an outcome the contract defines but a later #502 card handles;
// - `DEFECT_OWNER` (`unavailable`): a defect of this coordinator: a thrown error, a value an earlier
//   node should have set, a node without a handler or an outcome without a table row. A defect is
//   never a dependency being unavailable and is never waited on.
import type { ContentBlock } from '@omne-harness/content-block'
import type {
  AcceptedInput,
  Action,
  ActionBatch,
  ActionSlot,
  Access,
  AgentCheckpoint,
  AgentEvaluator,
  AgentEventBody,
  AgentExecutionId,
  AgentInstant,
  AgentOperationId,
  Authority,
  CallerCommit,
  ControlRecord,
  ExecutionControl,
  ConsumerRef,
  ConsumptionId,
  ActionId,
  EffectIntent,
  DurableEvidence,
  ExecutionRevision,
  ExecutionSnapshot,
  ExecutionState,
  JournalCommitState,
  Failure,
  FinishAuthorization,
  FailureCandidate,
  FinishCandidateContent,
  HandoffChange,
  HandoffOutcome,
  InputBatch,
  InputHandoff,
  InvokeRuntimeContext,
  LoopFacts,
  MessageSource,
  ModelContextRead,
  OriginalInputAcceptance,
  PendingHandoff,
  ModelReplyAdmission,
  Next,
  PendingCall,
  Preparation,
  RuntimeConditions,
  SelectedModel,
  StepId,
  Waiting,
  ReceivedEntry,
  ReplyAdmissionPrefix,
  ReplyAdmissionRead,
} from '@omne-harness/agent-contract'
import type * as M from '@omne-harness/model-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { AgentConfiguration, AgentDependencies, AgentRuntimeBinding } from '../construction.ts'
import {
  AGENT_OWNER,
  agentEvidence,
  handoffStage,
  handoffOperation,
  invocationParts,
  journalOperation,
  mainAction,
  mainBatch,
  mainConsumption,
  mainInvocation,
  ordinalOf,
  stepOf,
  type Message,
} from './identities.ts'
import { canonical } from '../canonical.ts'
import { waitForExecutionChange, type HeldPosition } from './wait.ts'
import { diagnosticOf } from './diagnostic.ts'
import {
  lowerBound,
  readRange,
  REPLY_ADMISSION_PAGE_LIMIT,
  sentPosition,
} from './admission-read.ts'
import { LOOP_NODES, successor, type Label, type LoopNode } from './nodes.ts'
import { consumeModelResult, type ModelOutcome } from './model-result.ts'
import { readModelDeliveryMaterial } from '../receiving-material.ts'
import {
  advanceControl,
  cancellationOf,
  controlOperation,
  establishCancellation,
} from '../control.ts'
import {
  actionOf,
  admitToolAction,
  deniedCandidate,
  deniedSlot,
  preserveToolIntent,
  toolCallOf,
  toolProduced,
  toolReceivedOf,
  toolResultCandidate,
  type AssociatedToolCall,
} from './tools.ts'
import { readToolDeliveryMaterial } from '../tool-receiving-material.ts'
import type { ToolDelivery } from '@omne-harness/tool-contract'

/** The ports the coordinator uses. None of them depends on the content block type. */
export type LoopPorts<P> = Pick<
  AgentDependencies<P, ContentBlock>,
  | 'journal'
  | 'models'
  | 'conditions'
  | 'requests'
  | 'selection'
  | 'modelContext'
  | 'handoff'
  | 'clock'
  | 'materials'
  | 'tools'
  | 'toolRequests'
  | 'admission'
>

export type ExecutionEntry<P> = Readonly<{
  ports: LoopPorts<P>
  binding: AgentRuntimeBinding
  /**
   * The joint-commit kinds of the factory configuration, which the factory checked against the
   * participants of the Journal binding (SPEC "提交参加者协议"). The Ja of a source whose kind is
   * listed carries that CallerCommit; see `historyCaller`. The runtime always passes the
   * configured list. Absent is the empty list: no external CallerCommit is requested (SPEC
   * "真实历史的提交点"), which is what a coordinator built directly by a test or harness gets.
   */
  jointCommits?: AgentConfiguration['jointCommits']
  evaluator: AgentEvaluator
  /** The Access of the invoke; every operation of the execution runs under it. */
  access: Access<P>
  execution: AgentExecutionId
  /** The operation of the invoke, which `open` uses as its own. */
  operation: AgentOperationId
  initial: AcceptedInput
  grant: DurableEvidence | null
  /** E9, or E1 finding an advanced execution: give the slot back and return to idle. */
  idle(): void
  toolConcurrency?: number
  /**
   * Receives the report of a cold read of the reply admission facts (D5 5.1, 治疗). Optional; the
   * runtime assembly gives none yet, so the report then goes nowhere.
   */
  report?: (report: ReplyAdmissionReadReport) => void
}>

/**
 * A cold read of the reply admission facts: E2 met `missing-basis` at the prefix `from` and read
 * once again from origin. `outcome` says how that read ended; `pages` and `facts` are its size.
 */
export type ReplyAdmissionReadReport = Readonly<{
  kind: 'origin-reread'
  reason: 'missing-basis'
  from: string
  outcome: 'complete' | 'gap' | 'failure'
  pages: number
  facts: number
}>

/** Where and why the coordinator stopped. The execution stays where its last commit put it. */
export type Halted = Readonly<{ node: LoopNode; failure: Failure }>

export interface ExecutionCoordinator {
  /** U0 to E0: the input is admitted and `open` accepts the execution. Resolves at E1. */
  accept(): Promise<Outcome<Authority, Halted>>
  /**
   * After a legally accepted operation: run from E1 until idle, a saved wait or a failure.
   */
  runExecution(): Promise<Outcome<void, Halted>>
  /** W0's local resources belong to this awaited window, never to the producer. */
  waitForWake(
    input: Readonly<{ reconciliationDelayMs: number; signal: AbortSignal }>,
  ): Promise<Outcome<'ready' | 'stopped' | 'cancelled', Halted>>
  /** Original runtime only, after its old driver stopped. No attach, takeover or public resume. */
  continueExecution(authority: Authority): Promise<Outcome<void, Halted>>
}

type ReadyPreparation = Extract<Preparation, { kind: 'ready' }>
type InternalSource = Exclude<MessageSource, { kind: 'external-input' }>
type ModelPendingCall = Extract<PendingCall, { kind: 'model' }>
type OpenState = JournalCommitState
/** The Journal allocates `ended` and `entry` itself; a node commits none of them. */
export type CommitEvent = Exclude<AgentEventBody, { kind: 'ended' | 'entry' }>

/** What one node commits besides the move of `position`. */
type Write = Readonly<{
  checkpoint?: Partial<Omit<AgentCheckpoint, 'position'>>
  state?: OpenState
  /** The candidate content of the F1 commit (SPEC "条件终结" 1); absent on every other commit. */
  finish?: FinishCandidateContent
  events?: readonly CommitEvent[]
  effects?: readonly EffectIntent[]
  replyAdmission?: ModelReplyAdmission
  handoff?: HandoffChange
  /** The hand-over of a Ja to a declared participant; none when absent (see `historyCaller`). */
  caller?: CallerCommit
  /** The operation of the commit, when it is not the node's own; a Ja is derived from its H. */
  operation?: AgentOperationId
  /**
   * The commit records a fact that already happened, such as the reference a Tool returned for a
   * call it accepted. It is no new advance, so an effective cancellation does not drop it: F0 needs
   * the saved reference to interrupt the call, and the late result is received under it.
   */
  recordsFact?: true
}>

/**
 * The CallerCommit of the Ja that applies `fixed` (SPEC "真实历史的提交点"). When the assembly
 * declared the kind in `jointCommits`, the prepared message of a tool result, a denied action or a
 * reminder (T5, X5) is a `message` hand-over: its source is the original handoff record and its
 * admission the prepared result. The prepared compaction transition (C3) is a `context-transition`
 * hand-over: its value is the transition of the request and its admission the prepared result.
 * Otherwise the caller is none and the Journal's fixed history composition keeps the same history
 * duty in the same transaction. The main reply is never a CallerCommit: its history is the Journal's
 * core duty, carried by `replyAdmission`. A rejected outcome publishes no history, so it has none.
 */
function historyCaller(
  jointCommits: AgentConfiguration['jointCommits'],
  fixed: HandoffOutcome,
): CallerCommit {
  const { request, decision, record } = fixed
  if (request.kind !== 'execution' || decision.kind !== 'prepared') return { kind: 'none' }
  const source = request.source
  switch (source.kind) {
    case 'model-reply':
      return { kind: 'none' }
    case 'context-transition':
      return jointCommits.includes('context-transition')
        ? { kind: 'context-transition', value: source.transition, admission: decision.admission }
        : { kind: 'none' }
    case 'tool-result':
    case 'action-denied':
    case 'reminder':
      return jointCommits.includes('message')
        ? {
            kind: 'message',
            message: decision.message,
            source: record,
            admission: decision.admission,
          }
        : { kind: 'none' }
  }
}

/** The outcome of one node and the commit it writes; `commit: null` writes no commit. */
type Step = Readonly<{ on: Label; commit: Write | null }>
type Handler = () => Promise<Outcome<Step, Failure>>

/**
 * A candidate that Q1 to Q5 admit, and the fixed call position that Q4 returns to. The type ties
 * each source to its call position (Q1): the external input of the invoke to U0, a Model reply to
 * I3. The external request is complete before Q1; the internal request is fixed by Q1's P.
 */
type Candidate =
  | Readonly<{
      kind: 'external-input'
      request: InputHandoff
      runtime: InvokeRuntimeContext
      returnTo: 'U0'
    }>
  | Readonly<{
      kind: 'model-reply'
      source: Extract<MessageSource, { kind: 'model-reply' }>
      candidate: Message
      returnTo: 'I3'
    }>

/** The facts of one iteration, filled as its nodes run. Each field is set by the node named. */
type Iteration = {
  step: StepId
  batch: InputBatch | null
  action: ActionId
  consumption: ConsumptionId
  position: ConsumerRef
  conditions: RuntimeConditions | null // I1
  selected: SelectedModel | null // I1, P1
  context: ModelContextRead | null // I1
  preparation: Preparation | null // I1
  ready: ReadyPreparation | null // P1
  pending: ModelPendingCall | null // I2
  settlement: M.Settlement | null // M1
  result: ModelOutcome | null // restored from the Journal-bound completion, not a Model cache
  admission: 'new' | 'unknown' | 'accepted'
}

const step = (on: Label, commit: Write | null = {}): Outcome<Step, Failure> =>
  succeed({ on, commit })

/** The owner of a failure that is a defect of this coordinator, not of a port; see the header. */
export const DEFECT_OWNER = `${AGENT_OWNER}#defect`

function defect(diagnostic: string): Failure {
  return { kind: 'unavailable', owner: DEFECT_OWNER, diagnostic }
}

/**
 * The position after an own commit that the Journal accepted at `expected`: the commit appended
 * exactly its `events`. Unknown when the position before it was not the one at `expected`.
 */
function heldAfter(
  before: HeldPosition | null,
  expected: ExecutionRevision,
  revision: ExecutionRevision,
  events: number,
): HeldPosition | null {
  if (before?.revision !== expected) return null
  const through = before.emittedThrough ?? '0'
  // A sequence that is not decimal text leaves the position unknown; the wait then reads its own.
  if (!/^(?:0|[1-9]\d*)$/u.test(through)) return null
  const emitted = BigInt(through) + BigInt(events)
  return { revision, emittedThrough: emitted === 0n ? null : String(emitted) }
}

/** The failure of an outcome that a later #502 card handles, named so that nobody reads it as done. */
function notYet(node: LoopNode, what: string, card: string): Failure {
  return {
    kind: 'unavailable',
    owner: AGENT_OWNER,
    diagnostic: `${node}: ${what} is not handled until ${card}`,
  }
}

/** A Model failure, kept as what it is: the Model runtime did not give the step its answer. */
function modelFailure(
  node: LoopNode,
  failure: M.ModelFailure,
): Extract<Failure, { kind: 'unavailable' }> {
  return {
    kind: 'unavailable',
    owner: 'modelRuntime',
    diagnostic:
      failure.kind === 'unavailable'
        ? `${node}: ${failure.dependency}: ${failure.diagnostic}`
        : `${node}: the Model runtime answered ${failure.kind}`,
  }
}

/** A value that an earlier node of the same path sets. Its absence is a defect, so it throws. */
function required<T>(value: T | null, what: string): T {
  if (value === null) throw new Error(`coordinator defect: ${what} is not set`)
  return value
}

function sameRecipient(left: SelectedModel, right: SelectedModel): boolean {
  const a = left.recipient
  const b = right.recipient
  return (
    a.route === b.route &&
    a.profile.owner === b.profile.owner &&
    a.profile.name === b.profile.name &&
    a.profile.revision === b.profile.revision &&
    a.profile.digest === b.profile.digest
  )
}

function sameEvidence(left: DurableEvidence, right: DurableEvidence): boolean {
  return (
    left.owner === right.owner &&
    left.record === right.record &&
    left.revision === right.revision &&
    left.digest === right.digest
  )
}

function sameAuthority(left: Authority | null, right: Authority): boolean {
  return (
    left !== null &&
    left.execution === right.execution &&
    left.executionAttachment === right.executionAttachment &&
    left.instance === right.instance &&
    left.generation === right.generation &&
    sameEvidence(left.source, right.source)
  )
}

type UnsupportedRecovery = Readonly<{ kind: 'unsupported'; node: string; card: string }>
type Recovery = Outcome<LoopNode | 'evaluate', UnsupportedRecovery>

/** The #502 stage that owns a node this coordinator cannot continue from yet. */
function recoveryCard(node: string): string {
  if (node.startsWith('X')) return '#502 stage 3'
  if (node.startsWith('C')) return '#502 stage 4'
  return /^[AT]/u.test(node) ? '#502 stage 2' : '#502 stage 5'
}

/** A node the recovery may continue from, or the named stage that still owns it. */
function recoveryTarget(node: string): Recovery {
  if (
    /^[CX]/u.test(node) ||
    !LOOP_NODES.includes(node as LoopNode) ||
    ['E0', 'E1', 'E2', 'U0', 'Q1', 'R0', 'W0', 'F0', 'H0', 'M2', 'Q5'].includes(node)
  )
    return fail({ kind: 'unsupported', node, card: recoveryCard(node) })
  return succeed(node as LoopNode)
}

/** The node of a saved action batch, by its barrier and slots. */
function batchRecovery(position: string, batch: ActionBatch): string {
  if (batch.barrier.kind === 'closed') return 'A1'
  // The batch pass and the message admission continue where they are; T5 recognizes its Ja.
  if (['T4', 'T5', 'I8'].includes(position)) return position
  const slotted = (action: Action) => batch.slots.some(slot => slot.action === action.id)
  if (batch.barrier.kind === 'all-denied') return batch.actions.every(slotted) ? 'T2' : 'A3'
  // An action without a slot is sent, or sent again with its original request, only by A2.
  const judged = (action: Action) => ['allowed', 'denied'].includes(action.judgment.kind)
  if (batch.actions.some(action => judged(action) && !slotted(action))) return 'A2'
  return batch.slots.some(slot => slot.kind === 'dispatched') ? 'T0' : 'T1'
}

/** The node of a saved call outside an action batch. */
function callRecovery(position: string, call: PendingCall): Recovery {
  if (call.purpose === 'compaction')
    return fail({ kind: 'unsupported', node: 'M1', card: '#502 stage 4' })
  if (call.purpose === 'action') return recoveryTarget('T0')
  if (call.purpose === 'extension') return recoveryTarget('X2')
  // A saved call survives request admission and result consumption. Its presence alone does
  // not mean that observation at M1 is still pending.
  if (['M0', 'M6', 'M1', 'M3', 'M4', 'M5', 'I3', 'Q2', 'Q4'].includes(position))
    return recoveryTarget(position)
  return recoveryTarget('M1')
}

/** The node of a saved compaction or request preparation, or null when neither is saved. */
function preparationRecovery(at: AgentCheckpoint): Recovery | null {
  if (at.compaction !== null) {
    const ended = at.compaction.ended
    return recoveryTarget(ended === 'committed' ? 'I1' : ended === 'failed' ? 'F1' : 'C1')
  }
  const prepared = at.requestPreparation
  if (prepared === null) return null
  if (prepared.kind === 'assembled') return succeed('P0')
  if (prepared.kind === 'ready') return succeed('P1')
  if (prepared.kind === 'cannot-fit') return succeed('F1')
  return recoveryTarget('C0')
}

/** The routes the execution state, a lost receipt or a pending passage decide alone. */
function stateRecovery(
  read: Pick<ExecutionSnapshot, 'checkpoint' | 'state' | 'unresolved'>,
): Recovery | null {
  const at = read.checkpoint
  if (read.state.kind === 'ended') return succeed('F4')
  // A lost receipt must be reconciled before any dependent business continuation can run.
  if (read.unresolved.length > 0) return succeed('R0')
  if (read.state.kind === 'settling') return succeed(at.position === 'F3' ? 'F3' : 'F2')
  const passage = at.passages.find(item => item.progress.kind !== 'applied')
  if (passage === undefined) return null
  const progress = passage.progress.kind
  return recoveryTarget(progress === 'resolved' ? 'X5' : progress === 'asked' ? 'X4' : 'X2')
}

/** J5: snapshot facts that LoopFacts cannot carry stay in this pure recovery decision. */
export function recoveryRoute(
  read: Pick<ExecutionSnapshot, 'checkpoint' | 'state' | 'unresolved'>,
): Recovery {
  const at = read.checkpoint
  const settled = stateRecovery(read)
  if (settled !== null) return settled
  if (at.batch !== null && at.batch.actions.length > 0)
    return recoveryTarget(batchRecovery(at.position, at.batch))
  const call = at.calls[0]
  if (call !== undefined) return callRecovery(at.position, call)
  // The input batch remains a consumption watermark after I3 closes the call. It does not rewind
  // a later node to request preparation. Position records that these earlier facets are consumed.
  if (['I3', 'I4', 'I8', 'F1', 'F2', 'F3', 'F4', 'O0', 'E9'].includes(at.position))
    return recoveryTarget(at.position)
  const preparation = preparationRecovery(at)
  if (preparation !== null) return preparation
  if (at.inputBatch !== null) return succeed('I1')
  if (['E4', 'I0', 'I8'].includes(at.position)) return succeed('evaluate')
  return recoveryTarget(at.position)
}

export function createExecutionCoordinator<P>(entry: ExecutionEntry<P>): ExecutionCoordinator {
  const { ports, binding, evaluator, execution } = entry
  const access: Access<P> = { principal: entry.access.principal, tenant: entry.access.tenant }

  // The frame of this coordinator. The authority over it is the Journal: E1 reloads it, and every
  // commit replaces checkpoint and revision only after the Journal accepted them.
  let authority: Authority | null = null
  let revision: ExecutionRevision | null = null
  let checkpoint: AgentCheckpoint | null = null
  let state: OpenState = { kind: 'advancing' }
  let snapshot: ExecutionSnapshot | null = null
  let facts: LoopFacts | null = null
  let decided: Next | null = null
  let candidate: Candidate | null = null
  // The admission in progress: the internal request P fixed and the outcome `prepare` returned.
  let pendingHandoff: PendingHandoff | null = null
  let outcome: HandoffOutcome | null = null
  // The acceptance of the external input that U0 admitted, which E0 hands to `open`.
  let acceptance: OriginalInputAcceptance | null = null
  let iteration: Iteration | null = null
  // Only the identity and original node of this coordinator's uncertain conditional commit.
  // Journal query remains the authority over whether that operation actually committed.
  let pendingCommit: Readonly<{ operation: AgentOperationId; node: LoopNode }> | null = null
  let excludedNode: LoopNode | null = null
  let finishRefused = false
  // The unavailable answer of the last tryFinish: R0 waits on it as a dependency (loop-algorithm
  // F3 row: unavailable goes to R0; R0 waits while the facts are undetermined).
  let finishUnavailable: Extract<Failure, { kind: 'unavailable' }> | null = null
  // Whether the wait R0 entered is the memory wait of F3 (agent README, loop-algorithm R0 row): W0
  // writes nothing for it, and the wake retries the terminal through E1.
  let finishWait = false
  // Whether the next F3 issues the obligations again, after a tryFinish answered `changed`.
  let reissueObligations = false
  let cancellationChanged = false
  let waits: readonly Waiting[] = []
  let waitingAt: LoopNode = 'E1'
  let yieldedWait = false
  let waking = false
  let resumeState: OpenState = state
  let reconciliationOperations: readonly AgentOperationId[] = []
  let recheckDependency: ((read: ExecutionSnapshot) => Promise<Outcome<unknown, Failure>>) | null =
    null
  let activeDrive = false
  let activeWait = false
  // The verified prefix of the reply admission facts this coordinator read (D5 第 5 节). It belongs
  // to this execution and this coordinator, is lost with the process and is saved only by the
  // ordinary commits that carry it.
  let readPrefix: ReplyAdmissionPrefix | null = null
  const uncertainToolActions = new Set<ActionId>()
  // The tool message that T5 found rejected, for H0. In process only: a restart finds the
  // rejected Ja in the Journal again at T5.
  let rejectedMessage: Readonly<{ source: InternalSource; evidence: DurableEvidence }> | null = null
  // The read position the last operation was sent with: a retry of the same operation sends the
  // same semantic input (SPEC:261, 102), never a newer prefix.
  let lastSent: Readonly<{ operation: AgentOperationId; read: ReplyAdmissionRead }> | null = null
  // The event cursor at a revision, known exactly: set by each load, moved by each own commit that
  // landed on that revision. Event sequences are consecutive decimal numbers (SPEC "事件身份与序号")
  // and a commit appends exactly its own events, so the cursor after it needs no read. W0 hands it
  // to the wait as the start of the observation (perf baseline 2.3).
  let held: HeldPosition | null = null

  async function exclusive<T>(
    node: LoopNode,
    run: () => Promise<Outcome<T, Halted>>,
  ): Promise<Outcome<T, Halted>> {
    if (activeDrive || activeWait) return fail({ node, failure: { kind: 'busy' } })
    activeDrive = true
    try {
      return await run()
    } finally {
      activeDrive = false
    }
  }

  async function commit(node: LoopNode, to: string, write: Write): Promise<Outcome<void, Failure>> {
    const base = required(checkpoint, 'checkpoint')
    const after = required(revision, 'revision')
    const operation = write.operation ?? journalOperation(node, 'commit', after)
    const replyAdmissionRead = sentPosition(
      lastSent,
      operation,
      readPrefix,
      base.replyAdmissionRead,
    )
    lastSent = { operation, read: replyAdmissionRead }
    const next: AgentCheckpoint = { ...base, ...write.checkpoint, replyAdmissionRead, position: to }
    const nextState = write.state ?? state
    const committed = await ports.journal.commit({
      ...access,
      execution,
      operation,
      authority: required(authority, 'authority'),
      expected: after,
      checkpoint: next,
      state: nextState,
      events: write.events ?? [],
      effects: write.effects ?? [],
      caller: write.caller ?? { kind: 'none' },
      replyAdmission: write.replyAdmission ?? null,
      handoff: write.handoff ?? null,
      finish: write.finish ?? null,
    })
    if ('failure' in committed) {
      if (committed.failure.kind === 'changed') {
        const latest = await load()
        if ('failure' in latest) return latest
        if (advancementOf(latest.ok).kind !== 'current') return fail({ kind: 'stale-advance' })
        if (cancellationOf(latest.ok) !== undefined && write.recordsFact !== true)
          return fail({ kind: 'stale-advance' })
        if (canonical(latest.ok.checkpoint) === canonical(base)) {
          revision = latest.ok.revision
          return commit(node, to, write)
        }
      }
      if (committed.failure.kind === 'commit-unknown')
        pendingCommit = { operation: committed.failure.operation, node }
      return committed
    }
    held = heldAfter(held, after, committed.ok.revision, write.events?.length ?? 0)
    revision = committed.ok.revision
    checkpoint = next
    state = nextState
    return succeed(undefined)
  }

  /**
   * Whether a refused advance is an effective cancellation of the open execution. If it is, the
   * frame takes the latest snapshot and the run goes on at F0.
   */
  async function cancelledAdvance(failure: Failure): Promise<boolean> {
    if (failure.kind !== 'stale-advance') return false
    const latest = await load()
    if (
      'failure' in latest ||
      latest.ok.state.kind === 'ended' ||
      cancellationOf(latest.ok) === undefined
    )
      return false
    checkpoint = latest.ok.checkpoint
    revision = latest.ok.revision
    return true
  }

  /** Where the run goes after the Journal refused the commit of `at`, or why it stops. */
  async function afterRefusedCommit(
    at: LoopNode,
    failure: Failure,
  ): Promise<Outcome<LoopNode, Failure>> {
    // D5 5.1: the Journal lost the material of the prefix this commit carried. Drop the
    // in-process prefix and wait in W0 with the saved one; the wake reads from it again.
    if (failure.kind === 'unavailable' && failure.diagnostic.startsWith('missing-basis')) {
      readPrefix = null
      waitingAt = at
      recheckDependency = null
      waits = [{ kind: 'dependency', owner: failure.owner, position: at }]
      return succeed('W0')
    }
    if (failure.kind === 'changed' && ['F1', 'F2'].includes(at)) {
      finishRefused = true
      return succeed('R0')
    }
    if (failure.kind === 'changed' && ['M0', 'M3'].includes(at)) {
      const refreshed = await currentAttachment()
      return 'failure' in refreshed ? refreshed : succeed(at)
    }
    if (await cancelledAdvance(failure)) return succeed('F0')
    return fail(failure)
  }

  /**
   * The table row of one outcome and its commit: the next node, or the node a refused commit
   * goes to. `yielded` is the end of a drive segment at a saved W0 wait.
   */
  async function move(
    at: LoopNode,
    ran: Step,
  ): Promise<Outcome<Readonly<{ to: LoopNode | null; yielded: boolean }>, Failure>> {
    const to = successor(at, ran.on)
    if (to === undefined) return fail(defect(`${at} has no transition on ${ran.on}`))
    if (ran.commit !== null && to !== null) {
      const committed = await commit(at, to, ran.commit)
      if ('failure' in committed) {
        const next = await afterRefusedCommit(at, committed.failure)
        return 'failure' in next ? next : succeed({ to: next.ok, yielded: false })
      }
    }
    return succeed({ to, yielded: at === 'W0' && ran.on === 'saved-wait' })
  }

  /**
   * Runs nodes from `from` until `until` is the next node or the Loop ends. Each handler names its
   * outcome; the table says where it goes; the commit moves `position` there. A handler that
   * fails, an outcome without a row, a refused commit or a thrown defect stops the run where it is.
   */
  async function drive(
    from: LoopNode,
    until: LoopNode | null,
  ): Promise<Outcome<LoopNode | null, Halted>> {
    let node: LoopNode | null = from
    while (node !== null && node !== until) {
      const at: LoopNode = node
      const handler: Handler | undefined = handlers[at]
      if (handler === undefined) return fail({ node: at, failure: defect(`${at} has no handler`) })
      try {
        const ran = await handler()
        if ('failure' in ran) {
          if (await cancelledAdvance(ran.failure)) {
            node = 'F0'
            continue
          }
          return fail({ node: at, failure: ran.failure })
        }
        const moved = await move(at, ran.ok)
        if ('failure' in moved) return fail({ node: at, failure: moved.failure })
        // W0 yields this segment. The sole driver waits before taking its E1 successor.
        if (moved.ok.yielded) return succeed(moved.ok.to)
        node = moved.ok.to
      } catch (error) {
        return fail({ node: at, failure: defect(diagnosticOf(error)) })
      }
    }
    return succeed(node)
  }

  // ------------------------------------------------------------------------------------------
  // Reads shared by E1, E2, I8 and F1

  async function load(): Promise<Outcome<ExecutionSnapshot, Failure>> {
    const loaded = await ports.journal.load({ ...access, execution })
    if ('failure' in loaded) return loaded
    snapshot = loaded.ok
    held = { revision: loaded.ok.revision, emittedThrough: loaded.ok.output.emittedThrough }
    return loaded
  }

  /** The state a commit may write back: a settling snapshot carries the Journal's projection, which no commit writes. */
  function committedState(read: ExecutionState): OpenState {
    if (read.kind === 'ended')
      throw new Error('coordinator defect: an ended state is not committed')
    if (read.kind === 'waiting') return resumeState
    if (read.kind === 'settling') return { kind: 'settling' }
    return read
  }

  /** E1's reading of the snapshot: the advancement of this attachment. */
  function advancementOf(read: ExecutionSnapshot): LoopFacts['advancement'] {
    const own = required(authority, 'authority')
    const source = read.executionAttachment?.source ?? own.source
    if (read.state.kind === 'ended') return { kind: 'ended', source }
    if (!sameAuthority(read.executionAttachment, own)) return { kind: 'superseded', source }
    return { kind: 'current', source }
  }

  /** E2: the decision facts of the snapshot, the inputs within its watermark and the conditions. */
  async function readFacts(read: ExecutionSnapshot): Promise<Outcome<LoopFacts, Failure>> {
    const current = required(checkpoint, 'checkpoint')
    for (const operation of read.unresolved) {
      const queried = await ports.journal.query({ ...access, execution, operation })
      if ('failure' in queried) return queried
      switch (queried.ok.kind) {
        case 'committed':
        case 'excluded':
        case 'rejected':
          // Settled: the snapshot read after it carries the outcome; R0 owns the reconciliation.
          break
        case 'unknown':
          // Still waiting; E2 reads the facts as they are and R0 retries the query.
          break
      }
    }
    const inputs = await ports.journal.inputs({
      ...access,
      execution,
      watermark: read.inputWatermark,
    })
    if ('failure' in inputs) return inputs
    const admissions = await readAdmissions(read, current)
    if ('failure' in admissions) return admissions
    const conditions = await ports.conditions.read({
      ...access,
      advance: required(authority, 'authority'),
      previous: current.priorConditions,
    })
    if ('failure' in conditions) return conditions
    return succeed({
      advancement: advancementOf(read),
      checkpoint: current,
      conditions: conditions.ok,
      batch: inputs.ok.batch,
      inputs: inputs.ok.messages,
      // Public Model/Tool status queries belong to stage 5 (J4).
      producers: current.calls.map(pending => ({
        kind: 'unresolved',
        pending,
        source: read.history,
      })),
      consumption: read.results,
      replyAdmissions: read.replyAdmissions,
      controls: [], // Control interpretation belongs to stage 5 (J4).
    })
  }

  /**
   * E2's read of the reply admission facts (D5 第 5 节): from the lower bound to the fixed target
   * of `read`, page by page, the in-process prefix moving with each page that passed. A gap of
   * `missing-basis` at a prefix is read once more from origin (5.1, 治疗); every other gap, and an
   * origin read that does not complete, is a dependency to wait on. E2 writes nothing.
   */
  async function readAdmissions(
    read: ExecutionSnapshot,
    current: AgentCheckpoint,
  ): Promise<Outcome<void, Failure>> {
    const port = (
      input: Omit<
        Parameters<typeof ports.journal.readReplyAdmissions>[0],
        'principal' | 'tenant' | 'execution'
      >,
    ) => ports.journal.readReplyAdmissions({ ...access, execution, ...input })
    const range = {
      through: read.replyAdmissions.through,
      target: read.replyAdmissions.prefix,
      limit: REPLY_ADMISSION_PAGE_LIMIT,
    }
    const advance = (prefix: ReplyAdmissionPrefix) => {
      readPrefix = prefix
    }
    const from = lowerBound(readPrefix, current.replyAdmissionRead)
    let ranged = await readRange(port, { ...range, from }, advance)
    if ('failure' in ranged) return ranged
    if (
      ranged.ok.kind === 'gap' &&
      ranged.ok.reason === 'missing-basis' &&
      from.kind === 'prefix'
    ) {
      readPrefix = null
      const origin = await readRange(port, { ...range, from: { kind: 'origin' } }, advance)
      entry.report?.({
        kind: 'origin-reread',
        reason: 'missing-basis',
        from: from.prefix.sequence,
        outcome: 'failure' in origin ? 'failure' : origin.ok.kind,
        pages: 'failure' in origin ? 0 : origin.ok.pages,
        facts: 'failure' in origin ? 0 : origin.ok.facts,
      })
      if ('failure' in origin) return origin
      ranged = origin
    }
    if (ranged.ok.kind === 'gap')
      return fail({
        kind: 'unavailable',
        owner: 'agentJournal',
        diagnostic: `reply admission range has a gap: ${ranged.ok.reason}`,
      })
    return succeed(undefined)
  }

  /**
   * Saves a dependency wait at `node`. `recheck` reads the dependency again before the driver
   * sleeps; `null` leaves the wake to a change of the execution or to the check time.
   */
  function waitFor(
    node: LoopNode,
    failure: Extract<Failure, { kind: 'unavailable' }>,
    recheck: ((read: ExecutionSnapshot) => Promise<Outcome<unknown, Failure>>) | null,
  ) {
    waitingAt = node
    recheckDependency = recheck
    waits = [{ kind: 'dependency', owner: failure.owner, position: node }]
    return step('wait', null)
  }

  /**
   * The evaluator at a decision segment; its `Next` is the outcome of the node. A stop (ended or
   * superseded) is a contract outcome whose nodes come with #502 1.4 and stage 5, so it stops here
   * by name instead of reaching the table as a defect.
   */
  function evaluate(node: 'E4' | 'I8', at: LoopFacts): Outcome<Step, Failure> {
    const evaluated = evaluator.next(at)
    if ('failure' in evaluated) return evaluated
    if (evaluated.ok.kind === 'stop')
      return fail(notYet(node, `a stop (${evaluated.ok.reason})`, '#502 1.4 and stage 5'))
    decided = evaluated.ok
    if (evaluated.ok.kind === 'wait') {
      recheckDependency = null
      waits = evaluated.ok.waiting
      waitingAt = node
    }
    return step(evaluated.ok.kind, null)
  }

  // ------------------------------------------------------------------------------------------
  // admitMessage: U0, Q1, Q2, Q4, Q5 (SPEC "消息准入"; the Q5 of H0, T5, C3 and X5 comes with them)

  /** The runtime context of this invoke: the real instance, scope, definition and grant. */
  const runtimeContext: InvokeRuntimeContext = {
    instance: binding.instance,
    scope: binding.scope,
    definition: binding.definition,
    grant: entry.grant,
  }

  /** The stable source position of the main reply of one step: the return position I3. */
  function replyPosition(step: StepId): PendingHandoff['position'] {
    return { step, node: 'I3', slot: null }
  }

  /** The handoff record of the main reply of `step` in the latest snapshot, if P saved one. */
  function replyRecord(step: StepId, call: M.ModelCallId) {
    return required(snapshot, 'snapshot').handoffs.find(
      record =>
        record.request.kind === 'execution' &&
        record.request.source.kind === 'model-reply' &&
        record.request.source.call === call &&
        canonical(record.request.position) === canonical(replyPosition(step)),
    )
  }

  /** The outcome of a resolution the Journal recorded, or `undefined` when it holds none. */
  function recordedOutcome(
    resolution: ExecutionSnapshot['handoffs'][number]['resolution'],
  ): HandoffOutcome | undefined {
    return resolution?.kind === 'recorded' ? resolution.outcome : undefined
  }

  /** The Ja of the current model reply: the resolve commit with the admission fact of the reply. */
  function replyApplication(
    request: PendingHandoff,
    fixed: HandoffOutcome,
    source: Extract<MessageSource, { kind: 'model-reply' }>,
  ): Write {
    const decision = fixed.decision
    const basis = decision.kind === 'prepared' ? decision.admission : decision.evidence
    return {
      checkpoint: { currentHandoff: null },
      events:
        decision.kind === 'prepared'
          ? [{ kind: 'message', message: decision.message, source: decision.admission }]
          : [],
      replyAdmission: {
        step: source.step,
        action: source.action,
        call: source.call,
        resultVersion: source.result.version,
        decision: decision.kind === 'prepared' ? 'admitted' : 'rejected',
        source: basis,
      },
      handoff: { kind: 'resolve', outcome: fixed },
      operation: handoffStage(request.reference.operation, 'resolve'),
    }
  }

  const admitMessage = {
    /**
     * U0: the input of invoke becomes the external request of this entry; once the provider
     * prepared it, the real acceptance is E0's `open` (SPEC "消息准入": the external input is
     * published by the original open). A rejected input returns to the caller from Q5.
     */
    async U0() {
      if (outcome === null) {
        const initial = evaluator.initial({ definition: binding.definition, step: stepOf(0) })
        if ('failure' in initial) return initial
        const inputEntry = {
          kind: 'invoke' as const,
          operation: entry.operation,
          execution,
          initial: entry.initial,
          checkpoint: initial.ok,
        }
        candidate = {
          kind: 'external-input',
          request: {
            kind: 'input',
            reference: {
              kind: 'input',
              execution,
              entry: entry.operation,
              input: entry.initial.id,
            },
            entry: inputEntry,
            source: { kind: 'external-input', input: entry.initial.id },
          },
          runtime: runtimeContext,
          returnTo: 'U0',
        }
        return step('candidate', null)
      }
      if (candidate?.kind !== 'external-input') return fail(defect('U0 without its candidate'))
      acceptance = {
        entry: candidate.request.entry,
        handoff: candidate.request.reference,
        outcome,
      }
      outcome = null
      candidate = null
      return step('admitted', null)
    },
    /**
     * Q1: the internal request is fixed by P before anything else (SPEC "消息准入"): the commit
     * with `handoff.prepare` sets `currentHandoff` to H. Then `prepare` fixes the admission
     * result; prepared goes to Q2, rejected to Q5. The external input writes no P.
     */
    async Q1() {
      const subject = required(candidate, 'candidate')
      if (subject.kind === 'external-input') {
        const fixed = await ports.handoff.prepare({
          ...access,
          kind: 'invoke',
          request: subject.request,
          runtime: subject.runtime,
        })
        if ('failure' in fixed) return fixed
        outcome = fixed.ok
        return step(fixed.ok.decision.kind, null)
      }
      const current = required(iteration, 'iteration')
      const existing = replyRecord(current.step, subject.source.call)
      let request: PendingHandoff
      if (existing?.request.kind === 'execution') {
        // P already holds this reply: the same H continues (SPEC "准入的恢复切点").
        request = existing.request
      } else {
        const predecessor = required(revision, 'revision')
        const position = replyPosition(current.step)
        request = {
          kind: 'execution',
          reference: {
            kind: 'execution',
            execution,
            operation: handoffOperation('model-reply', position, predecessor),
          },
          predecessor,
          position,
          source: subject.source,
          candidate: subject.candidate,
          originalAdvance: required(authority, 'authority'),
          predecessorHandoff: null,
        }
        const prepared = await commit('Q1', 'Q2', {
          checkpoint: { currentHandoff: request.reference },
          handoff: { kind: 'prepare', request },
          operation: handoffStage(request.reference.operation, 'prepare'),
        })
        if ('failure' in prepared) return prepared
      }
      pendingHandoff = request
      const fixed = await ports.handoff.prepare({
        ...access,
        kind: 'execution',
        request,
        advance: required(authority, 'authority'),
      })
      if ('failure' in fixed) return fixed
      outcome = fixed.ok
      return step(fixed.ok.decision.kind, null)
    },
    /**
     * Q2: the Ja of an internal source commits the fixed outcome with the real history in one
     * conditional commit and clears `currentHandoff`. After a lost receipt the same H is read back
     * with `lookup`, or prepared again with the same request when it is still unknown. The
     * external input has its real acceptance at E0.
     */
    async Q2() {
      const subject = required(candidate, 'candidate')
      if (subject.kind === 'external-input') return step('resolved', null)
      const request = required(pendingHandoff, 'pending handoff')
      if (outcome === null) {
        const found = await ports.handoff.lookup({
          ...access,
          kind: 'execution',
          execution,
          handoff: request.reference,
        })
        if ('failure' in found) return found
        if (found.ok.kind === 'excluded')
          return fail(notYet('Q2', 'an excluded handoff (retire)', '#502 stage 5'))
        if (found.ok.kind === 'recorded') outcome = found.ok.outcome
        else {
          const fixed = await ports.handoff.prepare({
            ...access,
            kind: 'execution',
            request,
            advance: required(authority, 'authority'),
          })
          if ('failure' in fixed) return fixed
          outcome = fixed.ok
        }
      }
      return step('resolved', replyApplication(request, outcome, subject.source))
    },
    /** Q4: back to the fixed call position of the source, once; nothing is retried. */
    async Q4() {
      const subject = required(candidate, 'candidate')
      return step(`return-${subject.returnTo}`, authority === null ? null : {})
    },
    /**
     * Q5: the rejected result by source. The external input returns the rejection to the caller
     * of invoke as invalid; the model reply saves its rejected admission fact with the Ja and no
     * history (SPEC "消息准入", the source table).
     */
    async Q5() {
      const subject = required(candidate, 'candidate')
      const fixed = required(outcome, 'outcome')
      if (fixed.decision.kind !== 'rejected') return fail(defect('Q5 without a rejected outcome'))
      if (subject.kind === 'external-input')
        return fail({ kind: 'invalid', field: 'value', reason: fixed.decision.reason })
      const request = required(pendingHandoff, 'pending handoff')
      return step('disposed', replyApplication(request, fixed, subject.source))
    },
  } satisfies Partial<Record<LoopNode, Handler>>

  // ------------------------------------------------------------------------------------------
  // R0: the reconciliation of original operations, and where it goes on

  /** The snapshot R0 reconciles: the latest one after a refused terminal, with the own commit. */
  async function reconciliationBase(): Promise<Outcome<ExecutionSnapshot, Failure>> {
    let before = required(snapshot, 'snapshot')
    if (finishRefused) {
      const latest = await load()
      if ('failure' in latest) return latest
      before = latest.ok
    }
    const original = pendingCommit?.operation
    if (original !== undefined && !before.unresolved.includes(original))
      before = { ...before, unresolved: [original, ...before.unresolved] }
    return succeed(before)
  }

  /**
   * Queries every unresolved operation of `before`; whether the own commit of this coordinator
   * was settled. An unknown answer stops R0 under the original operation.
   */
  async function queryOriginals(before: ExecutionSnapshot): Promise<Outcome<boolean, Failure>> {
    let resolvedOriginal = false
    reconciliationOperations = before.unresolved
    for (const operation of before.unresolved) {
      const queried = await ports.journal.query({ ...access, execution, operation })
      if ('failure' in queried) return queried
      const own = pendingCommit?.operation === operation ? pendingCommit : null
      // A waiting commit must not change the expected revision of the original operation.
      if (queried.ok.kind === 'unknown') return fail({ kind: 'commit-unknown', operation })
      if (own === null) continue
      // Settled for another writer's operation; only recordControl can be refused durably, so
      // for this coordinator's own commit it is a violation by the Journal provider.
      if (queried.ok.kind === 'rejected')
        return fail({
          kind: 'unavailable',
          owner: 'agentJournal',
          diagnostic: `query answered rejected for the commit ${operation}`,
        })
      excludedNode = queried.ok.kind === 'excluded' ? own.node : null
      resolvedOriginal = true
    }
    return succeed(resolvedOriginal)
  }

  /**
   * R0 takes the snapshot after its queries as the frame, without the operations it settled. An
   * excluded terminal at another revision than its own is a refused terminal to evaluate again.
   */
  function adoptReconciled(
    loaded: ExecutionSnapshot,
    before: ExecutionSnapshot,
    terminalQuery: boolean,
    terminalExpected: ExecutionRevision | null,
  ): ExecutionSnapshot {
    reconciliationOperations = []
    const adopted = {
      ...loaded,
      unresolved: loaded.unresolved.filter(operation => !before.unresolved.includes(operation)),
    }
    if (terminalQuery && excludedNode === 'F3' && adopted.revision !== terminalExpected) {
      excludedNode = null
      finishRefused = true
    }
    checkpoint = adopted.checkpoint
    revision = adopted.revision
    if (adopted.state.kind !== 'ended') state = committedState(adopted.state)
    return adopted
  }

  /** R0 under an effective cancellation: the cancelled route goes on or waits in memory. */
  function cancelledReconcile(): Outcome<Step, Failure> {
    if (cancellationChanged) {
      cancellationChanged = false
      return finishDependencyWait('F1')
    }
    if (reissueObligations) {
      finishRefused = false
      return step('reconciled', null)
    }
    if (finishRefused) return finishDependencyWait('F3')
    return step('reconciled', null)
  }

  function finishDependencyWait(node: 'F1' | 'F3'): Outcome<Step, Failure> {
    finishWait = true
    waitingAt = node
    waits = [{ kind: 'dependency', owner: 'agentJournal', position: node }]
    recheckDependency = null
    return step('wait', null)
  }

  /** R0 after a refused terminal, with the facts read again: wait, or re-evaluate a node. */
  function refusedFinishRoute(read: LoopFacts): Outcome<Step, Failure> {
    finishRefused = false
    // A tryFinish that could not determine the facts is a dependency to wait on, not a refusal
    // to re-evaluate: the same terminal would be retried in a tight loop otherwise. The wake
    // is a change of the execution or the check time; the terminal itself is a write, so
    // nothing rechecks it inside the wait.
    if (finishUnavailable !== null) {
      const failure = finishUnavailable
      finishUnavailable = null
      finishWait = true
      return waitFor('R0', failure, null)
    }
    const latest = required(snapshot, 'snapshot')
    // Controls and extensions are still owned by their later cards. Never retry an unchanged
    // refusal in a loop, or mistake an unimplemented responsibility for an empty queue.
    if (latest.controls.length > 0)
      return fail(notYet('R0', 'a terminal control responsibility', '#502 stage 5'))
    if (latest.checkpoint.passages.some(passage => passage.progress.kind !== 'applied'))
      return fail(notYet('R0', 'a pending passage', '#502 stage 3'))
    if (
      read.batch.ordered.length === 0 &&
      decided?.kind === 'try-finish' &&
      decided.failure !== null &&
      !read.consumption.some(item => item.custody === null && item.completion === null)
    )
      excludedNode = 'F1'
    else {
      decided = null
      excludedNode = 'I8'
    }
    return step('reconciled', null)
  }

  /**
   * Whether another driver moved the execution on: a revision and checkpoint this coordinator did
   * not write, while it has no unknown commit of its own and is not waking from its own wait.
   */
  function advancedByAnother(read: ExecutionSnapshot): boolean {
    return (
      read.revision !== revision &&
      pendingCommit === null &&
      !waking &&
      canonical(read.checkpoint) !== canonical(checkpoint)
    )
  }

  // ------------------------------------------------------------------------------------------
  // runExecution: E0, E1, E2, E3, E4, O0, E9

  const runExecutionNodes = {
    /** E0: `open` saves the original acceptance with the runtime context and grants the attachment. */
    async E0() {
      const original = required(acceptance, 'acceptance')
      const opened = await ports.journal.open({
        ...access,
        execution,
        operation: entry.operation,
        original,
        runtime: runtimeContext,
      })
      if ('failure' in opened) return opened
      authority = opened.ok.authority
      revision = opened.ok.receipt.revision
      checkpoint = original.entry.kind === 'invoke' ? original.entry.checkpoint : null
      if (checkpoint === null) return fail(defect('E0 without the invoke entry'))
      return step('authority', null)
    },
    /**
     * E1 reads the state and attachment of an already accepted operation. A revision that is
     * not the last one this coordinator knows means that another driver moved the execution on,
     * unless this coordinator still has its own unknown commit to reconcile.
     */
    async E1() {
      const read = await load()
      if ('failure' in read)
        return read.failure.kind === 'unavailable'
          ? waitFor('E1', read.failure, async latest => succeed(latest))
          : read
      const advancement = advancementOf(read.ok)
      if (advancement.kind === 'ended') return step('terminal', null)
      if (advancement.kind === 'superseded') return step('superseded', null)
      if (advancedByAnother(read.ok)) {
        entry.idle()
        return step('found-existing', null)
      }
      if (advancement.kind !== 'current')
        return fail(notYet('E1', `an advancement that is ${advancement.kind}`, '#502 1.4'))
      checkpoint = read.ok.checkpoint
      revision = read.ok.revision
      if (read.ok.state.kind !== 'ended')
        state = waking && read.ok.state.kind === 'waiting' ? resumeState : read.ok.state
      waking = false
      if (cancellationOf(read.ok) !== undefined) return step('cancel', null)
      return step('allowed', null)
    },
    /** E2: the facts of the decision, read only. */
    async E2() {
      const loaded = await load()
      if ('failure' in loaded)
        return loaded.failure.kind === 'unavailable'
          ? waitFor('E2', loaded.failure, async latest => succeed(latest))
          : loaded
      takeLatestPosition(loaded.ok)
      // Do not read business facts under an attachment the latest snapshot has already revoked.
      if (advancementOf(loaded.ok).kind !== 'current') return step('reconciled', null)
      snapshot = withPendingCommit(loaded.ok)
      // Reconcile every original slot before loading business facts or saving another revision;
      // an effective cancellation reads no business facts either.
      if (snapshot.unresolved.length > 0 || cancellationOf(snapshot) !== undefined)
        return step('reconciled', null)
      const read = await readFacts(snapshot)
      if ('failure' in read)
        return read.failure.kind === 'unavailable' ? waitFor('E2', read.failure, readFacts) : read
      facts = read.ok
      return step('reconciled', null)
    },
    /** E4: J5 routes snapshot continuations before delegating an input or iteration decision. */
    async E4() {
      const current = required(checkpoint, 'checkpoint')
      const latest = required(snapshot, 'snapshot')
      const advancement = advancementOf(latest)
      if (advancement.kind === 'ended') return step('resume-F4', null)
      if (advancement.kind === 'superseded') return step('resume-E9', null)
      if (cancellationOf(latest) !== undefined) return step('cancel', null)
      const route =
        excludedNode === null
          ? recoveryRoute({ ...latest, checkpoint: current })
          : succeed(excludedNode)
      excludedNode = null
      if ('failure' in route) return route
      const to = route.ok
      if (to === 'evaluate')
        return evaluate('E4', { ...required(facts, 'facts'), checkpoint: current })
      return step(to === 'E3' ? 'passage-pending' : `resume-${to}`, null)
    },
    /** E3: no extension is adopted (invoke refuses one), so the passage ends with a commit alone. */
    async E3() {
      return step('passed')
    },
    async O0() {
      return step('delivered', null)
    },
    /** E9: the execution is ended, so there is no attachment to detach; the runtime is idle. */
    async E9() {
      entry.idle()
      return step('idle', null)
    },
    /** J2: one atomic wait record, retaining the original continuation and the occupied slot. */
    async W0() {
      // No alternate waiting write may invalidate an original conditional operation.
      const original =
        pendingCommit?.operation ?? reconciliationOperations[0] ?? snapshot?.unresolved[0]
      if (original !== undefined) return fail({ kind: 'commit-unknown', operation: original })
      resumeState = state.kind === 'waiting' ? resumeState : state
      // The wait of an unavailable F3 stays in memory: no waiting commit, no event, the execution
      // stays settling, and the wake retries tryFinish at the check time.
      if (finishWait) {
        finishWait = false
        finishRefused = false
        finishUnavailable = null
        yieldedWait = true
        return step('saved-wait', null)
      }
      if (
        snapshot?.state.kind === 'waiting' &&
        canonical(snapshot.state.waits) === canonical(waits)
      ) {
        yieldedWait = true
        return step('saved-wait', null)
      }
      const saved = await commit('W0', required(checkpoint, 'checkpoint').position, {
        state: { kind: 'waiting', waits },
        events: [{ kind: 'waiting', waits }],
      })
      if ('failure' in saved) {
        if (saved.failure.kind !== 'changed') return saved
        waking = true
        return step('reconciled', null)
      }
      yieldedWait = true
      return step('saved-wait', null)
    },
    /** R0: committed follows the saved successor; excluded re-evaluates the original local node. */
    async R0() {
      const terminalQuery = pendingCommit?.node === 'F3'
      const terminalExpected = revision
      const before = await reconciliationBase()
      if ('failure' in before) return before
      const resolvedOriginal = await queryOriginals(before.ok)
      if ('failure' in resolvedOriginal) return resolvedOriginal
      const loaded = await load()
      if ('failure' in loaded) return loaded
      if (resolvedOriginal.ok) pendingCommit = null
      snapshot = adoptReconciled(loaded.ok, before.ok, terminalQuery, terminalExpected)
      if (advancementOf(snapshot).kind !== 'current') return step('reconciled', null)
      if (cancellationOf(snapshot) !== undefined) return cancelledReconcile()
      const read = await readFacts(snapshot)
      if ('failure' in read) {
        if (read.failure.kind !== 'unavailable') return read
        if (finishRefused) finishWait = true
        return waitFor('R0', read.failure, readFacts)
      }
      facts = read.ok
      return finishRefused ? refusedFinishRoute(read.ok) : step('reconciled', null)
    },
  } satisfies Partial<Record<LoopNode, Handler>>

  // ------------------------------------------------------------------------------------------
  // runIter: I0, I3, I4, I8

  const runIter = {
    /** I0: the inputs within the watermark become the batch of a new step. */
    async I0() {
      const at = required(facts, 'facts')
      const next = stepOf(ordinalOf(required(checkpoint, 'checkpoint').step) + 1)
      iteration = {
        step: next,
        batch: at.batch,
        action: mainAction(next),
        consumption: mainConsumption(execution, next),
        position: mainPosition(next),
        conditions: null,
        selected: null,
        context: null,
        preparation: null,
        ready: null,
        pending: null,
        settlement: null,
        result: null,
        admission: 'new',
      }
      // The input-taken event goes with the commit that fixes the batch and the step.
      return step('taken', {
        checkpoint: {
          step: next,
          inputBatch: at.batch.id,
          requestPreparation: null,
          compaction: null,
        },
        events: [{ kind: 'input-taken', batch: at.batch }],
      })
    },
    /** I3: the reply enters Q1; when Q4 brings it back admitted, the call is closed and I4 follows. */
    async I3() {
      const current = required(iteration, 'iteration')
      const restored = await readCompletion(current)
      if ('failure' in restored) return restored
      const result = restored.ok.result
      current.result = result
      if (result.kind === 'no-reply') {
        if (decided?.kind !== 'try-finish' || decided.failure?.kind !== 'no-reply') {
          const instant = await ports.clock.now()
          if ('failure' in instant) return instant
          const call = invocationParts(
            required(current.pending, 'pending call').reference,
            access.tenant,
          ).call
          const failure: FailureCandidate = {
            kind: 'no-reply',
            step: current.step,
            at: instant.ok,
            source: result.settlement.source,
            call,
            result: result.produced,
          }
          decided = {
            kind: 'try-finish',
            conclusion: {
              kind: 'fail',
              cause: agentEvidence(`${execution}/${current.step}/no-reply`, failure),
            },
            failure,
          }
        }
        return step('try-finish', null)
      }
      if (result.kind === 'partial') return step('partial', { checkpoint: { calls: [] } })
      const pending = required(current.pending, 'pending call')
      const call = invocationParts(pending.reference, access.tenant).call
      if (outcome === null) {
        // A reply whose Ja already committed is not admitted again (SPEC "消息准入": one H has
        // at most one history application); one whose P is pending continues through Q1.
        const record = replyRecord(current.step, call)
        if (record !== undefined && record.history.kind !== 'pending') {
          const fixed = recordedOutcome(record.resolution)
          if (fixed === undefined) return fail(defect('I3: an applied reply without its outcome'))
          outcome = fixed
        } else {
          candidate = {
            kind: 'model-reply',
            source: {
              kind: 'model-reply',
              step: current.step,
              action: current.action,
              call,
              result: result.produced,
            },
            candidate: result.reply,
            returnTo: 'I3',
          }
          return step('admit', null)
        }
      }
      const decision = outcome.decision.kind
      outcome = null
      candidate = null
      pendingHandoff = null
      // Keep the admitted reply until this conditional commit is known to hold. An excluded
      // I3 commit must re-evaluate the same admission rather than admit the reply a second time.
      return step(decision === 'prepared' ? 'admitted' : 'rejected', { checkpoint: { calls: [] } })
    },
    /** I4: the tool call parts of the admitted reply. Actions are #502 stage 2. */
    async I4() {
      const result = required(required(iteration, 'iteration').result, 'model result')
      if (result.kind !== 'reply') return fail(defect('I4 without a complete reply'))
      const reply = result.reply
      const actions = reply.blocks
        .filter(block => block.kind === 'tool_call')
        .map((block, index) => actionOf(required(iteration, 'iteration').step, block, index))
      return step(actions.length === 0 ? 'empty' : 'tools', {
        checkpoint: {
          batch: {
            id: mainBatch(required(iteration, 'iteration').step),
            source: result.produced,
            actions,
            barrier: { kind: 'closed', judging: actions.map(action => action.id), asked: [] },
            slots: [],
            batchPass: null,
          },
        },
      })
    },
    /** I8: the full facts again, and the evaluator decides between a new iteration and completion. */
    async I8() {
      const read = await load()
      if ('failure' in read) return read
      // Input submission and result records can advance the revision while Model runs. Use the
      // complete latest snapshot, under the same attachment, before deciding or committing I8.
      if (advancementOf(read.ok).kind !== 'current') return fail({ kind: 'stale-advance' })
      // R0 can reconsider a refused terminal while F3 is still the saved continuation.
      // Evaluate at I8 now; only this decision's commit (or W0) saves the new position.
      checkpoint = {
        ...read.ok.checkpoint,
        calls: callsAfterConsumedNoReply(read.ok),
        position: 'I8',
      }
      revision = read.ok.revision
      if (read.ok.state.kind !== 'ended') state = read.ok.state
      const current = await readFacts(read.ok)
      if ('failure' in current) return current
      facts = current.ok
      const evaluated = evaluate('I8', current.ok)
      if ('failure' in evaluated) return evaluated
      // W0 saves the wait while retaining I8 as the continuation. It does not claim a wakeup.
      return evaluated.ok.on === 'wait'
        ? step('wait', null)
        : step(evaluated.ok.on, { checkpoint: { batch: null }, state: { kind: 'advancing' } })
    },
  } satisfies Partial<Record<LoopNode, Handler>>

  function replaceAction(batch: ActionBatch, action: Action): ActionBatch {
    return { ...batch, actions: batch.actions.map(item => (item.id === action.id ? action : item)) }
  }

  function replaceSlot(batch: ActionBatch, slot: ActionSlot): ActionBatch {
    return {
      ...batch,
      slots: batch.slots.some(item => item.action === slot.action)
        ? batch.slots.map(item => (item.action === slot.action ? slot : item))
        : [...batch.slots, slot],
    }
  }

  function currentBatch(): ActionBatch {
    return required(required(checkpoint, 'checkpoint').batch, 'action batch')
  }

  function slotOf(batch: ActionBatch, action: ActionId): ActionSlot | undefined {
    return batch.slots.find(slot => slot.action === action)
  }

  function toolCall(action: Action): AssociatedToolCall | null {
    const pending = action.call
    return pending?.kind === 'tool' && pending.association === 'associated' ? pending : null
  }

  /** Allowed actions without a slot: never sent, waiting for a free place, or association-unknown. */
  function unslotted(batch: ActionBatch): readonly Action[] {
    return batch.actions.filter(
      action => action.judgment.kind === 'allowed' && slotOf(batch, action.id) === undefined,
    )
  }

  /** Calls that hold a place of `toolConcurrency`: saved, and without a result or denial slot. */
  function inFlight(batch: ActionBatch): readonly PendingCall[] {
    return batch.actions.flatMap(action => {
      const slot = slotOf(batch, action.id)
      return action.call !== null && (slot === undefined || slot.kind === 'dispatched')
        ? [action.call]
        : []
    })
  }

  function toolWait(node: LoopNode, batch: ActionBatch) {
    waitingAt = node
    recheckDependency = null
    waits = inFlight(batch).map(pending => ({ kind: 'producer' as const, pending }))
    return step('wait', null)
  }

  /** Reads the latest snapshot under the current attachment; a cancellation stops the node. */
  async function advancing(): Promise<Outcome<ExecutionSnapshot, Failure>> {
    const read = await load()
    if ('failure' in read) return read
    if (advancementOf(read.ok).kind !== 'current') return fail({ kind: 'stale-advance' })
    if (cancellationOf(read.ok) !== undefined) return fail({ kind: 'stale-advance' })
    if (read.ok.entries === undefined)
      return fail({
        kind: 'unavailable',
        owner: 'agentJournal',
        diagnostic: 'received entries unsupported',
      })
    checkpoint = read.ok.checkpoint
    revision = read.ok.revision
    if (read.ok.state.kind !== 'ended') state = committedState(read.ok.state)
    return read
  }

  type ReceivedToolResult = Readonly<{
    entry: ReceivedEntry
    delivery: Extract<ToolDelivery<ContentBlock>, { kind: 'result' }>
    pending: AssociatedToolCall
  }>

  /**
   * The complete saved Tool result of an action: the received entry of its original call, read
   * from the material and checked against the entry. The live Tool runtime is never asked.
   */
  async function receivedToolResult(
    read: ExecutionSnapshot,
    action: Action,
  ): Promise<Outcome<ReceivedToolResult | null, Failure>> {
    const pending = toolCall(action)
    if (pending === null) return succeed(null)
    const found = toolReceivedOf(read, pending)
    if (found === undefined) return succeed(null)
    const { material: source, ...expected } = found
    const material = await ports.materials.read({ ...access, source })
    if ('failure' in material) return material
    const delivery = readToolDeliveryMaterial(access, material.ok, expected)
    if (delivery?.kind !== 'result')
      return fail({
        kind: 'invalid',
        field: 'received.material',
        reason: 'invalid schema or original binding',
      })
    return succeed({ entry: found, delivery, pending })
  }

  type Sent = Readonly<{ batch: ActionBatch; progressed: boolean }>

  /** A2: every action denied at judgment gets its denied slot, saved before anything is sent. */
  async function slotDeniedAtJudgment(batch: ActionBatch): Promise<Outcome<Sent, Failure>> {
    let slotted = batch
    for (const action of batch.actions)
      if (action.judgment.kind === 'denied' && slotOf(batch, action.id) === undefined)
        slotted = replaceSlot(slotted, deniedSlot(action, action.judgment.evidence))
    if (slotted === batch) return succeed({ batch, progressed: false })
    const saved = await commit('A2', 'A2', { checkpoint: { batch: slotted } })
    return 'failure' in saved ? saved : succeed({ batch: slotted, progressed: true })
  }

  /** A2: the saved intent of a first attempt, before the Tool is asked. */
  async function saveToolIntent(
    batch: ActionBatch,
    action: Action,
  ): Promise<Outcome<Readonly<{ batch: ActionBatch; action: Action }>, Failure>> {
    const stored = await preserveToolIntent(ports, access, execution, action)
    if ('failure' in stored) return stored
    const pending = stored.ok
    const withIntent = { ...action, call: pending }
    const next = replaceAction(batch, withIntent)
    const saved = await commit('A2', 'A2', {
      checkpoint: { batch: next, calls: [...required(checkpoint, 'checkpoint').calls, pending] },
      effects: [{ action: action.id, pending, authority: required(authority, 'authority') }],
    })
    return 'failure' in saved ? saved : succeed({ batch: next, action: withIntent })
  }

  /**
   * A2 for one allowed action: the intent of a first attempt is saved, the current advance is
   * checked, and the complete original request is sent. Only an accepted or commit-unknown answer
   * associates the call; a rejection denies only a first attempt with no earlier unknown.
   */
  async function sendAction(batch: ActionBatch, original: Action): Promise<Outcome<Sent, Failure>> {
    if (original.judgment.kind !== 'allowed') return succeed({ batch, progressed: false })
    const fresh = original.call === null
    let next = batch
    let action = original
    if (fresh) {
      const saved = await saveToolIntent(batch, original)
      if ('failure' in saved) return saved
      ;({ batch: next, action } = saved.ok)
    }
    const pending = required(action.call, 'tool intent')
    // The last check before the Tool is asked: no invoke under a revoked advance.
    const eligible = await currentAttachment()
    if ('failure' in eligible) return eligible
    const result = await ports.tools.invoke({ ...access, request: original.judgment.request })
    if (result.kind === 'association-unknown') {
      uncertainToolActions.add(action.id)
      return succeed({ batch: next, progressed: false })
    }
    if (result.kind === 'rejected') {
      if (!fresh || uncertainToolActions.has(action.id))
        return succeed({ batch: next, progressed: false })
      const evidence = agentEvidence(`${execution}/${action.id}/rejected`, result.failure)
      next = replaceSlot(next, deniedSlot(action, evidence))
      const saved = await commit('A2', 'A2', { checkpoint: { batch: next } })
      return 'failure' in saved ? saved : succeed({ batch: next, progressed: true })
    }
    if (result.kind === 'commit-unknown') uncertainToolActions.add(action.id)
    return associate(next, action, pending, result.reference)
  }

  /**
   * A2: the call reference Tool returned is saved with the action and its dispatched slot. The
   * call exists once Tool accepted it, so the reference is saved under an effective cancellation
   * too; F0 then interrupts the call by it and the late result is received under it.
   */
  async function associate(
    batch: ActionBatch,
    action: Action,
    pending: PendingCall,
    reference: AssociatedToolCall['reference'],
  ): Promise<Outcome<Sent, Failure>> {
    const associated: PendingCall = {
      ...pending,
      kind: 'tool',
      purpose: 'action',
      association: 'associated',
      reference,
    }
    const next = replaceSlot(replaceAction(batch, { ...action, call: associated }), {
      kind: 'dispatched',
      action: action.id,
      each: null,
      candidate: null,
      handoff: null,
    })
    const saved = await commit('A2', 'A2', {
      checkpoint: {
        batch: next,
        calls: required(checkpoint, 'checkpoint').calls.map(call =>
          call.action === action.id ? associated : call,
        ),
      },
      recordsFact: true,
    })
    return 'failure' in saved ? saved : succeed({ batch: next, progressed: true })
  }

  /** The message source of a slot: its Tool result, or its denial. */
  function slotSource(action: Action, slot: ActionSlot): InternalSource {
    if (slot.kind === 'denied')
      return { kind: 'action-denied', action: action.id, evidence: slot.evidence }
    if (slot.kind !== 'result')
      throw new Error(`coordinator defect: no message of a ${slot.kind} slot`)
    return {
      kind: 'tool-result',
      action: action.id,
      call: toolCallOf(access, required(toolCall(action), 'associated Tool call')),
      result: slot.result,
    }
  }

  /** T5: P fixes the request of one slot's message before anything is prepared. */
  async function prepareSlotMessage(
    batch: ActionBatch,
    action: Action,
    slot: ActionSlot,
    source: InternalSource,
  ): Promise<Outcome<PendingHandoff, Failure>> {
    const predecessor = required(revision, 'revision')
    const position = { step: required(checkpoint, 'checkpoint').step, node: 'T5', slot: action.id }
    const request: PendingHandoff = {
      kind: 'execution',
      reference: {
        kind: 'execution',
        execution,
        operation: handoffOperation(source.kind, position, predecessor),
      },
      predecessor,
      position,
      source,
      candidate: required(slot.candidate, 'slot candidate'),
      originalAdvance: required(authority, 'authority'),
      predecessorHandoff: null,
    }
    const prepared = await commit('T5', 'T5', {
      checkpoint: {
        currentHandoff: request.reference,
        batch: replaceSlot(batch, { ...slot, handoff: request.reference }),
      },
      handoff: { kind: 'prepare', request },
      operation: handoffStage(request.reference.operation, 'prepare'),
    })
    return 'failure' in prepared ? prepared : succeed(request)
  }

  /**
   * T5: the admission outcome of one H. A saved H is looked up first, so an outcome the provider
   * already fixed is never prepared again. An unavailable prepare is a dependency to wait on.
   */
  async function slotOutcome(
    request: PendingHandoff,
    existing: ExecutionSnapshot['handoffs'][number] | undefined,
  ): Promise<Outcome<HandoffOutcome | 'wait', Failure>> {
    const recorded = existing === undefined ? undefined : recordedOutcome(existing.resolution)
    if (recorded !== undefined) return succeed(recorded)
    if (existing !== undefined) {
      const found = await ports.handoff.lookup({
        ...access,
        kind: 'execution',
        execution,
        handoff: request.reference,
      })
      if ('failure' in found) return found
      if (found.ok.kind === 'excluded')
        return fail(notYet('T5', 'an excluded handoff (retire)', '#502 stage 5'))
      if (found.ok.kind === 'recorded') return succeed(found.ok.outcome)
    }
    const prepared = await ports.handoff.prepare({
      ...access,
      kind: 'execution',
      request,
      advance: required(authority, 'authority'),
    })
    if ('ok' in prepared || prepared.failure.kind !== 'unavailable') return prepared
    waitFor('T5', prepared.failure, null)
    return succeed('wait')
  }

  /** T5: the Ja of one slot's message: the outcome, with the message when it was prepared. */
  async function applySlotMessage(
    request: PendingHandoff,
    fixed: HandoffOutcome,
  ): Promise<Outcome<void, Failure>> {
    const decision = fixed.decision
    return commit('T5', 'T5', {
      checkpoint: { currentHandoff: null },
      events:
        decision.kind === 'prepared'
          ? [{ kind: 'message', message: decision.message, source: decision.admission }]
          : [],
      caller: historyCaller(entry.jointCommits ?? [], fixed),
      handoff: { kind: 'resolve', outcome: fixed },
      operation: handoffStage(request.reference.operation, 'resolve'),
    })
  }

  type SlotAdmission = 'admitted' | 'rejected' | 'wait'

  /** T5 for a slot whose H already has its history disposition: never admitted again. */
  function disposedSlot(
    existing: ExecutionSnapshot['handoffs'][number],
    source: InternalSource,
  ): Outcome<SlotAdmission, Failure> {
    if (existing.history.kind === 'committed') return succeed('admitted')
    const recorded = recordedOutcome(existing.resolution)
    if (recorded?.decision.kind !== 'rejected')
      return fail(notYet('T5', 'a retired tool message handoff', '#502 stage 5'))
    rejectedMessage = { source, evidence: recorded.decision.evidence }
    return succeed('rejected')
  }

  /** T5: the H record of the handoff the slot saved, in the latest snapshot. */
  function slotHandoff(slot: ActionSlot): ExecutionSnapshot['handoffs'][number] | undefined {
    const handoff = slot.handoff
    if (handoff === null) return undefined
    return required(snapshot, 'snapshot').handoffs.find(
      record => canonical(record.handoff) === canonical(handoff),
    )
  }

  /** T5 for one slot: recognize its Ja, or fix, prepare and apply its message. */
  async function admitSlot(action: Action): Promise<Outcome<SlotAdmission, Failure>> {
    const batch = currentBatch()
    const slot = slotOf(batch, action.id)
    if (slot === undefined) return fail(defect('T5 with an action without a slot'))
    if (slot.kind === 'background' || slot.kind === 'dispatched')
      return fail(notYet('T5', 'a background placeholder message', '#502 stage 5'))
    const source = slotSource(action, slot)
    const existing = slotHandoff(slot)
    if (existing !== undefined && existing.history.kind !== 'pending')
      return disposedSlot(existing, source)
    const prepared =
      existing?.request.kind === 'execution'
        ? succeed(existing.request)
        : await prepareSlotMessage(batch, action, slot, source)
    if ('failure' in prepared) return prepared
    const request = prepared.ok
    const fixed = await slotOutcome(request, existing)
    if ('failure' in fixed) return fixed
    return fixed.ok === 'wait' ? succeed('wait') : admitFixed(request, fixed.ok, source)
  }

  /** T5: the Ja of a slot's fixed outcome; a rejected outcome is the rejected tool message. */
  async function admitFixed(
    request: PendingHandoff,
    fixed: HandoffOutcome,
    source: InternalSource,
  ): Promise<Outcome<SlotAdmission, Failure>> {
    const applied = await applySlotMessage(request, fixed)
    if ('failure' in applied) return applied
    if (fixed.decision.kind === 'prepared') return succeed('admitted')
    rejectedMessage = { source, evidence: fixed.decision.evidence }
    return succeed('rejected')
  }

  const runTools = {
    /** A3: all actions are denied; each gets its denied slot in the original order. */
    async A3() {
      const batch = currentBatch()
      const barrier = batch.barrier
      if (barrier.kind !== 'all-denied') return fail(defect('A3 without an all-denied barrier'))
      let slotted = batch
      for (const action of batch.actions) {
        if (slotOf(slotted, action.id) !== undefined) continue
        const evidence =
          action.judgment.kind === 'denied' ? action.judgment.evidence : barrier.evidence
        slotted = replaceSlot(slotted, deniedSlot(action, evidence))
      }
      return step('slotted', { checkpoint: { batch: slotted } })
    },
    async A0() {
      const batch = currentBatch()
      const actions: Action[] = []
      for (const action of batch.actions) {
        const admitted = await admitToolAction(
          ports,
          access,
          execution,
          required(authority, 'authority'),
          action,
        )
        if ('failure' in admitted) return admitted
        actions.push(admitted.ok)
      }
      return step('judged', { checkpoint: { batch: { ...batch, actions } } })
    },
    async A1() {
      const batch = currentBatch()
      if (batch.actions.some(action => action.judgment.kind === 'pending'))
        return step('judge', null)
      const approved = batch.actions
        .filter(action => action.judgment.kind === 'allowed')
        .map(action => action.id)
      const [first, ...rest] = approved
      const evidence = agentEvidence(`${execution}/${batch.id}/barrier`, batch.actions)
      if (first === undefined)
        return step('denied', {
          checkpoint: { batch: { ...batch, barrier: { kind: 'all-denied', evidence } } },
        })
      const actions = batch.actions.map(action =>
        action.judgment.kind === 'allowed'
          ? {
              ...action,
              judgment: {
                ...action.judgment,
                request: { ...action.judgment.request, batchDecision: evidence },
              },
            }
          : action,
      )
      return step('open', {
        checkpoint: {
          batch: {
            ...batch,
            actions,
            barrier: { kind: 'open', evidence, approved: [first, ...rest] },
          },
        },
      })
    },
    /**
     * A2: the actions denied at judgment get their denied slots; the allowed ones are sent in the
     * original order while `toolConcurrency` has a free place. The intent is saved before the
     * first invoke, and the current advance is checked again just before each invoke.
     */
    async A2() {
      const limit = entry.toolConcurrency
      if (limit === undefined)
        return fail({
          kind: 'unavailable' as const,
          owner: '@omne-harness/agent',
          diagnostic: 'toolConcurrency is unavailable',
        })
      const slotted = await slotDeniedAtJudgment(currentBatch())
      if ('failure' in slotted) return slotted
      let { batch, progressed } = slotted.ok
      for (const original of unslotted(batch)) {
        if (original.call === null && inFlight(batch).length >= limit) break
        const sent = await sendAction(batch, original)
        if ('failure' in sent) return sent
        batch = sent.ok.batch
        progressed ||= sent.ok.progressed
      }
      if (
        progressed ||
        batch.slots.some(slot => slot.kind === 'dispatched') ||
        unslotted(batch).length === 0
      )
        return step('dispatched')
      return toolWait('A2', batch)
    },
    /** T0: wait for a received result of any dispatched call; the receiver saves it, not T0. */
    async T0() {
      const read = await advancing()
      if ('failure' in read) return read
      const batch = currentBatch()
      const dispatched = batch.actions.filter(
        action => slotOf(batch, action.id)?.kind === 'dispatched',
      )
      const arrived = dispatched.some(action => {
        const pending = toolCall(action)
        return pending !== null && toolReceivedOf(read.ok, pending) !== undefined
      })
      if (arrived || dispatched.length === 0) return step('received', null)
      return toolWait('T0', batch)
    },
    /**
     * T1: each received result is kept in its own slot by the original action, with its terminal
     * and the received material as custody. Its call leaves the open calls; the received entry
     * keeps content and account.
     */
    async T1() {
      const read = await advancing()
      if ('failure' in read) return read
      let batch = currentBatch()
      let calls = required(checkpoint, 'checkpoint').calls
      const events: CommitEvent[] = []
      for (const action of batch.actions) {
        if (slotOf(batch, action.id)?.kind !== 'dispatched') continue
        const received = await receivedToolResult(read.ok, action)
        if ('failure' in received) return received
        if (received.ok === null) continue
        const { entry: kept, delivery, pending } = received.ok
        const result = toolProduced(toolCallOf(access, pending), delivery)
        batch = replaceSlot(batch, {
          kind: 'result',
          action: action.id,
          result,
          terminal: delivery.terminal,
          custody: kept.material,
          each: null,
          candidate: null,
          handoff: null,
        })
        calls = calls.filter(call => call.kind !== 'tool' || call.action !== action.id)
        events.push({ kind: 'producer', result, consumption: pending.consumption })
      }
      return step('kept', { checkpoint: { batch, calls }, events })
    },
    /**
     * T2: the single-result passage of each result and denied slot. No extension is adopted at
     * after_action, so each passage is empty and the candidate is the unchanged message.
     */
    async T2() {
      const read = await advancing()
      if ('failure' in read) return read
      let batch = currentBatch()
      for (const action of batch.actions) {
        const slot = slotOf(batch, action.id)
        if (slot === undefined || slot.each !== null) continue
        if (slot.kind === 'denied') {
          batch = replaceSlot(batch, {
            ...slot,
            each: [],
            candidate: deniedCandidate(execution, action),
          })
        } else if (slot.kind === 'result') {
          const received = await receivedToolResult(read.ok, action)
          if ('failure' in received) return received
          if (received.ok === null)
            return fail(defect('T2: a result slot without its received entry'))
          batch = replaceSlot(batch, {
            ...slot,
            each: [],
            candidate: toolResultCandidate(execution, action, received.ok.delivery.value.content),
          })
        }
      }
      return step('passed', { checkpoint: { batch } })
    },
    /** T3: the batch is complete only when every action has a slot and every passage ended. */
    async T3() {
      const batch = currentBatch()
      const complete = batch.actions.every(action => {
        const slot = slotOf(batch, action.id)
        return (
          slot !== undefined &&
          slot.kind !== 'dispatched' &&
          (slot.kind === 'background' || slot.each !== null)
        )
      })
      if (complete)
        return step(batch.slots.some(slot => slot.kind !== 'denied') ? 'batch' : 'admit', null)
      const waiting = unslotted(batch)
      const limit = entry.toolConcurrency ?? 0
      if (
        waiting.some(action => action.call !== null) ||
        (waiting.length > 0 && inFlight(batch).length < limit)
      )
        return step('dispatch', null)
      return toolWait('T3', batch)
    },
    /** T4: no extension is adopted at the after_action batch position, so the pass is empty. */
    async T4() {
      return step('proceed', { checkpoint: { batch: { ...currentBatch(), batchPass: [] } } })
    },
    /**
     * T5: in the original action order, each slot's candidate is fixed by P, prepared, and applied
     * with its Ja. A slot whose Ja is in the Journal is not admitted again.
     */
    async T5() {
      const read = await advancing()
      if ('failure' in read) return read
      for (const action of currentBatch().actions) {
        const admitted = await admitSlot(action)
        if ('failure' in admitted) return admitted
        if (admitted.ok === 'wait') return step('wait', null)
        if (admitted.ok === 'rejected') return step('rejected', null)
      }
      return step('admitted')
    },
    /**
     * H0: a rejected tool message with the advance still current becomes a failure candidate at
     * F1. A cancelled or superseded execution never reaches here: the reads before stop it.
     */
    async H0() {
      const rejection = required(rejectedMessage, 'rejected tool message')
      rejectedMessage = null
      const instant = await ports.clock.now()
      if ('failure' in instant) return instant
      const at = required(checkpoint, 'checkpoint').step
      const failure: FailureCandidate = {
        kind: 'message-rejected',
        step: at,
        at: instant.ok,
        source: rejection.evidence,
        from: rejection.source,
        evidence: rejection.evidence,
      }
      decided = {
        kind: 'try-finish',
        conclusion: {
          kind: 'fail',
          cause: agentEvidence(`${execution}/${at}/message-rejected`, failure),
        },
        failure,
      }
      return step('try-finish', null)
    },
  } satisfies Partial<Record<LoopNode, Handler>>

  // ------------------------------------------------------------------------------------------
  // prepareRequest: I1, P0, P1 (C0 to C4 are #502 stage 4)

  const prepareRequest = {
    /** I1: conditions, selection, context, then `prepare` without passages. */
    async I1() {
      const current = required(iteration, 'iteration')
      const advance = required(authority, 'authority')
      const history = required(snapshot, 'snapshot').history
      const readConditions = () =>
        ports.conditions.read({
          ...access,
          advance,
          previous: required(checkpoint, 'checkpoint').priorConditions,
        })
      const conditions = await readConditions()
      if ('failure' in conditions)
        return conditions.failure.kind === 'unavailable'
          ? waitFor('I1', conditions.failure, readConditions)
          : conditions
      const selected = await select(conditions.ok)
      if ('failure' in selected)
        return selected.failure.kind === 'unavailable'
          ? waitFor('I1', selected.failure, () => select(conditions.ok))
          : selected
      const readContext = () =>
        ports.modelContext.read({
          ...access,
          advance,
          position: current.position,
          recipient: selected.ok.recipient,
          history,
          adopted: required(checkpoint, 'checkpoint').adoptedContext,
          transition: null,
        })
      const context = await readContext()
      if ('failure' in context)
        return context.failure.kind === 'unavailable'
          ? waitFor('I1', context.failure, readContext)
          : context
      const prepared = await prepare(conditions.ok, selected.ok, context.ok, null, null)
      if ('failure' in prepared)
        return prepared.failure.kind === 'unavailable'
          ? waitFor('I1', prepared.failure, () =>
              prepare(conditions.ok, selected.ok, context.ok, null, null),
            )
          : prepared
      current.conditions = conditions.ok
      current.selected = selected.ok
      current.context = context.ok
      current.preparation = prepared.ok
      // #558 S-11: only P1's review can yield ready on the phase 1 path.
      if (prepared.ok.kind === 'ready')
        return fail({
          kind: 'unavailable',
          owner: 'requestPreparation',
          diagnostic: 'I1: the first prepare returned ready before the before-model passage',
        })
      const write = {
        checkpoint: { requestPreparation: prepared.ok, priorConditions: conditions.ok.source },
      }
      if (prepared.ok.kind === 'needs-compaction') {
        // #513 revision 2: preserve Context's answer without inventing a cannot-fit cause.
        // Stage 4 owns the C subgraph. Keep I1 as the unsupported continuation in this phase.
        const saved = await commit('I1', 'I1', write)
        return 'failure' in saved ? saved : fail({ kind: 'unsupported' as const })
      }
      return step(prepared.ok.kind === 'cannot-fit' ? 'try-finish' : 'prepared', write)
    },
    /** P0: no extension is adopted at before_model_call, so the passage proceeds. */
    async P0() {
      return step('proceed')
    },
    /** P1: select again and prepare with the previous preparation; the result must be ready. */
    async P1() {
      const current = required(iteration, 'iteration')
      const conditions = required(current.conditions, 'conditions')
      const selected = await select(conditions)
      if ('failure' in selected) return selected
      if (!sameRecipient(selected.ok, required(current.selected, 'selection')))
        return fail(notYet('P1', 'a changed selection', '#502 1.5'))
      const prepared = await prepare(
        conditions,
        selected.ok,
        required(current.context, 'context'),
        current.preparation,
        [],
      )
      if ('failure' in prepared) return prepared
      if (prepared.ok.kind !== 'ready')
        return fail(notYet('P1', `a ${prepared.ok.kind} preparation`, '#502 1.5 and stage 4'))
      current.ready = prepared.ok
      return step('ready', { checkpoint: { requestPreparation: prepared.ok } })
    },
  } satisfies Partial<Record<LoopNode, Handler>>

  function select(conditions: RuntimeConditions) {
    const current = required(iteration, 'iteration')
    return ports.selection.select({
      ...access,
      advance: required(authority, 'authority'),
      scope: binding.scope,
      purpose: 'main',
      position: current.position,
      history: required(snapshot, 'snapshot').history,
      conditions,
      alterations: [],
    })
  }

  function prepare(
    conditions: RuntimeConditions,
    selection: SelectedModel,
    context: ModelContextRead,
    previous: Preparation | null,
    beforeModelCall: readonly never[] | null,
  ) {
    const current = required(iteration, 'iteration')
    return ports.requests.prepare({
      ...access,
      advance: required(authority, 'authority'),
      action: current.action,
      purpose: 'main',
      position: current.position,
      history: required(snapshot, 'snapshot').history,
      inputs: required(current.batch, 'input batch'),
      // The definition this execution runs under: the preparation reads its `instructions` as the
      // first sections of the system prompt (agent-context SPEC「请求准备的取法」, 组四; R2-D124).
      definition: binding.definition,
      conditions,
      selection,
      context,
      previous,
      alterations: [],
      beforeModelCall,
    })
  }

  // ------------------------------------------------------------------------------------------
  // callModel: I2, M0, M6, M1, M3, M4, M5 (M2 remains stage 3)

  function mainPosition(step: StepId): ConsumerRef {
    return { owner: AGENT_OWNER, work: `${execution}/${step}`, position: 'I3', purpose: 'main' }
  }

  function mainPending(step: StepId, ready: ReadyPreparation): ModelPendingCall {
    return {
      kind: 'model',
      action: mainAction(step),
      consumption: mainConsumption(execution, step),
      position: mainPosition(step),
      fixed: ready.source,
      reference: mainInvocation(access.tenant, execution, step),
      purpose: 'main',
    }
  }

  const callModel = {
    /**
     * I2: the PendingCall of the main call, whose return position is I3. Its ModelInvocationRef is
     * encoded here from the call and admission that the coordinator derives, so the commit of this
     * M0 saves it with the effect before the first admit at M6.
     */
    async I2() {
      const current = required(iteration, 'iteration')
      const ready = required(current.ready, 'ready preparation')
      current.pending = mainPending(current.step, ready)
      return step('call', null)
    },
    /** M0: the adopted context and the effect intent are committed before the Model admits. */
    async M0() {
      const current = required(iteration, 'iteration')
      const pending = required(current.pending, 'pending call')
      // #558 M04-2: the inherited ready preparation records the final request in this commit.
      return step('recorded', {
        checkpoint: {
          calls: [pending],
          adoptedContext: required(current.ready, 'ready preparation').coverage,
        },
        effects: [{ action: current.action, pending, authority: required(authority, 'authority') }],
      })
    },
    async M6() {
      const current = required(iteration, 'iteration')
      const pending = required(current.pending, 'pending call')
      const { call, admission } = invocationParts(pending.reference, access.tenant)
      if (current.admission === 'accepted') {
        state = { kind: 'advancing' }
        return step('admitted', null)
      }
      if (current.admission === 'unknown') {
        const found = await ports.models.calls.inspect({ ...access, reference: pending.reference })
        if ('failure' in found) return modelWait('M6', found.failure)
        if (found.ok.kind === 'found') {
          current.admission = 'accepted'
          state = { kind: 'advancing' }
          return step('admitted', null)
        }
        if (found.ok.operation !== admission)
          return fail(defect('M6: not-accepted names another admission'))
      }
      const eligible = await currentAttachment()
      if ('failure' in eligible) return eligible
      const ready = required(current.ready, 'ready preparation')
      const admitted = await ports.models.calls.admit({
        ...access,
        call,
        operation: admission,
        request: ready.request,
        consumer: pending.position,
        capacity: ready.capacity,
      })
      if ('failure' in admitted) {
        if (admitted.failure.kind !== 'commit-unknown')
          return fail(modelFailure('M6', admitted.failure))
        current.admission = 'unknown'
        const recalled = await ports.models.calls.inspect({
          ...access,
          reference: pending.reference,
        })
        if ('failure' in recalled) return modelWait('M6', recalled.failure)
        // An unknown write is never repeated in this turn, even if inspection cannot yet find it.
        if (recalled.ok.kind !== 'found') return producerWait('M6', pending)
      } else if (admitted.ok.reference !== pending.reference) {
        return fail(defect('M6: admission returned another reference'))
      }
      current.admission = 'accepted'
      state = { kind: 'advancing' }
      return step('admitted', null)
    },
    async M1() {
      const current = required(iteration, 'iteration')
      const pending = required(current.pending, 'pending call')
      const received = await receivedOf(pending)
      if ('failure' in received)
        return received.failure.kind === 'unavailable'
          ? waitFor('M1', received.failure, () => receivedOf(pending))
          : received
      if (received.ok === null) return producerWait('M1', pending)
      return step('settled', null)
    },
    async M3() {
      const current = required(iteration, 'iteration')
      const restored = await readCompletion(current)
      if ('failure' in restored) return restored
      current.result = restored.ok.result
      const refreshed = await currentAttachment()
      if ('failure' in refreshed) return refreshed
      return step('kept', {
        events: [
          {
            kind: 'producer',
            result: restored.ok.result.produced,
            consumption: current.consumption,
          },
        ],
      })
    },
    /** M4: no extension is adopted at after_model_call, so the passage proceeds. */
    async M4() {
      return step('proceed', null)
    },
    /** M5: back to the return position that the PendingCall saved. */
    async M5() {
      const pending = required(required(iteration, 'iteration').pending, 'pending call')
      if (pending.position.position !== 'I3')
        return fail(notYet('M5', `a return to ${pending.position.position}`, '#502 stage 4'))
      return step('return-I3', null)
    },
  } satisfies Partial<Record<LoopNode, Handler>>

  async function receivedOf(
    pending: ModelPendingCall,
  ): Promise<Outcome<ReceivedEntry | null, Failure>> {
    const read = await load()
    if ('failure' in read) return read
    if (read.ok.entries === undefined)
      return fail({
        kind: 'unavailable',
        owner: 'agentJournal',
        diagnostic: 'received entries unsupported',
      })
    const found = read.ok.entries.find(
      (entry): entry is ReceivedEntry =>
        entry.kind === 'received' &&
        entry.delivery.producer === 'model' &&
        entry.delivery.key.kind === 'result' &&
        entry.delivery.key.reference === pending.reference &&
        entry.consumption === pending.consumption &&
        canonical(entry.consumer) === canonical(pending.position),
    )
    return succeed(found ?? null)
  }

  async function readCompletion(
    current: Iteration,
  ): Promise<Outcome<{ result: ModelOutcome; completion: DurableEvidence }, Failure>> {
    const pending = required(current.pending, 'pending call')
    const received = await receivedOf(pending)
    if ('failure' in received) return received
    if (received.ok === null)
      return fail({
        kind: 'unavailable',
        owner: 'agentJournal',
        diagnostic: 'original received result not available',
      })
    const { material: source, ...expected } = received.ok
    const material = await ports.materials.read({ ...access, source })
    if ('failure' in material) return material
    const delivery = readModelDeliveryMaterial(access, material.ok, expected)
    if (!delivery || delivery.kind !== 'result')
      return fail({
        kind: 'invalid',
        field: 'received.material',
        reason: 'invalid schema or original binding',
      })
    const call = invocationParts(pending.reference, access.tenant).call
    const result = consumeModelResult([execution, current.step], {
      produced: {
        producer: { kind: 'model', call },
        version: delivery.key.result,
        delivery: null,
        source: delivery.settlement.source,
      },
      settlement: delivery.settlement,
      parts: delivery.parts,
    })
    return 'failure' in result ? result : succeed({ result: result.ok, completion: source })
  }

  function callsAfterConsumedNoReply(read: ExecutionSnapshot): readonly PendingCall[] {
    const current = iteration
    if (current?.result?.kind !== 'no-reply' || current.pending === null)
      return read.checkpoint.calls
    const pending = current.pending
    return read.checkpoint.calls.filter(
      call =>
        call.kind !== 'model' ||
        call.consumption !== pending.consumption ||
        call.reference !== pending.reference,
    )
  }

  function producerWait(node: 'M1' | 'M6', pending: PendingCall) {
    waitingAt = node
    recheckDependency = null
    waits = [{ kind: 'producer', pending }]
    return step('wait', null)
  }

  function modelWait(node: LoopNode, failure: M.ModelFailure) {
    const converted = modelFailure(node, failure)
    return failure.kind === 'unavailable' || failure.kind === 'commit-unknown'
      ? waitFor(node, converted, async () => {
          const pending = required(required(iteration, 'iteration').pending, 'pending call')
          const read = await ports.models.calls.inspect({
            ...access,
            reference: pending.reference,
          })
          return 'failure' in read ? fail(modelFailure(node, read.failure)) : read
        })
      : fail(converted)
  }

  /** E2: the frame takes the position of the latest snapshot; an open state also its kind. */
  function takeLatestPosition(read: ExecutionSnapshot): void {
    checkpoint = read.checkpoint
    revision = read.revision
    if (read.state.kind !== 'ended' && read.state.kind !== 'waiting') state = read.state
  }

  /** The snapshot with the commit this frame left unknown among its unresolved operations. */
  function withPendingCommit(read: ExecutionSnapshot): ExecutionSnapshot {
    const unresolved = read.unresolved
    return pendingCommit === null || unresolved.includes(pendingCommit.operation)
      ? read
      : { ...read, unresolved: [...unresolved, pendingCommit.operation] }
  }

  async function currentAttachment(): Promise<Outcome<void, Failure>> {
    const read = await load()
    if ('failure' in read) return read
    if (advancementOf(read.ok).kind !== 'current') return fail({ kind: 'stale-advance' })
    if (cancellationOf(read.ok) !== undefined) return fail({ kind: 'stale-advance' })
    revision = read.ok.revision
    checkpoint = read.ok.checkpoint
    return succeed(undefined)
  }

  // ------------------------------------------------------------------------------------------
  // settle: F1, F2, F3, F4 (F0 is stage 5; extension evaluation is stage 3)

  /**
   * The per-call interrupt command F0 derives from the cancellation for one foreground call, with
   * the stage its control operation is derived under. A Tool intent without a reference names no
   * call: it cannot be interrupted, stays unresolved and nothing is sent.
   */
  function cancelInterrupt(
    control: ControlRecord,
    pending: PendingCall,
  ): Readonly<{ stage: string; command: ExecutionControl }> | null {
    const reason = control.stages.accepted.source
    if (pending.kind === 'model') {
      const call = invocationParts(pending.reference, access.tenant).call
      return { stage: `interrupt/${call}`, command: { kind: 'interrupt-model', call, reason } }
    }
    if (pending.association !== 'associated') return null
    const call = toolCallOf(access, pending)
    return { stage: `interrupt-tool/${call}`, command: { kind: 'interrupt-tool', call, reason } }
  }

  /**
   * F0 for one foreground Model or Tool call: a per-call interrupt control derived from the
   * cancellation, accepted by the Journal on the call's own reference and advanced like any
   * control of its kind.
   */
  async function interruptForCancel(
    control: ControlRecord,
    pending: PendingCall,
  ): Promise<Outcome<void, Failure>> {
    const interrupt = cancelInterrupt(control, pending)
    if (interrupt === null) return succeed(undefined)
    const operation = controlOperation(execution, control.operation, interrupt.stage)
    const accepted = await ports.journal.control({
      ...access,
      execution,
      operation,
      command: interrupt.command,
    })
    if ('failure' in accepted) return accepted
    return advanceControl(ports, access, execution, operation)
  }

  /** A refused settlement commit: a changed or unknown answer is reconciled at R0. */
  function refusedSettlement(node: 'F1' | 'F2', failure: Failure): Outcome<Step, Failure> {
    if (failure.kind === 'changed') cancellationChanged = true
    if (failure.kind === 'commit-unknown') pendingCommit = { operation: failure.operation, node }
    return failure.kind === 'changed' || failure.kind === 'commit-unknown'
      ? step('reconcile', null)
      : fail(failure)
  }

  /**
   * F1 under an effective cancellation: the installation the Journal reads is the only source of
   * the route. An author candidate of the same cancellation migrates; any other is established.
   */
  async function fixCancellation(
    latest: ExecutionSnapshot,
    cancel: ControlRecord,
  ): Promise<Outcome<Step, Failure>> {
    const readInstallation = ports.journal.readCancellationInstallation
    if (readInstallation === undefined)
      return fail({
        kind: 'unavailable',
        owner: 'agentJournal',
        diagnostic: 'cancellation installation read is unavailable',
      })
    const installation = await readInstallation({ ...access, execution })
    if ('failure' in installation) return installation
    const current = latest.settlement.candidate
    const route = latest.settlement.route
    if (current?.conclusion.kind === 'cancelled' && route?.kind === 'cancellation')
      return step('fixed', null)
    const authorization = {
      kind: 'cancel' as const,
      control: cancel.operation,
      source: cancel.stages.accepted.source,
    }
    const common = {
      ...access,
      execution,
      authorization,
      expected: latest.revision,
      installation: installation.ok,
    }
    const settled = await ports.journal.commitSettlement(
      current?.conclusion.kind === 'cancelled' && route?.kind === 'author'
        ? {
            ...common,
            operation: journalOperation('F1', 'cancel-migrate', latest.revision),
            kind: 'migrate-cancellation',
            candidate: current.candidate,
            originalRoute: route.record,
            priorExcluded: null,
          }
        : {
            ...common,
            operation: journalOperation('F1', 'cancel-establish', latest.revision),
            kind: 'establish-cancellation',
            predecessor: current?.candidate ?? null,
          },
    )
    return 'failure' in settled ? refusedSettlement('F1', settled.failure) : step('fixed', null)
  }

  /** The authorization of the terminal: the effective cancellation, or the current advance. */
  function finishAuthorization(read: ExecutionSnapshot): FinishAuthorization {
    const cancel = cancellationOf(read)
    return cancel === undefined
      ? { kind: 'advancement', authority: required(authority, 'authority') }
      : { kind: 'cancel', control: cancel.operation, source: cancel.stages.accepted.source }
  }

  /**
   * F3: prepareFinish issues the obligations of the candidate. A changed or unknown answer is
   * the R0 step to take; `null` means the list is issued and tryFinish follows.
   */
  async function issueObligations(
    before: ExecutionSnapshot,
    candidate: Parameters<typeof ports.journal.prepareFinish>[0]['candidate'],
    authorization: FinishAuthorization,
  ): Promise<Outcome<Outcome<Step, Failure> | null, Failure>> {
    const prepared = await ports.journal.prepareFinish({
      ...access,
      execution,
      operation: journalOperation('F3', 'prepare', before.revision),
      authorization,
      expected: before.revision,
      candidate,
    })
    if ('ok' in prepared) {
      reissueObligations = false
      return succeed(null)
    }
    if (prepared.failure.kind === 'changed') {
      finishRefused = true
      return succeed(step('reconcile', null))
    }
    if (prepared.failure.kind !== 'commit-unknown') return prepared
    pendingCommit = { operation: prepared.failure.operation, node: 'F3' }
    return succeed(step('reconcile', null))
  }

  /** F3: where the answer of tryFinish goes; only `ended` is the terminal. */
  function finishOutcome(
    finished: Awaited<ReturnType<typeof ports.journal.tryFinish>>,
  ): Outcome<Step, Failure> {
    if ('failure' in finished) {
      if (finished.failure.kind === 'unavailable') {
        // The facts, qualification or closure could not be determined (SPEC "条件终结" result
        // table): nothing was written; R0 waits on the dependency and the terminal is retried.
        finishUnavailable = finished.failure
        finishRefused = true
        return step('reconcile', null)
      }
      if (finished.failure.kind !== 'commit-unknown') return finished
      pendingCommit = { operation: finished.failure.operation, node: 'F3' }
      return step('reconcile', null)
    }
    if (finished.ok.kind !== 'ended') {
      // A changed projection or a stale list is issued again after the re-evaluation.
      if (finished.ok.kind === 'changed') reissueObligations = true
      finishRefused = true
      return step('reconcile', null)
    }
    revision = finished.ok.receipt.revision
    return step('ended', null)
  }

  const settle = {
    async F0() {
      const read = await load()
      if ('failure' in read) return read
      if (read.ok.state.kind === 'ended') return step('terminal', null)
      const control = cancellationOf(read.ok)
      if (control === undefined) return fail(defect('F0 without effective cancellation'))
      const revoked = await establishCancellation(ports.journal, access, execution, control)
      if ('failure' in revoked) return revoked
      for (const pending of read.ok.checkpoint.calls) {
        const interrupted = await interruptForCancel(control, pending)
        if ('failure' in interrupted) return interrupted
      }
      return step('cancelled', null)
    },
    /** F1: the candidate of the evaluator is fixed with the current input boundary. */
    async F1() {
      const latest = await load()
      if ('failure' in latest) return latest
      const cancel = cancellationOf(latest.ok)
      if (cancel !== undefined) return fixCancellation(latest.ok, cancel)
      const at = required(checkpoint, 'checkpoint')
      const preparation = at.requestPreparation
      // Derive only from the committed preparation. An unknown I1 commit therefore follows the
      // same F1 route after committed reconciliation, or prepares again only when excluded.
      if (
        preparation?.kind === 'cannot-fit' &&
        (decided?.kind !== 'try-finish' || decided.failure?.kind !== 'cannot-fit')
      ) {
        const instant = await ports.clock.now()
        if ('failure' in instant) return instant
        decided = cannotFit(at.step, preparation, instant.ok)
      }
      // Keep the same candidate, including its timestamp, if an F1 commit is excluded.
      const next = required(decided, 'decision')
      if (next.kind !== 'try-finish') throw new Error(`coordinator defect: F1 after ${next.kind}`)
      const read = latest
      // A newer input cannot be folded into a candidate made before it was accepted.
      if (read.ok.revision !== revision) {
        finishRefused = true
        return step('reconcile', null)
      }
      // The business content of the candidate (SPEC "条件终结" 1): the origin is the execution
      // history the evaluation read, the conditions are the record of the conditions read. The
      // Journal establishes the candidate, its author route and the FinishIntent projection.
      const finish: FinishCandidateContent = {
        origin: read.ok.history,
        conclusion: next.conclusion,
        failure: next.failure,
        inputWatermark: read.ok.inputWatermark,
        conditions: required(facts, 'facts').conditions.source,
      }
      return step('fixed', {
        state: { kind: 'settling' },
        finish,
        ...(next.failure?.kind === 'no-reply' ? { checkpoint: { calls: [] } } : {}),
      })
    },
    /**
     * F2: no extension is adopted at before_terminal, so the passage completes with this plain
     * settling commit; the Journal sets the proof of the author route from it (SPEC "条件终结" 3).
     */
    async F2() {
      const read = await load()
      if ('failure' in read) return read
      const control = cancellationOf(read.ok)
      const candidate = read.ok.settlement.candidate
      const route = read.ok.settlement.route
      if (control !== undefined && candidate !== null && route?.kind === 'cancellation') {
        const judged = await ports.journal.commitSettlement({
          ...access,
          execution,
          operation: journalOperation('F2', 'cancel-judge', read.ok.revision),
          kind: 'judge-cancellation',
          authorization: {
            kind: 'cancel',
            control: control.operation,
            source: control.stages.accepted.source,
          },
          expected: read.ok.revision,
          installation: route.installation,
          candidate: candidate.candidate,
          route: route.record,
        })
        return 'failure' in judged ? refusedSettlement('F2', judged.failure) : step('proceed', null)
      }
      return step('proceed', { state: { kind: 'settling' } })
    },
    /**
     * F3: prepareFinish unless the Journal already projects a list for this candidate, load the
     * complete revision, then tryFinish, the one terminal commit. A list that tryFinish answered
     * `changed` for is issued again on the next pass.
     */
    async F3() {
      const before = await load()
      if ('failure' in before) return before
      const candidate = before.ok.settlement.candidate
      if (before.ok.state.kind !== 'settling' || candidate === null) {
        finishRefused = true
        return step('reconcile', null)
      }
      const authorization = finishAuthorization(before.ok)
      if (before.ok.state.intent.obligations === null || reissueObligations) {
        const issued = await issueObligations(before.ok, candidate.candidate, authorization)
        if ('failure' in issued) return issued
        if (issued.ok !== null) return issued.ok
      }
      const read = await load()
      if ('failure' in read) return read
      if (read.ok.state.kind !== 'settling') {
        finishRefused = true
        return step('reconcile', null)
      }
      revision = read.ok.revision
      const finished = await ports.journal.tryFinish({
        ...access,
        execution,
        operation: journalOperation('F3', 'finish', revision),
        authorization,
        expected: revision,
        intent: read.ok.state.intent,
      })
      return finishOutcome(finished)
    },
    /** F4: recognize the fixed terminal ledger. Pending observations stay with the long-lived
     * Journal; extension evaluation is stage 3 and no completion is invented here. */
    async F4() {
      const read = await load()
      if ('failure' in read) return read
      if (read.ok.state.kind !== 'ended') return fail(defect('F4 without a committed terminal'))
      return step('observed', null)
    },
  } satisfies Partial<Record<LoopNode, Handler>>

  function cannotFit(
    of: StepId,
    preparation: Extract<Preparation, { kind: 'cannot-fit' }>,
    at: AgentInstant,
  ): Extract<Next, { kind: 'try-finish' }> {
    const failure: FailureCandidate = {
      kind: 'cannot-fit',
      step: of,
      at,
      source: preparation.source,
      reason: preparation.reason,
      context: preparation.source,
    }
    const cause = agentEvidence(`${execution}/${of}/cannot-fit`, failure)
    return { kind: 'try-finish', conclusion: { kind: 'fail', cause }, failure }
  }

  const handlers: Partial<Record<LoopNode, Handler>> = {
    ...admitMessage,
    ...runExecutionNodes,
    ...runIter,
    ...runTools,
    ...prepareRequest,
    ...callModel,
    ...settle,
  }

  return {
    async accept() {
      const ran = await drive('U0', 'E1')
      if ('failure' in ran) return ran
      return succeed(required(authority, 'authority'))
    },
    async continueExecution(original) {
      return exclusive('E1', async () => {
        authority = original
        const read = await load()
        if ('failure' in read) return fail({ node: 'E1', failure: read.failure })
        if (!sameAuthority(read.ok.executionAttachment, original))
          return fail({ node: 'E1', failure: { kind: 'stale-advance' } })
        const at = read.ok.checkpoint
        const ready = at.requestPreparation
        // I2 has the ready request and step, but M0 has not saved an intent yet. The same identity
        // rule as normal I2 reconstructs its frame. Unknown Journal operations need R0, not this cut.
        const beforeIntent =
          at.position === 'I2' && at.calls.length === 0 && read.ok.unresolved.length === 0
        const pending =
          beforeIntent && ready?.kind === 'ready' ? mainPending(at.step, ready) : at.calls[0]
        if (
          (!beforeIntent && !['M6', 'M3', 'M4', 'M5', 'I3'].includes(at.position)) ||
          pending?.kind !== 'model' ||
          pending.purpose !== 'main' ||
          ready?.kind !== 'ready' ||
          !sameEvidence(pending.fixed, ready.source)
        )
          return fail({ node: 'E4', failure: { kind: 'unsupported' } })
        revision = read.ok.revision
        checkpoint = at
        if (beforeIntent) excludedNode = 'I2'
        // No input batch is reconstructed: only its ID is saved. The call path never prepares again.
        iteration = {
          step: at.step,
          batch: null,
          action: pending.action,
          consumption: pending.consumption,
          position: pending.position,
          conditions: null,
          selected: null,
          context: null,
          preparation: ready,
          ready,
          pending,
          settlement: null,
          result: null,
          admission: 'unknown',
        }
        // The first available recovery snapshot already owns these unknown identities. Query
        // them before another fallible read can take the normal E1 -> W0 route.
        reconciliationOperations = read.ok.unresolved
        const ran = await drive(
          pendingCommit !== null || reconciliationOperations.length > 0 ? 'R0' : 'E1',
          null,
        )
        return 'failure' in ran ? ran : succeed(undefined)
      })
    },
    async waitForWake(input) {
      if (activeDrive || activeWait) return fail({ node: 'W0', failure: { kind: 'busy' } })
      if (!yieldedWait && pendingCommit === null && reconciliationOperations.length === 0)
        return succeed('stopped')
      const operations = [
        ...new Set([
          ...reconciliationOperations,
          ...(pendingCommit === null ? [] : [pendingCommit.operation]),
        ]),
      ]
      activeWait = true
      try {
        const result = await waitForExecutionChange({
          ports,
          access,
          execution,
          expected: required(revision, 'revision'),
          operations,
          waits: operations.length > 0 ? [] : waits,
          recheck: operations.length > 0 ? null : recheckDependency,
          // The position in hand starts the observation, so the wait reads the execution once. A
          // position at another revision than `revision` wakes at once, as a baseline read would.
          held,
          position: waitingAt,
          ...input,
        })
        return 'failure' in result ? fail({ node: 'W0', failure: result.failure }) : result
      } catch (error) {
        return fail({ node: 'W0', failure: defect(diagnosticOf(error)) })
      } finally {
        activeWait = false
      }
    },
    async runExecution() {
      return exclusive('E1', async () => {
        waking = yieldedWait
        yieldedWait = false
        const ran = await drive(
          pendingCommit !== null || reconciliationOperations.length > 0 ? 'R0' : 'E1',
          null,
        )
        if ('failure' in ran) return ran
        return succeed(undefined)
      })
    },
  }
}
