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
// Dependency waits and original writes retain their own continuations. Determinate node failures
// keep the first fault and enter F1. Private provenance distinguishes local defects and unsupported
// paths from an unavailable dependency. Only the Journal's ended result releases the execution.
import type { ContentBlock } from '@omne-harness/content-block'
import type {
  AcceptedInput,
  Action,
  ActionBatch,
  ActionSlot,
  ActionToolCall,
  Access,
  AgentCheckpoint,
  AgentEvaluator,
  AgentEventBody,
  AgentExecutionId,
  AgentInstant,
  AgentOperationId,
  Authority,
  CallerCommit,
  CommandReceipt,
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
import { attemptWrite, originalJournal, type OriginalWrite } from './original-write.ts'
import { localFailure, nodeFailureCategory, type NodeFailureCategory } from './node-failure.ts'
import { answeredByPort, notingPorts } from './port-answers.ts'
import { consumeModelResult, noReplyReason, type ModelOutcome } from './model-result.ts'
import { readModelDeliveryMaterial } from '../receiving-material.ts'
import {
  advanceAcceptedControl,
  cancellationOf,
  controlOperation,
  establishCancellation,
} from '../control.ts'
import {
  actionOf,
  admitToolAction,
  candidateDigest,
  answeredCandidate,
  deniedCandidate,
  deniedForUnavailableAdmission,
  deniedSlot,
  preserveAllowedRequest,
  sentToolRequest,
  toolCallOf,
  toolIntentOf,
  toolProduced,
  toolReceivedOf,
  toolCallAnswerOf,
  toolResultCandidate,
  type AssociatedToolCall,
  type ToolAdmission,
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
  | 'entries'
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
  /**
   * F4 found the committed terminal: the conclusion and the finish candidate it ended with (SPEC
   * 「以失败终结」). Called at most once per coordinator; absent, nobody is told.
   */
  ended?(
    state: Extract<ExecutionState, { kind: 'ended' }>,
    candidate: FailureCandidate | null,
  ): void
  toolConcurrency?: number
  /**
   * The most steps this execution takes (R2-D221, the M2 fallback for the loop judgment of wave 3).
   * When E4 or I8 would open the step after the last one, the execution fails with a `guard`
   * candidate instead. Absent: no limit, which only a coordinator built directly by a test gets;
   * the runtime always passes the configured or default value.
   */
  maxRunSteps?: number
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
  accept(confirmedOpen?: CommandReceipt): Promise<Outcome<Authority, Halted>>
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
type Movement = Readonly<{ to: LoopNode | null; yielded: boolean }>

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
  return localFailure('invariant', { kind: 'unavailable', owner: DEFECT_OWNER, diagnostic })
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
  return localFailure('unsupported-path', {
    kind: 'unavailable',
    owner: AGENT_OWNER,
    diagnostic: `${node}: ${what} is not handled until ${card}`,
  })
}

/** The Model answer that the Loop waits on: the Model runtime did not give the step its answer yet. */
function modelUnavailable(
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

/**
 * A definite refusal of one Model call (R2-D237): the same request is refused again, so the Loop
 * does not wait on it. At M6 it is the `model-refused` failure candidate.
 */
type ModelRefusal = Extract<FailureCandidate, { kind: 'model-refused' }>['failure']

function modelRefusal(failure: M.ModelFailure): ModelRefusal | null {
  switch (failure.kind) {
    case 'denied':
    case 'invalid':
    case 'unsupported':
    case 'capacity':
      return failure
    default:
      return null
  }
}

/**
 * A Model failure, kept as what it is (R2-D237): a refusal keeps its kind and its fields where the
 * Agent Failure has them, and a capacity refusal is an invalid capacity; the other answers are the
 * Model runtime not giving the step its answer.
 */
function modelFailure(node: LoopNode, failure: M.ModelFailure): Failure {
  switch (failure.kind) {
    case 'denied':
      return { kind: 'denied', action: failure.action }
    case 'invalid':
      return { kind: 'invalid', field: failure.field, reason: failure.reason }
    case 'unsupported':
      return { kind: 'unsupported' }
    case 'capacity':
      return { kind: 'invalid', field: 'capacity', reason: 'refused by the Model capacity' }
    default:
      return modelUnavailable(node, failure)
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

/**
 * The node of a saved compaction or request preparation, or null when neither is saved. The
 * checkpoint keeps only `needs-compaction` and `cannot-fit` (R2-D292): an assembled or ready
 * preparation lived in memory, so I1, P0, P1 and I2 recover by preparing again at I1.
 */
function preparationRecovery(at: AgentCheckpoint): Recovery | null {
  if (at.compaction !== null) {
    const ended = at.compaction.ended
    return recoveryTarget(ended === 'committed' ? 'I1' : ended === 'failed' ? 'F1' : 'C1')
  }
  const prepared = at.requestPreparation
  if (prepared === null) return null
  if (prepared.kind === 'cannot-fit') return succeed('F1')
  return recoveryTarget('C0')
}

/** The positions before the final request record: no fact of them outlives the process. */
const BEFORE_RECORD: readonly string[] = ['I1', 'P0', 'P1', 'I2']

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
  if (at.inputBatch !== null || BEFORE_RECORD.includes(at.position)) return succeed('I1')
  if (['E4', 'I0', 'I8'].includes(at.position)) return succeed('evaluate')
  return recoveryTarget(at.position)
}

/** The ports whose answers are a dependency's (all of `LoopPorts` but `toolRequests`). */
const DEPENDENCY_PORTS = [
  'journal',
  'entries',
  'models',
  'tools',
  'conditions',
  'requests',
  'selection',
  'modelContext',
  'admission',
  'handoff',
  'materials',
  'clock',
] as const satisfies readonly Exclude<keyof LoopPorts<unknown>, 'toolRequests'>[]

export function createExecutionCoordinator<P>(entry: ExecutionEntry<P>): ExecutionCoordinator {
  const { binding, evaluator, execution } = entry
  // The answers of the dependency ports are noted: an `unavailable` that a dependency answered
  // is a wait (SPEC "依赖不可用时的等待"; agent-host-local SPEC 运行失败: a dependency that is
  // unavailable now does not stop the drive). A failure that the coordinator or the evaluator made
  // is not a port's. `toolRequests` is the trusted in-process request source, not a dependency.
  // A port is wrapped when it is read, as the coordinator read the ports before: a caller may give
  // only the ports its executions use.
  const ports: LoopPorts<P> = { ...entry.ports }
  for (const key of DEPENDENCY_PORTS)
    if (key in ports)
      Object.defineProperty(ports, key, {
        enumerable: true,
        get: () => notingPorts(entry.ports[key]),
      })
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
  let fault: Readonly<{
    node: string
    category: NodeFailureCategory
    failureKind: Failure['kind']
    step: StepId | null
    history: DurableEvidence | null
  }> | null = null
  let faultDecision: Extract<Next, { kind: 'try-finish' }> | null = null
  let faultCandidate: FinishCandidateContent | null = null
  let candidate: Candidate | null = null
  // The admission in progress: the internal request P fixed and the outcome `prepare` returned.
  let pendingHandoff: PendingHandoff | null = null
  let outcome: HandoffOutcome | null = null
  // The request whose last `prepare` in this process answered unavailable. That prepare took no
  // effect, so the wait comes back to prepare the same request again (SPEC "依赖不可用时的等待":
  // the same operation), not to the lookup of a receipt lost with a process.
  let unpreparedHandoff: PendingHandoff | null = null
  // The acceptance of the external input that U0 admitted, which E0 hands to `open`.
  let acceptance: OriginalInputAcceptance | null = null
  let iteration: Iteration | null = null
  let pendingCommit: Readonly<{
    operation: AgentOperationId
    node: LoopNode
    original: OriginalWrite<P>
  }> | null = null
  let originalOpen: Parameters<typeof ports.journal.open>[0] | null = null
  let excludedNode: LoopNode | null = null
  let finishAttemptRevision: ExecutionRevision | null = null
  let finishRefused = false
  // The unavailable answer of the last tryFinish: R0 waits on it as a dependency (loop-algorithm
  // F3 row: unavailable goes to R0; R0 waits while the facts are undetermined).
  let finishUnavailable: Extract<Failure, { kind: 'unavailable' }> | null = null
  // Whether the wait R0 entered is the memory wait of F3 (agent README, loop-algorithm R0 row): W0
  // writes nothing for it, and the wake retries the terminal through E1.
  let finishWait = false
  // Whether F4 already told `entry.ended` of the terminal: one report per coordinator.
  let endReported = false
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
  // The actions whose intent this process saved and that Tool has so far answered only with an
  // unavailable rejection: no attempt was accepted and none is unknown, so a later rejection still
  // gets its denied slot (SPEC "依赖不可用时的等待", Tool 受理). In process only: after a restart
  // the history of the saved intent is not known here.
  const unacceptedToolActions = new Set<ActionId>()
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

  function journalAt(node: LoopNode) {
    return originalJournal(ports.journal, async (original, invoke) => {
      if (pendingCommit !== null)
        return fail({ kind: 'commit-unknown', operation: pendingCommit.operation })
      pendingCommit = { operation: original.input.operation, node, original }
      const result = await attemptWrite(original, invoke)
      if ('ok' in result || result.failure.kind !== 'commit-unknown') pendingCommit = null
      return result
    })
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
    const next: AgentCheckpoint = {
      ...base,
      ...write.checkpoint,
      replyAdmissionRead,
      position: to,
    }
    const nextState = write.state ?? state
    const committed = await journalAt(node).commit({
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
    // An unavailable write goes on to failedNode, which waits on the Journal like any port.
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
  async function move(at: LoopNode, ran: Step): Promise<Outcome<Movement, Failure>> {
    const to = successor(at, ran.on)
    if (to === undefined) return fail(defect(`${at} has no transition on ${ran.on}`))
    if (ran.commit !== null && to !== null) {
      const committed = await commit(at, to, ran.commit)
      if ('failure' in committed) {
        const next = await afterRefusedCommit(at, committed.failure)
        return 'failure' in next ? next : succeed({ to: next.ok, yielded: false })
      }
    }
    return succeed({
      to,
      yielded: at === 'W0' && (ran.on === 'saved-wait' || ran.on === 'unsaved-wait'),
    })
  }

  const closingNodes: readonly LoopNode[] = ['F0', 'F1', 'F2', 'F3', 'F4', 'O0', 'E9', 'R0', 'W0']

  /**
   * The wait of a port that answered unavailable (SPEC "依赖不可用时的等待"): a dependency that is
   * not available now, read or write alike. An unavailable write took no effect (agent-contract
   * "提交参加者协议"), so the same step is written again. A non-closing node waits in W0 and comes
   * back through E1. A closing node waits in the process, like the memory wait of F1 and F3: a
   * waiting commit would change the state of a settling execution, and the storage is most likely
   * still full.
   */
  function waitOnUnavailable(
    at: LoopNode,
    failure: Extract<Failure, { kind: 'unavailable' }>,
  ): Outcome<LoopNode, Failure> {
    // D5 5.1: the Journal lost the material of the prefix this commit carried. Drop the
    // in-process prefix; the wake reads from the saved one again.
    if (failure.diagnostic.startsWith('missing-basis')) readPrefix = null
    // The wait wakes at the check time. The event cursor in hand may be behind a Journal that moved
    // while it could not be read; observing from it would wake at once and spin. The next load
    // takes a fresh cursor.
    held = null
    // W0 saves no wait over an unresolved original operation (it would invalidate it), so that
    // wait, like the one of a closing node or of a fixed fault, stays in the process.
    const unresolved =
      pendingCommit !== null ||
      reconciliationOperations.length > 0 ||
      (snapshot?.unresolved.length ?? 0) > 0
    if (fault !== null || unresolved || closingNodes.includes(at)) return waitForFault(at, failure)
    waitFor(at, failure, null)
    return succeed('W0')
  }

  function waitForFault(at: LoopNode, failure: Extract<Failure, { kind: 'unavailable' }>) {
    finishWait = true
    waitFor(at, failure, null)
    return succeed<LoopNode>('W0')
  }

  async function failedNode(at: LoopNode, failure: Failure): Promise<Outcome<LoopNode, Failure>> {
    if (pendingCommit !== null)
      return nodeFailureCategory(failure) === null
        ? fail(failure)
        : fail({ kind: 'commit-unknown', operation: pendingCommit.operation })
    // A port's unavailable is a dependency wait once the execution is open. An unavailable that
    // the coordinator or the evaluator made is not a port's answer and keeps its meaning below.
    // Before the open there is no execution to wait in: the caller of invoke gets the answer.
    if (failure.kind === 'unavailable' && answeredByPort(failure) && authority !== null)
      return waitOnUnavailable(at, failure)
    if (failure.kind === 'stale-advance' || failure.kind === 'denied') {
      const latest = await load()
      if ('ok' in latest) {
        takeLatestPosition(latest.ok)
        if (latest.ok.state.kind === 'ended') return succeed('F4')
        if (cancellationOf(latest.ok) !== undefined) return succeed('F0')
      }
    }
    if (fault !== null) return fail(failure)
    const category = nodeFailureCategory(failure)
    if (authority === null || category === null || closingNodes.includes(at)) return fail(failure)
    fault = {
      node: at,
      category,
      failureKind: failure.kind,
      step: checkpoint?.step ?? null,
      history: snapshot?.history ?? null,
    }
    return succeed('F1')
  }

  async function faultRoute(): Promise<Outcome<LoopNode, Failure>> {
    const read = await load()
    if ('failure' in read) return read
    takeLatestPosition(read.ok)
    if (read.ok.state.kind === 'ended') return succeed('F4')
    if (read.ok.unresolved.length > 0) return succeed('R0')
    if (cancellationOf(read.ok) !== undefined) return succeed('F0')
    if (advancementOf(read.ok).kind !== 'current') return fail({ kind: 'stale-advance' })
    if (read.ok.state.kind === 'settling')
      return succeed(read.ok.checkpoint.position === 'F3' ? 'F3' : 'F2')
    return succeed('F1')
  }

  async function advanceNode(at: LoopNode): Promise<Outcome<Movement, Failure>> {
    try {
      if (fault !== null && !closingNodes.includes(at)) {
        const route = await faultRoute()
        return 'failure' in route ? route : succeed({ to: route.ok, yielded: false })
      }
      const handler: Handler | undefined = handlers[at]
      if (handler === undefined) return fail(defect(`${at} has no handler`))
      const ran = await handler()
      return 'failure' in ran ? ran : await move(at, ran.ok)
    } catch (error) {
      return fail(localFailure('exception', defect(diagnosticOf(error))))
    }
  }

  /**
   * Runs nodes from `from` until `until` is the next node or the Loop ends. Each handler names its
   * outcome and the table supplies its successor. A fixed fault restricts all later passes to
   * recognition, cancellation, settlement and waiting.
   */
  async function drive(
    from: LoopNode,
    until: LoopNode | null,
  ): Promise<Outcome<LoopNode | null, Halted>> {
    let node: LoopNode | null = from
    while (node !== null && node !== until) {
      const at: LoopNode = node
      const moved = await advanceNode(at)
      if ('failure' in moved) {
        const next = await failedNode(at, moved.failure)
        if ('failure' in next) return fail({ node: at, failure: next.failure })
        node = next.ok
        continue
      }
      if (moved.ok.yielded) return succeed(moved.ok.to)
      node = moved.ok.to
    }
    return succeed(node)
  }

  // ------------------------------------------------------------------------------------------
  // Reads shared by E1, E2, I8 and F1

  async function load(): Promise<Outcome<ExecutionSnapshot, Failure>> {
    const loaded = await ports.journal.load({ ...access, execution })
    if ('failure' in loaded) return loaded
    snapshot = loaded.ok
    const saved = loaded.ok.settlement.candidate
    if (fault === null && saved?.failure?.kind === 'node-failed') {
      const failure = saved.failure
      fault = {
        node: failure.node,
        category: failure.category,
        failureKind: failure.failureKind,
        step: failure.step,
        history: null,
      }
      faultDecision = { kind: 'try-finish', conclusion: saved.conclusion, failure }
      faultCandidate = {
        origin: saved.origin,
        conclusion: saved.conclusion,
        failure,
        inputWatermark: saved.inputWatermark,
        conditions: saved.conditions,
      }
    }
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
  async function evaluate(node: 'E4' | 'I8', at: LoopFacts): Promise<Outcome<Step, Failure>> {
    const evaluated = evaluator.next(at)
    if ('failure' in evaluated) return evaluated
    if (evaluated.ok.kind === 'stop') {
      if (evaluated.ok.reason === 'suspended')
        return waitFor(
          node,
          { kind: 'unavailable', owner: AGENT_OWNER, diagnostic: 'execution is suspended' },
          null,
        )
      return fail({ kind: 'stale-advance' })
    }
    let next = evaluated.ok
    if (next.kind === 'take-inputs') {
      const limited = await stepLimit(at.checkpoint.step)
      if (limited !== null && 'failure' in limited) return limited
      if (limited !== null) next = limited.ok
    }
    decided = next
    if (next.kind === 'wait') {
      recheckDependency = null
      waits = next.waiting
      waitingAt = node
    }
    return step(next.kind, null)
  }

  /**
   * The step limit (R2-D221): after `limit` steps, the next step is not opened. Like pi-agent-core's
   * `finishTurn` returning `end`, the check sits after a completed step and before the next Model
   * request, and it never cuts a step short. Unlike a normal end, the execution does not complete:
   * the candidate is a failure of kind `guard` at level 3, whose basis names the limit and the step
   * count, so the end reason says that the limit stopped the work. Null: the step may open.
   */
  async function stepLimit(
    of: StepId,
  ): Promise<Outcome<Extract<Next, { kind: 'try-finish' }>, Failure> | null> {
    const limit = entry.maxRunSteps
    const taken = ordinalOf(of)
    if (limit === undefined || taken < limit) return null
    const instant = await ports.clock.now()
    if ('failure' in instant) return instant
    const basis = agentEvidence(`${execution}/${of}/max-run-steps`, { maxRunSteps: limit, taken })
    const failure: FailureCandidate = {
      kind: 'guard',
      level: 3,
      basis,
      step: of,
      at: instant.ok,
      source: basis,
    }
    const cause = agentEvidence(`${execution}/${of}/guard`, failure)
    return succeed({ kind: 'try-finish', conclusion: { kind: 'fail', cause }, failure })
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
        const inputEntry = {
          kind: 'invoke' as const,
          operation: entry.operation,
          execution,
          initial: entry.initial,
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
      const fixed = await prepareHandoff(request)
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
      if (outcome === null && unpreparedHandoff !== request) {
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
      }
      if (outcome === null) {
        const fixed = await prepareHandoff(request)
        if ('failure' in fixed) return fixed
        outcome = fixed.ok
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
      if (queried.ok.kind === 'rejected' && own.original.method === 'recordControl') {
        pendingCommit = null
        return fail(queried.ok.failure)
      }
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
      if (originalOpen === null) {
        const initial = evaluator.initial({ definition: binding.definition, step: stepOf(0) })
        if ('failure' in initial) return initial
        originalOpen = {
          ...access,
          execution,
          operation: entry.operation,
          original: required(acceptance, 'acceptance'),
          runtime: runtimeContext,
          checkpoint: initial.ok,
        }
      }
      const opened = await journalAt('E0').open(originalOpen)
      if ('failure' in opened) return opened
      authority = opened.ok.authority
      revision = opened.ok.receipt.revision
      checkpoint = originalOpen.checkpoint
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
      if ('failure' in route) return fail(localFailure('unsupported-path', route.failure))
      const to = route.ok
      if (to === 'evaluate')
        return evaluate('E4', { ...required(facts, 'facts'), checkpoint: current })
      if (to === 'I1') {
        const restored = restoredIteration(current)
        if ('failure' in restored) return restored
      }
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
      resumeState = state.kind === 'waiting' ? resumeState : state
      // A wait in memory (an unavailable F3, a closing node, a wait over an unresolved original):
      // no waiting commit, no event, the state stays, and the wake goes through E1 at the check
      // time. It writes nothing, so it cannot invalidate an original conditional operation.
      if (finishWait) {
        finishWait = false
        finishRefused = false
        finishUnavailable = null
        yieldedWait = true
        return step('saved-wait', null)
      }
      // No alternate waiting write may invalidate an original conditional operation.
      const original =
        pendingCommit?.operation ?? reconciliationOperations[0] ?? snapshot?.unresolved[0]
      if (original !== undefined) return fail({ kind: 'commit-unknown', operation: original })
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
        // The wait is not saved: it stays in the process, the execution keeps the state it had
        // before W0, and the check time goes through E1, which comes back here if the Journal is
        // still unavailable. It is not an unknown outcome, so it is not `pendingCommit`.
        if (saved.failure.kind === 'unavailable') {
          yieldedWait = true
          return step('unsaved-wait', null)
        }
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
      if (fault !== null) {
        if (snapshot.checkpoint.passages.some(passage => passage.progress.kind !== 'applied'))
          return fail(notYet('R0', 'a pending passage', '#502 stage 3'))
        if (reissueObligations) {
          finishRefused = false
          return step('reconciled', null)
        }
        return finishRefused ? finishDependencyWait('F3') : step('reconciled', null)
      }
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
      iteration = newIteration(next, at.batch, 0)
      // The input-taken event goes with the commit that fixes the batch and the step.
      return step('taken', {
        checkpoint: {
          step: next,
          inputBatch: at.batch,
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
            ...(result.settlement.termination.kind === 'failed'
              ? { fault: result.settlement.termination.fault }
              : {}),
          }
          decided = {
            kind: 'try-finish',
            conclusion: {
              kind: 'fail',
              cause: agentEvidence(
                `${execution}/${current.step}/${noReplyReason(result.settlement)}`,
                failure,
              ),
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
      const evaluated = await evaluate('I8', current.ok)
      if ('failure' in evaluated) return evaluated
      if (
        read.ok.state.kind === 'settling' &&
        read.ok.revision === finishAttemptRevision &&
        read.ok.settlement.candidate?.conclusion.kind === 'complete' &&
        decided?.kind === 'try-finish' &&
        decided.conclusion.kind === 'complete' &&
        decided.failure === null
      )
        return finishDependencyWait('F3')
      // W0 saves the wait while retaining I8 as the continuation. It does not claim a wakeup.
      return evaluated.ok.on === 'wait'
        ? step('wait', null)
        : step(evaluated.ok.on, { checkpoint: { batch: null }, state: { kind: 'advancing' } })
    },
  } satisfies Partial<Record<LoopNode, Handler>>

  function replaceAction(batch: ActionBatch, action: Action): ActionBatch {
    return {
      ...batch,
      actions: batch.actions.map(item => (item.id === action.id ? action : item)),
    }
  }

  function replaceSlot(batch: ActionBatch, slot: ActionSlot): ActionBatch {
    return {
      ...batch,
      slots: batch.slots.some(item => item.action === slot.action)
        ? batch.slots.map(item => (item.action === slot.action ? slot : item))
        : [...batch.slots, slot],
    }
  }

  /** Every received entry of one consumption, from the entries port of the same Journal. */
  async function receivedOfConsumption(
    consumption: ConsumptionId,
  ): Promise<Outcome<readonly ReceivedEntry[], Failure>> {
    return ports.entries.receivedOf({ ...access, execution, consumption })
  }

  /**
   * The `tool_call` parts of the reply a batch comes from, by call id, read back from the received
   * material of that reply (SPEC "工具执行与结果承接" 10). The batch keeps only the call ids. A
   * material that cannot be read is the failure of the read; a reply without its received entry is
   * `unavailable`, never an empty batch.
   */
  async function batchToolCalls(
    batch: ActionBatch,
  ): Promise<Outcome<ReadonlyMap<string, ActionToolCall>, Failure>> {
    const source = batch.source
    if (source.producer.kind !== 'model')
      return fail(defect('A0: a batch whose source is not a Model reply'))
    const call = source.producer.call
    const step = required(checkpoint, 'checkpoint').step
    const received = await receivedOfConsumption(mainConsumption(execution, step))
    if ('failure' in received) return received
    const found = received.ok.find(
      entry =>
        entry.delivery.producer === 'model' &&
        entry.delivery.key.kind === 'result' &&
        entry.delivery.key.result === source.version &&
        invocationParts(entry.delivery.key.reference, access.tenant).call === call,
    )
    if (found === undefined)
      return fail({
        kind: 'unavailable',
        owner: 'agentJournal',
        diagnostic: 'the received reply of the batch is not available',
      })
    const { material: from, ...expected } = found
    const material = await ports.materials.read({ ...access, source: from })
    if ('failure' in material) return material
    const delivery = readModelDeliveryMaterial(access, material.ok, expected)
    if (!delivery || delivery.kind !== 'result')
      return fail({
        kind: 'invalid',
        field: 'received.material',
        reason: 'invalid schema or original binding',
      })
    const result = consumeModelResult([execution, step], {
      produced: source,
      settlement: delivery.settlement,
      parts: delivery.parts,
    })
    if ('failure' in result) return result
    if (result.ok.kind !== 'reply')
      return fail({ kind: 'invalid', field: 'batch.source', reason: 'not a complete reply' })
    const parts = new Map<string, ActionToolCall>()
    for (const block of result.ok.reply.blocks)
      if (block.kind === 'tool_call') parts.set(block.callId, block)
    return succeed(parts)
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
    action: Action,
  ): Promise<Outcome<ReceivedToolResult | null, Failure>> {
    const pending = toolCall(action)
    if (pending === null) return succeed(null)
    const received = await receivedOfConsumption(pending.consumption)
    if ('failure' in received) return received
    const found = toolReceivedOf(received.ok, pending)
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

  /**
   * `unavailable`: the Tool runtime rejected the invoke because a dependency of it is unavailable
   * now; A2 waits on it and sends the same request again (SPEC "依赖不可用时的等待").
   */
  type Sent = Readonly<{
    batch: ActionBatch
    progressed: boolean
    unavailable?: Extract<Failure, { kind: 'unavailable' }>
  }>

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
    const intent = toolIntentOf(execution, action)
    if ('failure' in intent) return intent
    const pending = intent.ok
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
  /** Q1 and Q2: P prepares the internal request; an unavailable answer is remembered. */
  async function prepareHandoff(request: PendingHandoff) {
    const fixed = await ports.handoff.prepare({
      ...access,
      kind: 'execution',
      request,
      advance: required(authority, 'authority'),
    })
    unpreparedHandoff =
      'failure' in fixed && fixed.failure.kind === 'unavailable' ? request : null
    return fixed
  }

  async function sendAction(batch: ActionBatch, original: Action): Promise<Outcome<Sent, Failure>> {
    if (original.judgment.kind !== 'allowed') return succeed({ batch, progressed: false })
    const fresh = original.call === null
    // No earlier attempt was accepted or left unknown: this process saved the intent, and every
    // invoke since answered an unavailable rejection.
    const unaccepted = fresh || unacceptedToolActions.has(original.id)
    let next = batch
    let action = original
    if (fresh) {
      const saved = await saveToolIntent(batch, original)
      if ('failure' in saved) return saved
      ;({ batch: next, action } = saved.ok)
    }
    const pending = required(action.call, 'tool intent')
    if (batch.barrier.kind !== 'open') return fail(defect('A2 with a barrier that is not open'))
    const request = await sentToolRequest(ports, access, execution, action, batch.barrier.evidence)
    if ('failure' in request) return request
    // The last check before the Tool is asked: no invoke under a revoked advance.
    const eligible = await currentAttachment()
    if ('failure' in eligible) return eligible
    let result: Awaited<ReturnType<typeof ports.tools.invoke>>
    try {
      result = await ports.tools.invoke({ ...access, request: request.ok })
    } catch (error) {
      uncertainToolActions.add(action.id)
      return fail({ kind: 'unavailable', owner: 'toolRuntime', diagnostic: diagnosticOf(error) })
    }
    if (result.kind === 'association-unknown') {
      uncertainToolActions.add(action.id)
      return succeed({ batch: next, progressed: false })
    }
    if (result.kind === 'rejected' && result.failure.kind === 'unavailable') {
      if (unaccepted) unacceptedToolActions.add(action.id)
      const unavailable = {
        kind: 'unavailable' as const,
        owner: 'toolRuntime',
        diagnostic: result.failure.diagnostic ?? result.failure.dependency,
      }
      return succeed({ batch: next, progressed: false, unavailable })
    }
    unacceptedToolActions.delete(action.id)
    if (result.kind === 'rejected') {
      if (!unaccepted || uncertainToolActions.has(action.id))
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
      candidateDigest: null,
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

  /**
   * The candidate message of a slot, computed again from what the slot refers to: the denial, or
   * the received result material, with the conclusions of its single-result passage. The digest
   * that T2 kept must match; another candidate is `invalid`, never admitted in its place (SPEC
   * "工具执行与结果承接" 10).
   */
  async function slotCandidate(
    action: Action,
    slot: ActionSlot,
  ): Promise<Outcome<Message, Failure>> {
    const computed = await computedCandidate(action, slot)
    if ('failure' in computed) return computed
    if (slot.candidateDigest === null || candidateDigest(computed.ok) !== slot.candidateDigest)
      return fail({
        kind: 'invalid',
        field: 'slot.candidateDigest',
        reason: 'the candidate computed again does not match the digest of the slot',
      })
    return computed
  }

  /**
   * The candidate of a denied slot: the generic denial, or the answer the action was denied with,
   * read back from its material. A material that is not an answer is `invalid` (D-104).
   */
  async function deniedSlotCandidate(action: Action): Promise<Outcome<Message, Failure>> {
    const answer = action.judgment.kind === 'denied' ? action.judgment.answer : undefined
    if (answer === undefined) return succeed(deniedCandidate(execution, action))
    const material = await ports.materials.read({ ...access, source: answer })
    if ('failure' in material) return material
    const text = toolCallAnswerOf(material.ok)
    if (text === null)
      return fail({ kind: 'invalid', field: 'judgment.answer', reason: 'not a call answer' })
    return succeed(answeredCandidate(execution, action, text))
  }

  /** The candidate of a slot before any digest: no extension is adopted at after_action yet. */
  async function computedCandidate(
    action: Action,
    slot: ActionSlot,
  ): Promise<Outcome<Message, Failure>> {
    if (slot.each !== null && slot.each.length > 0)
      return fail(notYet('T2', 'a single-result passage with conclusions', '#502 stage 5'))
    if (slot.kind === 'denied') return deniedSlotCandidate(action)
    if (slot.kind !== 'result') return fail(defect(`T2: no candidate of a ${slot.kind} slot`))
    const received = await receivedToolResult(action)
    if ('failure' in received) return received
    if (received.ok === null) return fail(defect('T2: a result slot without its received entry'))
    return succeed(toolResultCandidate(execution, action, received.ok.delivery.value.content))
  }

  /** T5: P fixes the request of one slot's message before anything is prepared. */
  async function prepareSlotMessage(
    batch: ActionBatch,
    action: Action,
    slot: ActionSlot,
    source: InternalSource,
  ): Promise<Outcome<PendingHandoff, Failure>> {
    const candidate = await slotCandidate(action, slot)
    if ('failure' in candidate) return candidate
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
      candidate: candidate.ok,
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

  /** T5: the P the Journal saved for a slot, whose candidate must match the digest of the slot. */
  function savedSlotRequest(
    request: PendingHandoff,
    slot: ActionSlot,
  ): Outcome<PendingHandoff, Failure> {
    if (
      slot.candidateDigest === null ||
      candidateDigest(request.candidate) !== slot.candidateDigest
    )
      return fail({
        kind: 'invalid',
        field: 'slot.candidateDigest',
        reason: 'the saved candidate does not match the digest of the slot',
      })
    return succeed(request)
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
        ? savedSlotRequest(existing.request, slot)
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
    /**
     * A0: each action's admission. An unavailable admission stops the round: no later chain calls
     * admit and the whole batch is denied, so A1 closes the barrier as all-denied (SPEC rule 2).
     */
    async A0() {
      const batch = currentBatch()
      const parts = await batchToolCalls(batch)
      if ('failure' in parts) return parts
      const answers: Exclude<ToolAdmission, { kind: 'unavailable' }>[] = []
      for (const action of batch.actions) {
        const original = parts.ok.get(action.original.callId)
        if (original === undefined)
          return fail({
            kind: 'invalid',
            field: 'original.callId',
            reason: 'the preserved reply has no tool call of this call id',
          })
        const admitted = await admitToolAction(
          ports,
          access,
          execution,
          required(authority, 'authority'),
          action,
          original,
        )
        if ('failure' in admitted) return admitted
        if (admitted.ok.kind === 'unavailable') {
          // Nothing of this batch was preserved yet, so no request is left without a judgment.
          const denied = deniedForUnavailableAdmission(execution, batch, admitted.ok, [
            ...answers.map(answer => answer.action),
            ...batch.actions.slice(answers.length),
          ])
          return step('judged', { checkpoint: { batch: { ...batch, actions: denied } } })
        }
        answers.push(admitted.ok)
      }
      const actions: Action[] = []
      for (const answer of answers) {
        if (answer.kind === 'judged') {
          actions.push(answer.action)
          continue
        }
        const preserved = await preserveAllowedRequest(ports, access, execution, answer)
        if ('failure' in preserved) return preserved
        actions.push(preserved.ok)
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
      // The batch decision is added to each request when A2 sends it; the material stays as judged.
      return step('open', {
        checkpoint: {
          batch: { ...batch, barrier: { kind: 'open', evidence, approved: [first, ...rest] } },
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
        return fail(
          localFailure('invariant', {
            kind: 'unavailable' as const,
            owner: '@omne-harness/agent',
            diagnostic: 'toolConcurrency is unavailable',
          }),
        )
      const slotted = await slotDeniedAtJudgment(currentBatch())
      if ('failure' in slotted) return slotted
      let { batch, progressed } = slotted.ok
      for (const original of unslotted(batch)) {
        if (original.call === null && inFlight(batch).length >= limit) break
        const sent = await sendAction(batch, original)
        if ('failure' in sent) return sent
        if (sent.ok.unavailable !== undefined) return waitFor('A2', sent.ok.unavailable, null)
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
      for (const action of dispatched) {
        const received = await receivedToolResult(action)
        if ('failure' in received) return received
        if (received.ok !== null) return step('received', null)
      }
      if (dispatched.length === 0) return step('received', null)
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
        const received = await receivedToolResult(action)
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
          candidateDigest: null,
          handoff: null,
        })
        calls = calls.filter(call => call.kind !== 'tool' || call.action !== action.id)
        events.push({ kind: 'producer', result, consumption: pending.consumption })
      }
      return step('kept', { checkpoint: { batch, calls }, events })
    },
    /**
     * T2: the single-result passage of each result and denied slot. No extension is adopted at
     * after_action, so each passage is empty and the candidate is the unchanged message. The slot
     * keeps only the digest of the candidate; T5 computes the candidate again and checks it.
     */
    async T2() {
      const read = await advancing()
      if ('failure' in read) return read
      let batch = currentBatch()
      for (const action of batch.actions) {
        const slot = slotOf(batch, action.id)
        if (slot === undefined || slot.each !== null) continue
        if (slot.kind !== 'denied' && slot.kind !== 'result') continue
        const passed = { ...slot, each: [] }
        const candidate = await computedCandidate(action, passed)
        if ('failure' in candidate) return candidate
        batch = replaceSlot(batch, { ...passed, candidateDigest: candidateDigest(candidate.ok) })
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

  async function capabilityResult<T>(
    result: Promise<Outcome<T, Failure>>,
  ): Promise<Outcome<T, Failure>> {
    const answer = await result
    if ('failure' in answer && answer.failure.kind === 'denied')
      return fail(localFailure('rejected', answer.failure))
    return answer
  }

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
        capabilityResult(
          ports.modelContext.read({
            ...access,
            advance,
            position: current.position,
            recipient: selected.ok.recipient,
            history,
            adopted: required(checkpoint, 'checkpoint').adoptedContext,
            transition: null,
          }),
        )
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
        return fail(
          localFailure('invariant', {
            kind: 'unavailable',
            owner: 'requestPreparation',
            diagnostic: 'I1: the first prepare returned ready before the before-model passage',
          }),
        )
      // R2-D292: an assembled preparation stays in memory; only what cannot be computed again is
      // saved. A restart before M0 prepares again from the same input batch.
      const write = {
        checkpoint: {
          priorConditions: conditions.ok.source,
          ...(prepared.ok.kind === 'assembled' ? {} : { requestPreparation: prepared.ok }),
        },
      }
      if (prepared.ok.kind === 'needs-compaction') {
        // #513 revision 2: preserve Context's answer without inventing a cannot-fit cause.
        // Stage 4 owns the C subgraph. Keep I1 as the unsupported continuation in this phase.
        const saved = await commit('I1', 'I1', write)
        return 'failure' in saved
          ? saved
          : fail(localFailure('unsupported-path', { kind: 'unsupported' as const }))
      }
      return step(prepared.ok.kind === 'cannot-fit' ? 'try-finish' : 'prepared', write)
    },
    /** P0: no extension is adopted at before_model_call, so the passage proceeds. */
    async P0() {
      return step('proceed')
    },
    /**
     * P1: select again and prepare with the previous preparation; the result must be ready. An
     * unavailable dependency is a wait as at I1, and the wake prepares again from I1.
     */
    async P1() {
      const current = required(iteration, 'iteration')
      const conditions = required(current.conditions, 'conditions')
      const selected = await select(conditions)
      if ('failure' in selected)
        return selected.failure.kind === 'unavailable'
          ? waitFor('P1', selected.failure, () => select(conditions))
          : selected
      if (!sameRecipient(selected.ok, required(current.selected, 'selection')))
        return fail(notYet('P1', 'a changed selection', '#502 1.5'))
      const context = required(current.context, 'context')
      const prepareAgain = () => prepare(conditions, selected.ok, context, current.preparation, [])
      const prepared = await prepareAgain()
      if ('failure' in prepared)
        return prepared.failure.kind === 'unavailable'
          ? waitFor('P1', prepared.failure, prepareAgain)
          : prepared
      if (prepared.ok.kind !== 'ready')
        return fail(notYet('P1', `a ${prepared.ok.kind} preparation`, '#502 1.5 and stage 4'))
      // R2-D292: the ready preparation is not saved; M0 records the final request it holds.
      current.ready = prepared.ok
      return step('ready')
    },
  } satisfies Partial<Record<LoopNode, Handler>>

  function select(conditions: RuntimeConditions) {
    const current = required(iteration, 'iteration')
    return capabilityResult(
      ports.selection.select({
        ...access,
        advance: required(authority, 'authority'),
        scope: binding.scope,
        purpose: 'main',
        position: current.position,
        history: required(snapshot, 'snapshot').history,
        conditions,
        alterations: [],
      }),
    )
  }

  function prepare(
    conditions: RuntimeConditions,
    selection: SelectedModel,
    context: ModelContextRead,
    previous: Preparation | null,
    beforeModelCall: readonly never[] | null,
  ) {
    const current = required(iteration, 'iteration')
    return capabilityResult(
      ports.requests.prepare({
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
      }),
    )
  }

  // ------------------------------------------------------------------------------------------
  // callModel: I2, M0, M6, M1, M3, M4, M5 (M2 remains stage 3)

  function mainPosition(step: StepId): ConsumerRef {
    return { owner: AGENT_OWNER, work: `${execution}/${step}`, position: 'I3', purpose: 'main' }
  }

  /**
   * The `adoptedRequest` member a main-purpose M0 writes, or no member for any other purpose: the
   * slot survives the call's settlement and the next I1, and only the next main M0 replaces it.
   * The preparing side's `state` is kept as given; the Agent never reads it (FIXED-FACTS F2).
   */
  function adoptedRequestOf(
    pending: ModelPendingCall,
    ready: ReadyPreparation,
  ): Pick<AgentCheckpoint, 'adoptedRequest'> {
    if (pending.purpose !== 'main' || ready.purpose !== 'main') return {}
    return {
      adoptedRequest: {
        reference: pending.reference,
        fixed: ready.source,
        schema: ready.schema,
        record: ready.state,
      },
    }
  }

  /** The attempt of the main call of `of`: the number of its voided intents (R2-D292). */
  function attemptOf(of: StepId): number {
    return required(checkpoint, 'checkpoint').voided.filter(item => item.step === of).length
  }

  function mainPending(step: StepId, ready: ReadyPreparation): ModelPendingCall {
    const attempt = attemptOf(step)
    return {
      kind: 'model',
      action: mainAction(step, attempt),
      consumption: mainConsumption(execution, step, attempt),
      position: mainPosition(step),
      fixed: ready.source,
      reference: mainInvocation(access.tenant, execution, step, attempt),
      purpose: 'main',
    }
  }

  /** The frame of one main attempt of `of`, before its request is prepared. */
  function newIteration(of: StepId, batch: InputBatch | null, attempt: number): Iteration {
    return {
      step: of,
      batch,
      action: mainAction(of, attempt),
      consumption: mainConsumption(execution, of, attempt),
      position: mainPosition(of),
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
  }

  /**
   * The frame I1 prepares in after a restart or a voided intent (R2-D292): the step and attempt
   * of the checkpoint and the input batch the step took. Only the batch ID is saved; the inputs
   * within the watermark are that batch until a later I0 takes another, so E2's read gives it.
   */
  function restoredIteration(at: AgentCheckpoint): Outcome<Iteration, Failure> {
    const attempt = attemptOf(at.step)
    if (
      iteration !== null &&
      iteration.step === at.step &&
      iteration.batch !== null &&
      iteration.action === mainAction(at.step, attempt)
    )
      return succeed(iteration)
    if (at.inputBatch === null)
      return fail(notYet('I1', 'a preparation without the input batch of its step', '#502 stage 5'))
    iteration = newIteration(at.step, at.inputBatch, attempt)
    return succeed(iteration)
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
      const ready = required(current.ready, 'ready preparation')
      // #558 M04-2: the inherited ready preparation records the final request in this commit.
      return step('recorded', {
        checkpoint: {
          calls: [pending],
          adoptedContext: ready.coverage,
          ...adoptedRequestOf(pending, ready),
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
        return voided(current, pending, found.ok)
      }
      const eligible = await currentAttachment()
      if ('failure' in eligible) return eligible
      const ready = required(current.ready, 'ready preparation')
      let admitted: Awaited<ReturnType<typeof ports.models.calls.admit>>
      try {
        admitted = await ports.models.calls.admit({
          ...access,
          call,
          operation: admission,
          request: ready.request,
          consumer: pending.position,
          capacity: ready.capacity,
        })
      } catch (error) {
        current.admission = 'unknown'
        return fail({ kind: 'unavailable', owner: 'modelRuntime', diagnostic: diagnosticOf(error) })
      }
      if ('failure' in admitted) {
        const answered = await notAdmitted(current, pending, admitted.failure)
        if (answered !== null) return answered
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

  /**
   * M6 after the Model's authoritative not-accepted of an intent whose admission was unknown
   * (SPEC "身份、范围与归属", Model 未知行; R2-D292): the call was never admitted, sent or charged,
   * and no late admission of it can follow. The commit closes the intent in `voided`, which gives
   * the step its next attempt, and I1 prepares the request again under the new identity. A timeout
   * or a missing route never comes here: they keep the identity unknown.
   */
  function voided(
    current: Iteration,
    pending: ModelPendingCall,
    answer: Extract<M.Lookup, { kind: 'not-accepted' }>,
  ): Outcome<Step, Failure> {
    if (answer.operation !== invocationParts(pending.reference, access.tenant).admission)
      return fail(defect('M6: not-accepted names another admission'))
    const at = required(checkpoint, 'checkpoint')
    const attempt = attemptOf(current.step)
    const basis = agentEvidence(`${execution}/${current.step}/voided/${attempt}`, {
      reference: pending.reference,
      answer,
    })
    // The batch of the step: in memory, or the saved one after a restart (R2-D292).
    iteration = newIteration(current.step, current.batch ?? at.inputBatch, attempt + 1)
    state = { kind: 'advancing' }
    return step('voided', {
      checkpoint: {
        calls: at.calls.filter(
          call => call.kind !== 'model' || call.reference !== pending.reference,
        ),
        voided: [
          ...at.voided,
          { step: current.step, action: pending.action, reference: pending.reference, basis },
        ],
      },
      state: { kind: 'advancing' },
    })
  }

  async function receivedOf(
    pending: ModelPendingCall,
  ): Promise<Outcome<ReceivedEntry | null, Failure>> {
    const received = await receivedOfConsumption(pending.consumption)
    if ('failure' in received) return received
    const found = received.ok.find(
      entry =>
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
    return failure.kind === 'unavailable' || failure.kind === 'commit-unknown'
      ? waitFor(node, modelUnavailable(node, failure), async () => {
          const pending = required(required(iteration, 'iteration').pending, 'pending call')
          const read = await ports.models.calls.inspect({
            ...access,
            reference: pending.reference,
          })
          return 'failure' in read ? fail(modelUnavailable(node, read.failure)) : read
        })
      : fail(modelFailure(node, failure))
  }

  /**
   * M6 after `admit` answered a failure: the outcome of the node, or `null` when the inspection of
   * an unknown admission found the original call, so M6 goes on as admitted. R2-D237: a definite
   * refusal ends the run as `model-refused`; an unavailable Model is a dependency wait at M6, and
   * the wake admits the same call again.
   */
  async function notAdmitted(
    current: Iteration,
    pending: ModelPendingCall,
    failure: M.ModelFailure,
  ): Promise<Outcome<Step, Failure> | null> {
    const refusal = modelRefusal(failure)
    if (refusal !== null) return refused(current, pending, refusal)
    if (failure.kind === 'unavailable') return waitFor('M6', modelUnavailable('M6', failure), null)
    if (failure.kind !== 'commit-unknown' && failure.kind !== 'conflict')
      return fail(modelFailure('M6', failure))
    current.admission = 'unknown'
    const recalled = await ports.models.calls.inspect({ ...access, reference: pending.reference })
    if ('failure' in recalled) return modelWait('M6', recalled.failure)
    if (recalled.ok.kind === 'found') return null
    // A conflict names an identity that the Model holds under another fixed input (R2-D292): it is
    // never sent again under that identity. The Model's authoritative not-accepted voids it, so the
    // step goes on under its next attempt instead of standing at M6.
    if (failure.kind === 'conflict') return voided(current, pending, recalled.ok)
    // An unknown write is never repeated in this turn, even if inspection cannot yet find it.
    return producerWait('M6', pending)
  }

  /**
   * M6's definite refusal (R2-D237): the failure candidate `model-refused` names the original call
   * and the Model's refusal as it is, and F1 ends the run with it. A candidate already formed for
   * the same call is kept, with its timestamp, when M6 runs again after an excluded F1 commit.
   */
  async function refused(
    current: Iteration,
    pending: ModelPendingCall,
    refusal: ModelRefusal,
  ): Promise<Outcome<Step, Failure>> {
    const call = invocationParts(pending.reference, access.tenant).call
    if (
      decided?.kind !== 'try-finish' ||
      decided.failure?.kind !== 'model-refused' ||
      decided.failure.call !== call
    ) {
      const instant = await ports.clock.now()
      if ('failure' in instant) return instant
      const failure: FailureCandidate = {
        kind: 'model-refused',
        step: current.step,
        at: instant.ok,
        source: pending.fixed,
        call,
        failure: refusal,
      }
      decided = {
        kind: 'try-finish',
        conclusion: {
          kind: 'fail',
          cause: agentEvidence(`${execution}/${current.step}/model-refused`, failure),
        },
        failure,
      }
    }
    return step('try-finish', null)
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
    const accepted = await journalAt('F0').control({
      ...access,
      execution,
      operation,
      command: interrupt.command,
    })
    if ('failure' in accepted) return accepted
    return advanceAcceptedControl(
      { ...ports, journal: journalAt('F0') },
      access,
      execution,
      operation,
    )
  }

  /** A refused settlement commit: a changed or unknown answer is reconciled at R0. */
  function refusedSettlement(failure: Failure): Outcome<Step, Failure> {
    if (failure.kind === 'changed') cancellationChanged = true
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
    const installation = await readInstallation.call(ports.journal, { ...access, execution })
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
    const settled = await journalAt('F1').commitSettlement(
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
    return 'failure' in settled ? refusedSettlement(settled.failure) : step('fixed', null)
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
    const prepared = await journalAt('F3').prepareFinish({
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
      const revoked = await establishCancellation(journalAt('F0'), access, execution, control)
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
      if (latest.ok.unresolved.length > 0) return step('reconcile', null)
      if (latest.ok.state.kind === 'ended') return step('reconcile', null)
      const cancel = cancellationOf(latest.ok)
      if (cancel !== undefined) return fixCancellation(latest.ok, cancel)
      if (fault !== null && faultDecision === null) {
        const instant = await ports.clock.now()
        if ('failure' in instant) return instant
        const source = agentEvidence(`${execution}/node-failed`, {
          node: fault.node,
          category: fault.category,
          failureKind: fault.failureKind,
          historyAtFailure: fault.history,
        })
        const failure: FailureCandidate = {
          kind: 'node-failed',
          node: fault.node,
          category: fault.category,
          failureKind: fault.failureKind,
          step: fault.step,
          at: instant.ok,
          source,
        }
        faultDecision = { kind: 'try-finish', conclusion: { kind: 'fail', cause: source }, failure }
      }
      if (faultDecision !== null) {
        if (advancementOf(latest.ok).kind !== 'current') return fail({ kind: 'stale-advance' })
        takeLatestPosition(latest.ok)
        if (faultCandidate === null) {
          const conditions = await ports.conditions.read({
            ...access,
            advance: required(authority, 'authority'),
            previous: latest.ok.checkpoint.priorConditions,
          })
          if ('failure' in conditions) return conditions
          faultCandidate = {
            origin: latest.ok.history,
            conclusion: faultDecision.conclusion,
            failure: faultDecision.failure,
            inputWatermark: latest.ok.inputWatermark,
            conditions: conditions.ok.source,
          }
        }
        return step('fixed', { state: { kind: 'settling' }, finish: faultCandidate })
      }
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
        // A call that ended without a reply, or that the Model refused, leaves no continuation.
        ...(next.failure?.kind === 'no-reply' || next.failure?.kind === 'model-refused'
          ? { checkpoint: { calls: [] } }
          : {}),
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
        const judged = await journalAt('F2').commitSettlement({
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
        return 'failure' in judged ? refusedSettlement(judged.failure) : step('proceed', null)
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
      finishAttemptRevision = revision
      const finished = await journalAt('F3').tryFinish({
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
      if (!endReported) {
        endReported = true
        entry.ended?.(read.ok.state, read.ok.settlement.candidate?.failure ?? null)
      }
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
    async accept(confirmedOpen) {
      return exclusive('E0', async () => {
        const start = originalOpen === null ? 'U0' : 'E0'
        if (originalOpen !== null) {
          if (confirmedOpen === undefined)
            return fail({
              node: 'E0',
              failure: { kind: 'commit-unknown', operation: originalOpen.operation },
            })
          if (
            confirmedOpen.operation !== originalOpen.operation ||
            confirmedOpen.execution !== originalOpen.execution ||
            authority !== null
          )
            return fail({
              node: 'E0',
              failure: { kind: 'conflict', operation: originalOpen.operation },
            })
          pendingCommit = null
        }
        const ran = await drive(start, 'E1')
        if ('failure' in ran) return ran
        return succeed(required(authority, 'authority'))
      })
    },
    async continueExecution(original) {
      return exclusive('E1', async () => {
        authority = original
        const read = await load()
        if ('failure' in read) return fail({ node: 'E1', failure: read.failure })
        if (!sameAuthority(read.ok.executionAttachment, original))
          return fail({ node: 'E1', failure: { kind: 'stale-advance' } })
        const at = read.ok.checkpoint
        const finishingFault =
          read.ok.state.kind === 'settling' &&
          read.ok.settlement.candidate?.failure?.kind === 'node-failed'
        // R2-D292: before M0 saved an intent nothing of the request is saved. E4 routes these
        // positions to I1, which prepares again from the input batch of the step.
        const beforeIntent = BEFORE_RECORD.includes(at.position) && at.calls.length === 0
        const pending = at.calls[0]
        if (
          !finishingFault &&
          !beforeIntent &&
          (!['M6', 'M3', 'M4', 'M5', 'I3'].includes(at.position) ||
            pending?.kind !== 'model' ||
            pending.purpose !== 'main')
        )
          return fail({ node: 'E4', failure: { kind: 'unsupported' } })
        revision = read.ok.revision
        checkpoint = at
        // The call path never prepares again from here: M6 recognizes the saved intent, and a
        // request is prepared again only after the Model's authoritative not-accepted voids it.
        iteration =
          pending?.kind === 'model' && !beforeIntent && !finishingFault
            ? {
                ...newIteration(at.step, null, attemptOf(at.step)),
                action: pending.action,
                consumption: pending.consumption,
                position: pending.position,
                pending,
                admission: 'unknown',
              }
            : null
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
