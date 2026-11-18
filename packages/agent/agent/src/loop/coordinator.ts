import type { ContentBlock } from '@omne-harness/content-block'
import type {
  AcceptedInput,
  Action,
  CardRoundId,
  Passage,
  ActionBatch,
  ActionSlot,
  ActionToolCall,
  Access,
  AgentCheckpoint,
  AgentEvaluator,
  AgentExecutionId,
  AgentOperationId,
  Authority,
  CallerCommit,
  CommandReceipt,
  ControlRecord,
  ConsumerRef,
  ConsumptionId,
  ActionId,
  DurableEvidence,
  ExecutionRevision,
  ExecutionSnapshot,
  ExecutionState,
  Failure,
  FinishAuthorization,
  FailureCandidate,
  FinishCandidateContent,
  HandoffOutcome,
  HandoffReference,
  InputBatch,
  InputHandoff,
  InvokeRuntimeContext,
  LoopFacts,
  MessageSource,
  ModelContextRead,
  OriginalInputAcceptance,
  PendingHandoff,
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
  CompactionProviderBinding,
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
import {
  adopted,
  afterAdmission,
  afterPresentRefused,
  afterPresented,
  afterReply,
  chainOf,
  denialOf,
  extensionPassages,
  handBackOf,
  humanWaits,
  needOfAction,
  presentRequest,
  withChosenRewrite,
} from './admission-chain.ts'
import { cardClosing } from './card-closing.ts'
import { canonical } from '../canonical.ts'
import { waitForExecutionChange, type HeldPosition, type ReconciliationPacer } from './wait.ts'
import { diagnosticOf } from './diagnostic.ts'
import {
  lowerBound,
  readRange,
  REPLY_ADMISSION_PAGE_LIMIT,
  sentPosition,
} from './admission-read.ts'
import { LOOP_NODES, successor, type LoopNode } from './nodes.ts'
import { attemptWrite, originalJournal, type OriginalWrite } from './original-write.ts'
import { localFailure, nodeFailureCategory, type NodeFailureCategory } from './node-failure.ts'
import { readBatchToolCalls } from './action-source.ts'
import { answeredByPort, notingPorts } from './port-answers.ts'
import {
  consumeModelResult,
  lostIntent,
  lostModelResult,
  noReplyReason,
  unacceptedIntent,
  voidedModelIntents,
  type ModelOutcome,
  type ModelResult,
} from './model-result.ts'
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
  uncheckedCandidate,
  deniedUnchecked,
  deniedSlot,
  preserveAllowedRequest,
  sentToolRequest,
  toolCallOf,
  toolIntentOf,
  placeholderCandidate,
  isToolReturnOf,
  passingSlot,
  receivedSlot,
  toolReceivedOf,
  type ReceivedToolDelivery,
  toolCallAnswerOf,
  toolResultCandidate,
  openToolCalls,
  slotOf,
  refusedTool,
  toolCall,
  unsent,
  type AssociatedToolCall,
  type ToolAdmission,
} from './tools.ts'
import { contactMainCall } from './contact.ts'
import { sameAuthority, sameRecipient } from './same.ts'
import { cancelCompaction } from './compaction.ts'
import { contactToolCalls } from './tool-contact.ts'
import { readToolDeliveryMaterial } from '../tool-receiving-material.ts'
import {
  historyCaller,
  required,
  step,
  type CommitEvent,
  type Handler,
  type Iteration,
  type ModelPendingCall,
  type OpenState,
  type ReadyPreparation,
  type Step,
  type Write,
} from './coordinator-steps.ts'
import { compactionNodes, invalidCompaction, originalCompactionOf } from './compaction-nodes.ts'
import {
  adoptedRequestOf,
  capabilityResult,
  recordedOutcome,
  replaceAction,
  replaceSlot,
  replyPosition,
} from './coordinator-helpers.ts'
import {
  cancelInterrupt,
  cannotFit,
  slotSource,
  type InternalSource,
} from './coordinator-helpers.ts'

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
  | 'cards'
  | 'compaction'
  | 'compactionInputs'
  | 'received'
>

export type ExecutionEntry<P> = Readonly<{
  ports: LoopPorts<P>
  binding: AgentRuntimeBinding
  jointCommits?: AgentConfiguration['jointCommits']
  compactionProvider: CompactionProviderBinding
  evaluator: AgentEvaluator
  access: Access<P>
  execution: AgentExecutionId
  operation: AgentOperationId
  initial: AcceptedInput
  grant: DurableEvidence | null
  idle(): void
  ended?(
    state: Extract<ExecutionState, { kind: 'ended' }>,
    candidate: FailureCandidate | null,
  ): void
  waiting?(
    step: StepId | null,
    node: LoopNode,
    failure: Extract<Failure, { kind: 'unavailable' }>,
  ): void
  // 本 run 并发范围的预算：A0 把它写进每个获准请求的 `limits.scopeBudget`，由 Tool 执行。
  // 缺少它时，A0 对获准动作以 invariant 失败。
  toolConcurrency?: number
  maxRunSteps?: number
  report?: (report: ReplyAdmissionReadReport) => void
}>

export type ReplyAdmissionReadReport = Readonly<{
  kind: 'origin-reread'
  reason: 'missing-basis'
  from: string
  outcome: 'complete' | 'gap' | 'failure'
  pages: number
  facts: number
}>

export type Halted = Readonly<{ node: LoopNode; failure: Failure }>

export interface ExecutionDrive {
  runExecution(): Promise<Outcome<void, Halted>>
  waitForWake(
    input: Readonly<{ pacer: ReconciliationPacer; signal: AbortSignal }>,
  ): Promise<Outcome<'ready' | 'stopped' | 'cancelled', Halted>>
  handOver(
    input: Readonly<{ operation: AgentOperationId; reason: DurableEvidence }>,
  ): Promise<Outcome<DurableEvidence | null, Halted>>
}

export interface ExecutionCoordinator extends ExecutionDrive {
  accept(confirmedOpen?: CommandReceipt): Promise<Outcome<Authority, Halted>>
  /** Original runtime only, after its old driver stopped. No attach, takeover or public resume. */
  continueExecution(authority: Authority): Promise<Outcome<void, Halted>>
}

export interface ResumedCoordinator extends ExecutionDrive {
  resume(
    input: Readonly<{
      operation: AgentOperationId
      recovery: DurableEvidence
      grant: DurableEvidence | null
    }>,
  ): Promise<Outcome<Authority, Halted>>
}

export type ResumeEntry<P> = Omit<ExecutionEntry<P>, 'operation' | 'initial' | 'grant'>

type Invoked = Pick<ExecutionEntry<unknown>, 'operation' | 'initial' | 'grant'>

export type { CommitEvent } from './coordinator-steps.ts'

type Movement = Readonly<{ to: LoopNode | null; yielded: boolean }>

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

export const DEFECT_OWNER = `${AGENT_OWNER}#defect`

function defect(diagnostic: string): Failure {
  return localFailure('invariant', { kind: 'unavailable', owner: DEFECT_OWNER, diagnostic })
}

function heldAfter(
  before: HeldPosition | null,
  expected: ExecutionRevision,
  revision: ExecutionRevision,
  events: number,
): HeldPosition | null {
  if (before?.revision !== expected) return null
  const through = before.emittedThrough ?? '0'
  if (!/^(?:0|[1-9]\d*)$/u.test(through)) return null
  const emitted = BigInt(through) + BigInt(events)
  return { revision, emittedThrough: emitted === 0n ? null : String(emitted) }
}

const RETURN_KINDS = ['placeholder', 'result'] as const

// An admission chain still asking ends with the Run once its cards are withdrawn; an extension's does not.
function pendingPassage(passages: readonly Passage[]): Failure | null {
  const pending = extensionPassages(passages).some(passage => passage.progress.kind !== 'applied')
  return pending ? notYet('R0', 'a pending passage', '#502 stage 3') : null
}

function notYet(node: LoopNode, what: string, card: string): Failure {
  return localFailure('unsupported-path', {
    kind: 'unavailable',
    owner: AGENT_OWNER,
    diagnostic: `${node}: ${what} is not handled until ${card}`,
  })
}

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

type ModelRefusal = Extract<FailureCandidate, { kind: 'model-refused' }>['failure']

function modelRefusal(failure: M.ModelFailure): ModelRefusal | null {
  switch (failure.kind) {
    case 'denied':
    case 'invalid':
    case 'unsupported':
      return failure
    default:
      return null
  }
}

function modelFailure(node: LoopNode, failure: M.ModelFailure): Failure {
  switch (failure.kind) {
    case 'denied':
      return { kind: 'denied', action: failure.action }
    case 'invalid':
      return { kind: 'invalid', field: failure.field, reason: failure.reason }
    case 'unsupported':
      return { kind: 'unsupported' }
    default:
      return modelUnavailable(node, failure)
  }
}

type UnsupportedRecovery = Readonly<{ kind: 'unsupported'; node: string; card: string }>
type Recovery = Outcome<LoopNode | 'evaluate', UnsupportedRecovery>

function recoveryCard(node: string): string {
  if (node.startsWith('X')) return '#502 stage 3'
  if (node.startsWith('C')) return '#502 stage 4'
  return /^[AT]/u.test(node) ? '#502 stage 2' : '#502 stage 5'
}

function recoveryTarget(node: string): Recovery {
  if (
    node.startsWith('X') ||
    !LOOP_NODES.includes(node as LoopNode) ||
    ['E0', 'E1', 'E2', 'U0', 'Q1', 'R0', 'W0', 'F0', 'H0', 'M2', 'Q5'].includes(node)
  )
    return fail({ kind: 'unsupported', node, card: recoveryCard(node) })
  return succeed(node as LoopNode)
}

function batchRecovery(position: string, batch: ActionBatch): string {
  if (batch.barrier.kind === 'closed') return 'A1'
  if (['T4', 'T5', 'I8'].includes(position)) return position
  const slotted = (action: Action) => batch.slots.some(slot => slot.action === action.id)
  if (batch.barrier.kind === 'all-denied') return batch.actions.every(slotted) ? 'T2' : 'A3'
  const judged = (action: Action) => ['allowed', 'denied'].includes(action.judgment.kind)
  if (batch.actions.some(action => judged(action) && !slotted(action))) return 'A2'
  return batch.slots.some(slot => slot.kind === 'dispatched') ? 'T0' : 'T1'
}

function callRecovery(position: string, call: PendingCall): Recovery {
  if (call.purpose === 'action') return recoveryTarget('T0')
  if (call.purpose === 'extension') return recoveryTarget('X2')
  if (['M0', 'M6', 'M1', 'M3', 'M4', 'M5', 'I3'].includes(position)) return recoveryTarget(position)
  if (position === 'Q2' || position === 'Q4') return recoveryTarget('I3')
  return recoveryTarget('M1')
}

function preparationRecovery(at: AgentCheckpoint): Recovery | null {
  if (at.requestPreparation?.kind === 'cannot-fit') return succeed('F1')
  if (at.compaction !== null) {
    const ended = at.compaction.ended
    return recoveryTarget(
      ended === 'committed'
        ? 'C4'
        : ended === 'failed'
          ? 'F1'
          : at.currentHandoff !== null
            ? 'C3'
            : at.compaction.received !== null
              ? 'C2'
              : 'C1',
    )
  }
  const prepared = at.requestPreparation
  if (prepared === null) return null
  return recoveryTarget('C0')
}

/** The positions before the final request record: no fact of them outlives the process. */
const BEFORE_RECORD: readonly string[] = ['I1', 'P0', 'P1', 'I2']

function stateRecovery(
  read: Pick<ExecutionSnapshot, 'checkpoint' | 'state' | 'unresolved'>,
): Recovery | null {
  const at = read.checkpoint
  if (read.state.kind === 'ended') return succeed('F4')
  // A lost receipt must be reconciled before any dependent business continuation can run.
  if (read.unresolved.length > 0) return succeed('R0')
  if (read.state.kind === 'settling') return succeed(at.position === 'F3' ? 'F3' : 'F2')
  const passage = extensionPassages(at.passages).find(item => item.progress.kind !== 'applied')
  if (passage === undefined) return null
  const progress = passage.progress.kind
  return recoveryTarget(progress === 'resolved' ? 'X5' : progress === 'asked' ? 'X4' : 'X2')
}

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
  if (at.position === 'F1') return recoveryTarget('I8')
  if (['I3', 'I4', 'I8', 'F2', 'F3', 'F4', 'O0', 'E9'].includes(at.position))
    return recoveryTarget(at.position)
  const preparation = preparationRecovery(at)
  if (preparation !== null) return preparation
  if (at.inputBatch !== null || BEFORE_RECORD.includes(at.position)) return succeed('I1')
  if (['E4', 'I0', 'I8'].includes(at.position)) return succeed('evaluate')
  return recoveryTarget(at.position)
}

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
  'compaction',
  'compactionInputs',
  'received',
] as const satisfies readonly Exclude<keyof LoopPorts<unknown>, 'toolRequests'>[]

export function createExecutionCoordinator<P>(entry: ExecutionEntry<P>): ExecutionCoordinator {
  return coordinate(entry, entry)
}

export function createResumedCoordinator<P>(entry: ResumeEntry<P>): ResumedCoordinator {
  return coordinate(entry, null)
}

function coordinate<P>(
  entry: ResumeEntry<P>,
  invoked: Invoked | null,
): ExecutionCoordinator & ResumedCoordinator {
  const { binding, evaluator, execution } = entry
  const ports: LoopPorts<P> = { ...entry.ports }
  for (const key of DEPENDENCY_PORTS)
    if (key in ports)
      Object.defineProperty(ports, key, {
        enumerable: true,
        get: () => notingPorts(entry.ports[key]),
      })
  const access: Access<P> = { principal: entry.access.principal, tenant: entry.access.tenant }

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
  let pendingHandoff: PendingHandoff | null = null
  let outcome: HandoffOutcome | null = null
  let unpreparedHandoff: PendingHandoff | null = null
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
  let finishUnavailable: Extract<Failure, { kind: 'unavailable' }> | null = null
  let finishWait = false
  let endReported = false
  let reportedWait: string | null = null
  let reissueObligations = false
  let cancellationChanged = false
  let waits: readonly Waiting[] = []
  const unsentRounds = new Set<CardRoundId>()
  const closing = cardClosing(ports, access, execution, unsentRounds)
  let waitingAt: LoopNode = 'E1'
  let yieldedWait = false
  let savedWait = false
  let waking = false
  let resumeState: OpenState = state
  let reconciliationOperations: readonly AgentOperationId[] = []
  let recheckDependency: ((read: ExecutionSnapshot) => Promise<Outcome<unknown, Failure>>) | null =
    null
  let activeDrive = false
  let activeWait = false
  let readPrefix: ReplyAdmissionPrefix | null = null
  const unacceptedToolActions = new Set<ActionId>()
  const heldTools = new Set<ActionId>()
  let rejectedMessage: Readonly<{ source: InternalSource; evidence: DurableEvidence }> | null = null
  let lastSent: Readonly<{ operation: AgentOperationId; read: ReplyAdmissionRead }> | null = null
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

  async function commit(
    node: LoopNode,
    to: string,
    proposal: Write | (() => Write),
  ): Promise<Outcome<void, Failure>> {
    const write = typeof proposal === 'function' ? proposal() : proposal
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
          return commit(node, to, proposal)
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

  async function saveHandoff(
    node: LoopNode,
    to: string,
    value: Pick<PendingHandoff, 'position' | 'source' | 'candidate'>,
    checkpointFor: (reference: HandoffReference) => Write['checkpoint'] = () => ({}),
  ): Promise<Outcome<PendingHandoff, Failure>> {
    let request: PendingHandoff | null = null
    const saved = await commit(node, to, () => {
      const predecessor = required(revision, 'revision')
      const reference = {
        kind: 'execution' as const,
        execution,
        operation: handoffOperation(value.source.kind, value.position, predecessor),
      }
      request = {
        ...value,
        kind: 'execution',
        reference,
        predecessor,
        originalAdvance: required(authority, 'authority'),
        predecessorHandoff: null,
      }
      return {
        checkpoint: { ...checkpointFor(reference), currentHandoff: reference },
        handoff: { kind: 'prepare', request },
        operation: handoffStage(reference.operation, 'prepare'),
      }
    })
    return 'failure' in saved
      ? saved
      : succeed(required<PendingHandoff>(request, 'saved handoff request'))
  }

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

  async function afterRefusedCommit(
    at: LoopNode,
    failure: Failure,
  ): Promise<Outcome<LoopNode, Failure>> {
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

  function waitOnUnavailable(
    at: LoopNode,
    failure: Extract<Failure, { kind: 'unavailable' }>,
  ): Outcome<LoopNode, Failure> {
    if (failure.diagnostic.startsWith('missing-basis')) readPrefix = null
    held = null
    const unresolved =
      pendingCommit !== null ||
      reconciliationOperations.length > 0 ||
      (snapshot?.unresolved.length ?? 0) > 0
    if (fault !== null || unresolved || closingNodes.includes(at)) return waitForFault(at, failure)
    waitFor(at, failure, null)
    return succeed('W0')
  }

  function waitForRevocationCause() {
    finishWait = true
    return waitFor(
      'E2',
      {
        kind: 'unavailable',
        owner: AGENT_OWNER,
        diagnostic: 'the advance is revoked and its cause is not in the Journal yet',
      },
      null,
    )
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

  function goingOn<S extends Exclude<ExecutionState, { kind: 'ended' }>>(read: S) {
    return read.kind === 'reconciling' ? ({ kind: 'advancing' } as const) : read
  }

  function committedState(read: ExecutionState): OpenState {
    if (read.kind === 'ended')
      throw new Error('coordinator defect: an ended state is not committed')
    if (read.kind === 'waiting') return resumeState
    if (read.kind === 'settling') return { kind: 'settling' }
    return goingOn(read)
  }

  function advancementOf(read: ExecutionSnapshot): LoopFacts['advancement'] {
    const own = required(authority, 'authority')
    const source = read.executionAttachment?.source ?? own.source
    if (read.state.kind === 'ended') return { kind: 'ended', source }
    if (!sameAuthority(read.executionAttachment, own)) return { kind: 'superseded', source }
    return { kind: 'current', source }
  }

  async function readFacts(read: ExecutionSnapshot): Promise<Outcome<LoopFacts, Failure>> {
    const current = required(checkpoint, 'checkpoint')
    for (const operation of read.unresolved) {
      const queried = await ports.journal.query({ ...access, execution, operation })
      if ('failure' in queried) return queried
      switch (queried.ok.kind) {
        case 'committed':
        case 'excluded':
        case 'rejected':
          break
        case 'unknown':
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
      producers: current.calls.map(pending => ({
        kind: 'unresolved',
        pending,
        source: read.history,
      })),
      consumption: read.results,
      replyAdmissions: read.replyAdmissions,
      controls: [],
    })
  }

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

  function waitFor(
    node: LoopNode,
    failure: Extract<Failure, { kind: 'unavailable' }>,
    recheck: ((read: ExecutionSnapshot) => Promise<Outcome<unknown, Failure>>) | null,
  ) {
    waitingAt = node
    recheckDependency = recheck
    waits = [{ kind: 'dependency', owner: failure.owner, position: node }]
    const at = checkpoint?.step ?? null
    const reported = `${at}|${node}|${failure.owner}|${failure.diagnostic}`
    if (reported !== reportedWait) {
      reportedWait = reported
      entry.waiting?.(at, node, failure)
    }
    return step('wait', null)
  }

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

  function runtimeContext(): InvokeRuntimeContext {
    return {
      instance: binding.instance,
      scope: binding.scope,
      definition: binding.definition,
      grant: required(invoked, 'invoke').grant,
    }
  }

  function replyRecord(step: StepId, call: M.ModelCallId) {
    return required(snapshot, 'snapshot').handoffs.find(
      record =>
        record.request.kind === 'execution' &&
        record.request.source.kind === 'model-reply' &&
        record.request.source.call === call &&
        canonical(record.request.position) === canonical(replyPosition(step)),
    )
  }

  function admittedReply(): Outcome<
    Readonly<{
      step: StepId
      reply: Extract<ModelOutcome, { kind: 'reply' }>['reply']
      produced: ModelOutcome['produced']
    }>,
    Failure
  > {
    const result = iteration?.result
    if (iteration !== null && result?.kind === 'reply')
      return succeed({ step: iteration.step, reply: result.reply, produced: result.produced })
    const at = required(checkpoint, 'checkpoint').step
    const record = required(snapshot, 'snapshot').handoffs.findLast(
      item =>
        item.request.kind === 'execution' &&
        item.request.source.kind === 'model-reply' &&
        item.history.kind === 'committed' &&
        canonical(item.request.position) === canonical(replyPosition(at)),
    )
    if (record?.request.kind !== 'execution' || record.request.source.kind !== 'model-reply')
      return fail(defect('I4 without the reply its step admitted'))
    const reply = record.request.candidate
    if (reply.role !== 'assistant') return fail(defect('I4: the admitted reply is not a reply'))
    return succeed({ step: at, reply, produced: record.request.source.result })
  }

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
    async U0() {
      if (outcome === null) {
        const { operation, initial } = required(invoked, 'invoke')
        const inputEntry = { kind: 'invoke' as const, operation, execution, initial }
        candidate = {
          kind: 'external-input',
          request: {
            kind: 'input',
            reference: { kind: 'input', execution, entry: operation, input: initial.id },
            entry: inputEntry,
            source: { kind: 'external-input', input: initial.id },
          },
          runtime: runtimeContext(),
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
        request = existing.request
      } else {
        const position = replyPosition(current.step)
        const prepared = await saveHandoff('Q1', 'Q2', {
          position,
          source: subject.source,
          candidate: subject.candidate,
        })
        if ('failure' in prepared) return prepared
        request = prepared.ok
      }
      pendingHandoff = request
      const fixed = await prepareHandoff(request)
      if ('failure' in fixed) return fixed
      outcome = fixed.ok
      return step(fixed.ok.decision.kind, null)
    },
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
    async Q4() {
      const subject = required(candidate, 'candidate')
      return step(`return-${subject.returnTo}`, authority === null ? null : {})
    },
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

  async function refusedFinishRoute(read: LoopFacts): Promise<Outcome<Step, Failure>> {
    finishRefused = false
    if (finishUnavailable !== null) {
      const failure = finishUnavailable
      finishUnavailable = null
      finishWait = true
      return waitFor('R0', failure, null)
    }
    const latest = required(snapshot, 'snapshot')
    if (latest.controls.length > 0)
      return fail(notYet('R0', 'a terminal control responsibility', '#502 stage 5'))
    const withdrawn = await closing.withdrawOpen(latest.checkpoint, 'R0/finish', decided)
    if ('failure' in withdrawn) return withdrawn
    const pending = pendingPassage(latest.checkpoint.passages)
    if (pending !== null) return fail(pending)
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

  function advancedByAnother(read: ExecutionSnapshot): boolean {
    return (
      read.revision !== revision &&
      pendingCommit === null &&
      !waking &&
      canonical(read.checkpoint) !== canonical(checkpoint)
    )
  }

  const runExecutionNodes = {
    async E0() {
      if (originalOpen === null) {
        const initial = evaluator.initial({ definition: binding.definition, step: stepOf(0) })
        if ('failure' in initial) return initial
        originalOpen = {
          ...access,
          execution,
          operation: required(invoked, 'invoke').operation,
          original: required(acceptance, 'acceptance'),
          runtime: runtimeContext(),
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
    async E1() {
      const read = await load()
      if ('failure' in read)
        return read.failure.kind === 'unavailable'
          ? waitFor('E1', read.failure, async latest => succeed(latest))
          : read
      const advancement = advancementOf(read.ok)
      if (advancement.kind === 'ended') return step('terminal', null)
      if (advancement.kind === 'superseded') return step('superseded', null)
      const resumed = revision === null
      if (!resumed && advancedByAnother(read.ok)) {
        entry.idle()
        return step('found-existing', null)
      }
      if (advancement.kind !== 'current')
        return fail(notYet('E1', `an advancement that is ${advancement.kind}`, '#502 1.4'))
      checkpoint = read.ok.checkpoint
      revision = read.ok.revision
      if (resumed) iteration = mainCallIteration(read.ok.checkpoint)
      if (read.ok.state.kind !== 'ended')
        state = waking && read.ok.state.kind === 'waiting' ? resumeState : goingOn(read.ok.state)
      waking = false
      if (cancellationOf(read.ok) !== undefined) return step('cancel', null)
      return step('allowed', null)
    },
    async E2() {
      const loaded = await load()
      if ('failure' in loaded)
        return loaded.failure.kind === 'unavailable'
          ? waitFor('E2', loaded.failure, async latest => succeed(latest))
          : loaded
      takeLatestPosition(loaded.ok)
      if (advancementOf(loaded.ok).kind !== 'current') return step('reconciled', null)
      snapshot = withPendingCommit(loaded.ok)
      if (snapshot.unresolved.length > 0 || cancellationOf(snapshot) !== undefined)
        return step('reconciled', null)
      const read = await readFacts(snapshot)
      if ('failure' in read) {
        if (read.failure.kind === 'unavailable') return waitFor('E2', read.failure, readFacts)
        if (read.failure.kind === 'stale-advance') return waitForRevocationCause()
        return read
      }
      facts = read.ok
      return step('reconciled', null)
    },
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
    async E3() {
      return step('passed')
    },
    async O0() {
      return step('delivered', null)
    },
    async E9() {
      entry.idle()
      return step('idle', null)
    },
    async W0() {
      resumeState = state.kind === 'waiting' ? resumeState : state
      if (finishWait) {
        finishWait = false
        finishRefused = false
        finishUnavailable = null
        yieldedWait = true
        return step('saved-wait', null)
      }
      const original =
        pendingCommit?.operation ?? reconciliationOperations[0] ?? snapshot?.unresolved[0]
      if (original !== undefined) return fail({ kind: 'commit-unknown', operation: original })
      if (
        snapshot?.state.kind === 'waiting' &&
        canonical(snapshot.state.waits) === canonical(waits)
      ) {
        yieldedWait = true
        savedWait = true
        return step('saved-wait', null)
      }
      const saved = await commit('W0', required(checkpoint, 'checkpoint').position, {
        state: { kind: 'waiting', waits },
        events: [{ kind: 'waiting', waits }],
      })
      if ('failure' in saved) {
        if (saved.failure.kind === 'unavailable') {
          yieldedWait = true
          return step('unsaved-wait', null)
        }
        if (saved.failure.kind !== 'changed') return saved
        waking = true
        return step('reconciled', null)
      }
      yieldedWait = true
      savedWait = true
      return step('saved-wait', null)
    },
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
        const withdrawn = await closing.withdrawOpen(snapshot.checkpoint, 'R0/fault', fault)
        if ('failure' in withdrawn) return withdrawn
        const pending = pendingPassage(snapshot.checkpoint.passages)
        if (pending !== null) return fail(pending)
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
      return finishRefused ? await refusedFinishRoute(read.ok) : step('reconciled', null)
    },
  } satisfies Partial<Record<LoopNode, Handler>>

  const runIter = {
    async I0() {
      const at = required(facts, 'facts')
      const next = stepOf(ordinalOf(required(checkpoint, 'checkpoint').step) + 1)
      iteration = newIteration(next, at.batch, 0)
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
    async I3() {
      const current = required(iteration, 'iteration')
      const restored = await readCompletion(current)
      if ('failure' in restored) return restored
      const result = restored.ok.result
      current.result = result
      // Processing closes a received result's duty; a lost call never had a result in custody.
      const caller: CallerCommit =
        (entry.jointCommits ?? []).includes('processed') && current.lost === null
          ? {
              kind: 'processed',
              result: result.produced,
              consumption: required(current.pending, 'pending call').consumption,
              completion: restored.ok.completion,
            }
          : { kind: 'none' }
      if (result.kind === 'interrupted')
        return step('partial', { checkpoint: { calls: [] }, caller })
      if (result.kind === 'unusable') {
        if (current.lost !== null)
          return step('lost', {
            checkpoint: { calls: [], ...lostIntent(required(checkpoint, 'checkpoint'), current) },
            caller,
          })
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
                `${execution}/${current.step}/${noReplyReason(result)}`,
                failure,
              ),
            },
            failure,
          }
        }
        return step('try-finish', { caller })
      }
      const pending = required(current.pending, 'pending call')
      const call = invocationParts(pending.reference, access.tenant).call
      if (outcome === null) {
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
      const processed =
        caller.kind === 'processed' ? { ...caller, completion: outcome.record } : caller
      outcome = null
      candidate = null
      pendingHandoff = null
      if (decision !== 'prepared')
        return step('rejected', { checkpoint: { calls: [] }, caller: processed })
      return step('admitted', { checkpoint: { calls: [] }, caller: processed })
    },
    async I4() {
      const admitted = admittedReply()
      if ('failure' in admitted) return admitted
      const { step: of, reply, produced } = admitted.ok
      const actions = reply.blocks
        .filter(block => block.kind === 'tool_call')
        .map((block, index) => actionOf(of, block, index))
      return step(actions.length === 0 ? 'empty' : 'tools', {
        checkpoint: {
          batch: {
            id: mainBatch(of),
            source: produced,
            actions,
            barrier: { kind: 'closed', judging: actions.map(action => action.id), asked: [] },
            slots: [],
            batchPass: null,
          },
        },
      })
    },
    async I8() {
      const read = await load()
      if ('failure' in read) return read
      if (advancementOf(read.ok).kind !== 'current') return fail({ kind: 'stale-advance' })
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
      return evaluated.ok.on === 'wait'
        ? step('wait', null)
        : step(evaluated.ok.on, {
            checkpoint: {
              batch: null,
              passages: extensionPassages(required(checkpoint, 'checkpoint').passages),
            },
            state: { kind: 'advancing' },
          })
    },
  } satisfies Partial<Record<LoopNode, Handler>>

  async function receivedOfConsumption(
    consumption: ConsumptionId,
  ): Promise<Outcome<readonly ReceivedEntry[], Failure>> {
    return ports.entries.receivedOf({ ...access, execution, consumption })
  }

  async function batchToolCalls(
    batch: ActionBatch,
  ): Promise<Outcome<ReadonlyMap<string, ActionToolCall>, Failure>> {
    if (batch.source.producer.kind !== 'model')
      return fail(defect('A0: a batch whose source is not a Model reply'))
    return readBatchToolCalls(
      ports,
      access,
      execution,
      required(checkpoint, 'checkpoint').step,
      batch,
    )
  }

  function currentBatch(): ActionBatch {
    return required(required(checkpoint, 'checkpoint').batch, 'action batch')
  }

  async function toolWait(node: LoopNode, batch: ActionBatch) {
    const open = openToolCalls(batch)
    const known = { held: heldTools, unaccepted: unacceptedToolActions }
    const asked = await contactToolCalls({ ports, access }, open, known)
    if ('failure' in asked) return waitFor(node, asked.failure, null)
    if (asked.ok === 'unaccepted') return step(node === 'T3' ? 'dispatch' : 'received', null)
    waitingAt = node
    recheckDependency = null
    waits = open.map(pending => ({ kind: 'producer' as const, pending }))
    return step('wait', null)
  }

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

  async function receivedToolDelivery<K extends 'result' | 'placeholder'>(
    action: Action,
    kinds: readonly K[],
  ): Promise<Outcome<ReceivedToolDelivery<K> | null, Failure>> {
    const pending = toolCall(action)
    if (pending === null) return succeed(null)
    const received = await receivedOfConsumption(pending.consumption)
    if ('failure' in received) return received
    const found = toolReceivedOf(received.ok, pending, kinds)
    if (found === undefined) return succeed(null)
    const { material: source, ...expected } = found
    const material = await ports.materials.read({ ...access, source })
    if ('failure' in material) return material
    const delivery = readToolDeliveryMaterial(access, material.ok, expected)
    if (!isToolReturnOf(delivery, kinds, found))
      return fail({
        kind: 'invalid',
        field: 'received.material',
        reason: 'invalid schema or original binding',
      })
    return succeed({ entry: found, delivery, pending })
  }

  type Sent = Readonly<{
    batch: ActionBatch
    progressed: boolean
    unavailable?: Extract<Failure, { kind: 'unavailable' }>
  }>

  async function slotDeniedAtJudgment(batch: ActionBatch): Promise<Outcome<Sent, Failure>> {
    let slotted = batch
    for (const action of batch.actions)
      if (action.judgment.kind === 'denied' && slotOf(batch, action.id) === undefined)
        slotted = replaceSlot(slotted, deniedSlot(action, action.judgment.evidence))
    if (slotted === batch) return succeed({ batch, progressed: false })
    const saved = await commit('A2', 'A2', { checkpoint: { batch: slotted } })
    return 'failure' in saved ? saved : succeed({ batch: slotted, progressed: true })
  }

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

  async function prepareHandoff(request: PendingHandoff) {
    const fixed = await ports.handoff.prepare({
      ...access,
      kind: 'execution',
      request,
      advance: required(authority, 'authority'),
    })
    unpreparedHandoff = 'failure' in fixed && fixed.failure.kind === 'unavailable' ? request : null
    return fixed
  }

  async function sendAction(batch: ActionBatch, original: Action): Promise<Outcome<Sent, Failure>> {
    if (original.judgment.kind !== 'allowed') return succeed({ batch, progressed: false })
    let next = batch
    let action = original
    if (original.call === null) {
      unacceptedToolActions.add(original.id)
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
      unacceptedToolActions.delete(action.id)
      return fail({ kind: 'unavailable', owner: 'toolRuntime', diagnostic: diagnosticOf(error) })
    }
    if (result.kind === 'rejected' && result.failure.kind === 'unavailable') {
      const unavailable = {
        kind: 'unavailable' as const,
        owner: 'toolRuntime',
        diagnostic: result.failure.diagnostic ?? result.failure.dependency,
      }
      return succeed({ batch: next, progressed: false, unavailable })
    }
    if (result.kind === 'rejected') {
      if (!unacceptedToolActions.has(action.id)) return succeed({ batch: next, progressed: false })
      const evidence = agentEvidence(`${execution}/${action.id}/rejected`, result.failure)
      next = replaceSlot(next, deniedSlot(action, evidence))
      const closed = refusedTool(required(checkpoint, 'checkpoint'), action.id, evidence)
      const saved = await commit('A2', 'A2', { checkpoint: { batch: next, ...closed } })
      if ('failure' in saved) return saved
      unacceptedToolActions.delete(action.id)
      return succeed({ batch: next, progressed: true })
    }
    unacceptedToolActions.delete(action.id)
    if (result.kind === 'association-unknown') return succeed({ batch: next, progressed: false })
    if (result.kind === 'accepted') heldTools.add(action.id)
    return associate(next, action, pending, result.reference)
  }

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

  async function deniedSlotCandidate(action: Action): Promise<Outcome<Message, Failure>> {
    const answer = action.judgment.kind === 'denied' ? action.judgment.answer : undefined
    if (answer === undefined) {
      if (deniedUnchecked(execution, currentBatch(), action))
        return succeed(uncheckedCandidate(execution, action))
      const denial = denialOf(required(checkpoint, 'checkpoint').passages, action.id)
      return succeed(deniedCandidate(execution, action, denial))
    }
    const material = await ports.materials.read({ ...access, source: answer })
    if ('failure' in material) return material
    const text = toolCallAnswerOf(material.ok)
    if (text === null)
      return fail({ kind: 'invalid', field: 'judgment.answer', reason: 'not a call answer' })
    return succeed(answeredCandidate(execution, action, text))
  }

  async function backgroundCandidate(action: Action): Promise<Outcome<Message, Failure>> {
    const received = await receivedToolDelivery(action, ['placeholder'])
    if ('failure' in received) return received
    if (received.ok === null)
      return fail(defect('T2: a background slot without its received placeholder'))
    const call = toolCallOf(access, received.ok.pending)
    return succeed(placeholderCandidate(execution, action, call, received.ok.delivery.source))
  }

  async function computedCandidate(
    action: Action,
    slot: ActionSlot,
  ): Promise<Outcome<Message, Failure>> {
    if (slot.each !== null && slot.each.length > 0)
      return fail(notYet('T2', 'a single-result passage with conclusions', '#502 stage 5'))
    if (slot.kind === 'denied') return deniedSlotCandidate(action)
    if (slot.kind === 'background') return backgroundCandidate(action)
    if (slot.kind !== 'result') return fail(defect(`T2: no candidate of a ${slot.kind} slot`))
    const received = await receivedToolDelivery(action, ['result'])
    if ('failure' in received) return received
    if (received.ok === null) return fail(defect('T2: a result slot without its received entry'))
    return succeed(toolResultCandidate(execution, action, received.ok.delivery.value.content))
  }

  async function prepareSlotMessage(
    batch: ActionBatch,
    action: Action,
    slot: ActionSlot,
    source: InternalSource,
  ): Promise<Outcome<PendingHandoff, Failure>> {
    const candidate = await slotCandidate(action, slot)
    if ('failure' in candidate) return candidate
    const position = { step: required(checkpoint, 'checkpoint').step, node: 'T5', slot: action.id }
    return saveHandoff('T5', 'T5', { position, source, candidate: candidate.ok }, reference => ({
      batch: replaceSlot(batch, { ...slot, handoff: reference }),
    }))
  }

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

  type SlotAdmission =
    | Readonly<{ kind: 'wait' }>
    | Readonly<{ kind: 'admitted' | 'rejected'; completion: DurableEvidence }>

  function disposedSlot(
    existing: ExecutionSnapshot['handoffs'][number],
    source: InternalSource,
  ): Outcome<SlotAdmission, Failure> {
    const recorded = recordedOutcome(existing.resolution)
    if (existing.history.kind === 'committed')
      return succeed({
        kind: 'admitted',
        completion: required(recorded ?? null, 'committed H outcome').record,
      })
    if (recorded?.decision.kind !== 'rejected')
      return fail(notYet('T5', 'a retired tool message handoff', '#502 stage 5'))
    rejectedMessage = { source, evidence: recorded.decision.evidence }
    return succeed({ kind: 'rejected', completion: recorded.record })
  }

  function slotHandoff(slot: ActionSlot): ExecutionSnapshot['handoffs'][number] | undefined {
    const handoff = slot.handoff
    if (handoff === null) return undefined
    return required(snapshot, 'snapshot').handoffs.find(
      record => canonical(record.handoff) === canonical(handoff),
    )
  }

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

  async function admitSlot(action: Action): Promise<Outcome<SlotAdmission, Failure>> {
    const batch = currentBatch()
    const slot = slotOf(batch, action.id)
    if (slot === undefined) return fail(defect('T5 with an action without a slot'))
    if (slot.kind === 'dispatched') return fail(defect('T5 with a dispatched slot'))
    const source = slotSource(access, action, slot)
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
    return fixed.ok === 'wait' ? succeed({ kind: 'wait' }) : admitFixed(request, fixed.ok, source)
  }

  async function admitFixed(
    request: PendingHandoff,
    fixed: HandoffOutcome,
    source: InternalSource,
  ): Promise<Outcome<SlotAdmission, Failure>> {
    const applied = await applySlotMessage(request, fixed)
    if ('failure' in applied) return applied
    if (fixed.decision.kind === 'prepared')
      return succeed({ kind: 'admitted', completion: fixed.record })
    rejectedMessage = { source, evidence: fixed.decision.evidence }
    return succeed({ kind: 'rejected', completion: fixed.record })
  }

  async function completeSlotProcessing(
    action: Action,
    completion: DurableEvidence,
  ): Promise<Outcome<void, Failure>> {
    const batch = currentBatch()
    const slot = required(slotOf(batch, action.id) ?? null, 'admitted tool slot')
    if (slot.kind !== 'result' || slot.completion !== null) return succeed(undefined)
    const pending = required(toolCall(action), 'associated Tool call')
    return commit('T5', 'T5', {
      checkpoint: { batch: replaceSlot(batch, { ...slot, completion }) },
      caller: (entry.jointCommits ?? []).includes('processed')
        ? { kind: 'processed', result: slot.result, consumption: pending.consumption, completion }
        : { kind: 'none' },
    })
  }

  type RoundCards =
    | Readonly<{ kind: 'cards'; cards: readonly DurableEvidence[] }>
    | Readonly<{ kind: 'refused'; failure: DurableEvidence }>
    | Readonly<{ kind: 'unknown'; failure: Extract<Failure, { kind: 'unavailable' }> }>

  async function roundCards(
    request: NonNullable<ReturnType<typeof presentRequest>>,
  ): Promise<Outcome<RoundCards, Failure>> {
    const unknown = (owner: string, diagnostic: string): Outcome<RoundCards, Failure> =>
      succeed({ kind: 'unknown', failure: { kind: 'unavailable', owner, diagnostic } })
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (unsentRounds.has(request.round)) {
        unsentRounds.delete(request.round)
        const presented = await ports.cards.present({
          ...access,
          advance: required(authority, 'authority'),
          ...request,
        })
        if ('ok' in presented) return succeed({ kind: 'cards', cards: presented.ok })
        const { failure } = presented
        if (failure.kind === 'denied' || failure.kind === 'conflict' || failure.kind === 'invalid')
          return succeed({
            kind: 'refused',
            failure: agentEvidence(`${request.round}/present-failed`, failure),
          })
        if (failure.kind !== 'commit-unknown' && failure.kind !== 'unavailable') return presented
      }
      const found = await ports.cards.lookup({ ...access, execution, ...request })
      if ('failure' in found) {
        if (found.failure.kind !== 'unavailable') return found
        return succeed({ kind: 'unknown', failure: found.failure })
      }
      if (found.ok.kind === 'presented') return succeed({ kind: 'cards', cards: found.ok.cards })
      if (found.ok.kind === 'unknown')
        return unknown('agentDecisionCards', 'the result of presenting a card round is unknown')
      unsentRounds.add(request.round)
    }
    return unknown('agentDecisionCards', 'the result of presenting a card round is unknown')
  }

  async function presentRounds(batch: ActionBatch, saved: readonly Passage[]) {
    const instant = await ports.clock.now()
    if ('failure' in instant) return instant
    let passages = saved
    let unknown: Extract<Failure, { kind: 'unavailable' }> | null = null
    const actions: Action[] = []
    for (const action of batch.actions) {
      const chain = chainOf(passages, action)
      const request = chain === null ? null : presentRequest(chain)
      if (chain === null || request === null) {
        actions.push(action)
        continue
      }
      const cards = await roundCards(request)
      if ('failure' in cards) return cards
      if (cards.ok.kind === 'unknown') {
        unknown = cards.ok.failure
        actions.push(action)
        continue
      }
      const next =
        cards.ok.kind === 'cards'
          ? afterPresented(passages, action, chain, cards.ok.cards)
          : afterPresentRefused(passages, action, chain, cards.ok.failure, instant.ok)
      if ('failure' in next) return fail(defect(`A1: ${next.failure.step} is not defined here`))
      passages = next.ok.passages
      actions.push(next.ok.action)
    }
    if (passages !== saved)
      return step('carded', { checkpoint: { batch: { ...batch, actions }, passages } })
    return waitFor('A1', required(unknown, 'unknown present'), null)
  }

  async function readCards(batch: ActionBatch, saved: readonly Passage[]) {
    let passages = saved
    const actions: Action[] = []
    for (const action of batch.actions) {
      let current = action
      for (const card of humanWaits(passages, [action])[0]?.cards ?? []) {
        const reply = await ports.cards.read({ ...access, card })
        if ('failure' in reply) {
          if (reply.failure.kind !== 'unavailable') return reply
          continue
        }
        const chain = chainOf(passages, current)
        if (reply.ok.kind === 'pending' || chain === null) continue
        const next = afterReply(passages, current, chain, card, reply.ok)
        if ('failure' in next) return fail(defect(`A1: ${next.failure.step} is not defined here`))
        passages = next.ok.passages
        current = next.ok.action
      }
      actions.push(current)
    }
    if (passages !== saved)
      return step('carded', { checkpoint: { batch: { ...batch, actions }, passages } })
    recheckDependency = null
    waits = humanWaits(passages, batch.actions)
    waitingAt = 'A1'
    return step('wait', null)
  }

  const runTools = {
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
      const parts = await batchToolCalls(batch)
      if ('failure' in parts) return parts
      let passages = required(checkpoint, 'checkpoint').passages
      const answers: Extract<ToolAdmission, { kind: 'judged' | 'allowed' }>[] = []
      const opened: CardRoundId[] = []
      const pass = { id: batch.id, pass: globalThis.crypto.randomUUID() }
      for (const action of batch.actions) {
        if (needOfAction(passages, action) !== 'judge') {
          answers.push({ kind: 'judged', action })
          continue
        }
        const chain = chainOf(passages, action)
        const handBack = handBackOf(chain)
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
          withChosenRewrite(action, chain, handBack),
          original,
          handBack,
          pass,
        )
        if ('failure' in admitted) return admitted
        if (admitted.ok.kind === 'unavailable') return waitFor('A0', admitted.ok, null)
        if (admitted.ok.kind === 'refused') {
          const ended = await closing.endRefused(batch, answers, passages, opened, admitted.ok)
          return 'failure' in ended ? ended : step('judged', { checkpoint: ended.ok })
        }
        if (chain === null && admitted.ok.kind !== 'asked') {
          answers.push(
            admitted.ok.kind === 'denied'
              ? { kind: 'judged', action: admitted.ok.action }
              : admitted.ok,
          )
          continue
        }
        const instant = await ports.clock.now()
        if ('failure' in instant) return instant
        const judged = afterAdmission(passages, admitted.ok, chain, instant.ok)
        if ('failure' in judged)
          return fail(defect(`A0: ${judged.failure.step} is not defined here`))
        passages = judged.ok.passages
        if (judged.opened !== undefined) opened.push(judged.opened)
        answers.push(
          admitted.ok.kind === 'allowed'
            ? admitted.ok
            : { kind: 'judged', action: judged.ok.action },
        )
      }
      const budget = entry.toolConcurrency
      const actions: Action[] = []
      for (const answer of answers) {
        if (answer.kind === 'judged') {
          actions.push(answer.action)
          continue
        }
        if (budget === undefined)
          return fail(
            localFailure('invariant', {
              kind: 'unavailable' as const,
              owner: '@omne-harness/agent',
              diagnostic: 'toolConcurrency is unavailable',
            }),
          )
        const preserved = await preserveAllowedRequest(ports, access, execution, answer, budget)
        if ('failure' in preserved) return preserved
        actions.push(preserved.ok)
      }
      for (const round of opened) unsentRounds.add(round)
      return step('judged', { checkpoint: { batch: { ...batch, actions }, passages } })
    },
    async A1() {
      const batch = currentBatch()
      const passages = required(checkpoint, 'checkpoint').passages
      const needs = batch.actions.map(action => needOfAction(passages, action))
      if (needs.includes('judge')) return step('judge', null)
      if (needs.includes('closed')) {
        const ended = await closing.endAnswerless(batch, passages)
        return 'failure' in ended ? ended : step('carded', { checkpoint: ended.ok })
      }
      if (needs.includes('present')) return presentRounds(batch, passages)
      if (needs.includes('read')) return readCards(batch, passages)
      const approved = batch.actions
        .filter(action => action.judgment.kind === 'allowed')
        .map(action => action.id)
      const [first, ...rest] = approved
      const evidence = agentEvidence(`${execution}/${batch.id}/barrier`, batch.actions)
      const settled = adopted(passages, evidence)
      if (first === undefined)
        return step('denied', {
          checkpoint: {
            batch: { ...batch, barrier: { kind: 'all-denied', evidence } },
            passages: settled,
          },
        })
      return step('open', {
        checkpoint: {
          batch: { ...batch, barrier: { kind: 'open', evidence, approved: [first, ...rest] } },
          passages: settled,
        },
      })
    },
    // A2 commits only changed facts: every commit raises the execution revision,
    // and a Tool start requires that revision unchanged.
    async A2() {
      const slotted = await slotDeniedAtJudgment(currentBatch())
      if ('failure' in slotted) return slotted
      let { batch, progressed } = slotted.ok
      for (const original of unsent(batch, unacceptedToolActions)) {
        const sent = await sendAction(batch, original)
        if ('failure' in sent) return sent
        if (sent.ok.unavailable !== undefined) return waitFor('A2', sent.ok.unavailable, null)
        batch = sent.ok.batch
        progressed ||= sent.ok.progressed
      }
      if (progressed) return step('dispatched')
      const idle = !batch.slots.some(slot => slot.kind === 'dispatched')
      if (idle && unsent(batch, unacceptedToolActions).length > 0) return toolWait('A2', batch)
      return step('dispatched', null)
    },
    async T0() {
      const read = await advancing()
      if ('failure' in read) return read
      const batch = currentBatch()
      const dispatched = batch.actions.filter(
        action => slotOf(batch, action.id)?.kind === 'dispatched',
      )
      for (const action of dispatched) {
        const received = await receivedToolDelivery(action, RETURN_KINDS)
        if ('failure' in received) return received
        if (received.ok !== null) return step('received', null)
      }
      if (dispatched.length === 0) return step('received', null)
      return toolWait('T0', batch)
    },
    async T1() {
      const read = await advancing()
      if ('failure' in read) return read
      let batch = currentBatch()
      let calls = required(checkpoint, 'checkpoint').calls
      const events: CommitEvent[] = []
      for (const action of batch.actions) {
        if (slotOf(batch, action.id)?.kind !== 'dispatched') continue
        const received = await receivedToolDelivery(action, RETURN_KINDS)
        if ('failure' in received) return received
        if (received.ok === null) continue
        const { pending } = received.ok
        const { slot, result } = receivedSlot(action.id, toolCallOf(access, pending), received.ok)
        batch = replaceSlot(batch, slot)
        calls = calls.filter(call => call.kind !== 'tool' || call.action !== action.id)
        events.push({ kind: 'producer', result, consumption: pending.consumption })
      }
      return step('kept', { checkpoint: { batch, calls }, events })
    },
    async T2() {
      const read = await advancing()
      if ('failure' in read) return read
      let batch = currentBatch()
      for (const action of batch.actions) {
        const passed = passingSlot(slotOf(batch, action.id))
        if (passed === null) continue
        const candidate = await computedCandidate(action, passed)
        if ('failure' in candidate) return candidate
        batch = replaceSlot(batch, { ...passed, candidateDigest: candidateDigest(candidate.ok) })
      }
      return step('passed', { checkpoint: { batch } })
    },
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
      if (unsent(batch, unacceptedToolActions).length > 0) return step('dispatch', null)
      return toolWait('T3', batch)
    },
    async T4() {
      return step('proceed', { checkpoint: { batch: { ...currentBatch(), batchPass: [] } } })
    },
    async T5() {
      const read = await advancing()
      if ('failure' in read) return read
      for (const action of currentBatch().actions) {
        const admitted = await admitSlot(action)
        if ('failure' in admitted) return admitted
        if (admitted.ok.kind === 'wait') return step('wait', null)
        const processed = await completeSlotProcessing(action, admitted.ok.completion)
        if ('failure' in processed) return processed
        if (admitted.ok.kind === 'rejected') return step('rejected', null)
      }
      return step('admitted')
    },
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

  const prepareRequest = {
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
      if (prepared.ok.kind === 'ready')
        return fail(
          localFailure('invariant', {
            kind: 'unavailable',
            owner: 'requestPreparation',
            diagnostic: 'I1: the first prepare returned ready before the before-model passage',
          }),
        )
      const write = {
        checkpoint: {
          priorConditions: conditions.ok.source,
          ...(prepared.ok.kind === 'assembled' ? {} : { requestPreparation: prepared.ok }),
        },
      }
      if (prepared.ok.kind === 'needs-compaction') {
        return step('compact', write)
      }
      return step(prepared.ok.kind === 'cannot-fit' ? 'try-finish' : 'prepared', write)
    },
    async P0() {
      return step('proceed')
    },
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
      if (prepared.ok.kind === 'needs-compaction') {
        if (required(checkpoint, 'checkpoint').compaction !== null)
          return fail(invalidCompaction('a preparation cannot start another compaction task'))
        return step('compact', { checkpoint: { requestPreparation: prepared.ok } })
      }
      if (prepared.ok.kind === 'cannot-fit')
        return step('try-finish', { checkpoint: { requestPreparation: prepared.ok } })
      if (prepared.ok.kind !== 'ready')
        return fail(notYet('P1', `a ${prepared.ok.kind} preparation`, '#502 1.5 and stage 4'))
      current.ready = prepared.ok
      return step('ready')
    },
  } satisfies Partial<Record<LoopNode, Handler>>

  const compact = compactionNodes<P>({
    ports,
    access,
    execution,
    provider: entry.compactionProvider,
    jointCommits: entry.jointCommits ?? [],
    authority: () => authority,
    checkpoint: () => checkpoint,
    advancing,
    waitFor,
    saveHandoff,
    prepareHandoff,
    select,
    restoredIteration,
  })

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

  function mainPosition(step: StepId): ConsumerRef {
    return { owner: AGENT_OWNER, work: `${execution}/${step}`, position: 'I3', purpose: 'main' }
  }

  function attemptOf(of: StepId): number {
    return voidedModelIntents(required(checkpoint, 'checkpoint').voided, of)
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

  function mainCallIteration(at: AgentCheckpoint): Iteration | null {
    const pending = at.calls[0]
    if (pending?.kind !== 'model' || pending.purpose !== 'main') return null
    return {
      ...newIteration(at.step, null, attemptOf(at.step)),
      action: pending.action,
      consumption: pending.consumption,
      position: pending.position,
      pending,
      admission: 'unknown',
    }
  }

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
      lost: null,
      result: null,
      admission: 'new',
    }
  }

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
    async I2() {
      const current = required(iteration, 'iteration')
      const ready = required(current.ready, 'ready preparation')
      current.pending = mainPending(current.step, ready)
      return step('call', null)
    },
    async M0() {
      const current = required(iteration, 'iteration')
      const pending = required(current.pending, 'pending call')
      const ready = required(current.ready, 'ready preparation')
      return step('recorded', {
        checkpoint: {
          calls: [pending],
          adoptedContext: ready.coverage,
          requestPreparation: null,
          compaction: null,
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
        const asked = await contactMainCall(ports, access, pending, () => receivedOf(pending))
        if (asked.kind === 'journal-failed') return fail(asked.failure)
        if (asked.kind === 'model-failed') return modelWait('M6', asked.failure)
        if (asked.kind === 'not-accepted') return voided(current, pending, asked)
        if (asked.kind === 'unknown') return producerWait('M6', pending)
        if (asked.kind === 'lost') current.lost = asked.evidence
        current.admission = 'accepted'
        state = { kind: 'advancing' }
        return step('admitted', null)
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
      if (current.lost !== null) return step('settled', null)
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
      if (current.lost !== null) return step('kept', null)
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
    async M4() {
      return step('proceed', null)
    },
    async M5() {
      const pending = required(required(iteration, 'iteration').pending, 'pending call')
      if (pending.position.position !== 'I3')
        return fail(notYet('M5', `a return to ${pending.position.position}`, '#502 stage 4'))
      return step('return-I3', null)
    },
  } satisfies Partial<Record<LoopNode, Handler>>

  function voided(
    current: Iteration,
    pending: ModelPendingCall,
    answer: Extract<M.Lookup | M.CallContact, { kind: 'not-accepted' }>,
  ): Outcome<Step, Failure> {
    const admission = invocationParts(pending.reference, access.tenant).admission
    if ('operation' in answer && answer.operation !== admission)
      return fail(defect('M6: not-accepted names another admission'))
    const at = required(checkpoint, 'checkpoint')
    const attempt = attemptOf(current.step)
    const basis = agentEvidence(`${execution}/${current.step}/voided/${attempt}`, {
      reference: pending.reference,
      answer,
    })
    const record = unacceptedIntent(current.step, pending, basis)
    iteration = newIteration(current.step, current.batch ?? at.inputBatch, attempt + 1)
    state = { kind: 'advancing' }
    return step('voided', {
      checkpoint: {
        calls: at.calls.filter(
          call => call.kind !== 'model' || call.reference !== pending.reference,
        ),
        voided: [...at.voided, record],
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
  ): Promise<Outcome<{ result: ModelResult; completion: DurableEvidence }, Failure>> {
    const pending = required(current.pending, 'pending call')
    const call = invocationParts(pending.reference, access.tenant).call
    if (current.lost !== null)
      return succeed({ result: lostModelResult(call, current.lost), completion: current.lost })
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
    if (current?.result?.kind !== 'unusable' || current.pending === null)
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
          const read = await ports.models.calls.contact({
            ...access,
            reference: pending.reference,
          })
          return 'failure' in read ? fail(modelUnavailable(node, read.failure)) : read
        })
      : fail(modelFailure(node, failure))
  }

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
    if (failure.kind === 'conflict') return voided(current, pending, recalled.ok)
    // An unknown write is never repeated in this turn, even if inspection cannot yet find it.
    return producerWait('M6', pending)
  }

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

  function takeLatestPosition(read: ExecutionSnapshot): void {
    checkpoint = read.checkpoint
    revision = read.revision
    if (read.state.kind !== 'ended' && read.state.kind !== 'waiting') state = goingOn(read.state)
  }

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

  async function interruptForCancel(
    control: ControlRecord,
    pending: PendingCall,
  ): Promise<Outcome<void, Failure>> {
    const interrupt = cancelInterrupt(access, control, pending)
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

  function refusedSettlement(failure: Failure): Outcome<Step, Failure> {
    if (failure.kind === 'changed') cancellationChanged = true
    return failure.kind === 'changed' || failure.kind === 'commit-unknown'
      ? step('reconcile', null)
      : fail(failure)
  }

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

  function finishAuthorization(read: ExecutionSnapshot): FinishAuthorization {
    const cancel = cancellationOf(read)
    return cancel === undefined
      ? { kind: 'advancement', authority: required(authority, 'authority') }
      : { kind: 'cancel', control: cancel.operation, source: cancel.stages.accepted.source }
  }

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

  function finishOutcome(
    finished: Awaited<ReturnType<typeof ports.journal.tryFinish>>,
  ): Outcome<Step, Failure> {
    if ('failure' in finished) {
      if (finished.failure.kind === 'unavailable') {
        finishUnavailable = finished.failure
        finishRefused = true
        return step('reconcile', null)
      }
      if (finished.failure.kind !== 'commit-unknown') return finished
      return step('reconcile', null)
    }
    if (finished.ok.kind !== 'ended') {
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
      const task = read.ok.checkpoint.compaction
      if (task !== null && task.ended === null) {
        const cancelled = await cancelCompaction(ports, {
          ...access,
          execution,
          state: task,
          preparation: originalCompactionOf(checkpoint).id,
          completion: control.stages.accepted.source,
        })
        if ('failure' in cancelled) return cancelled
      }
      for (const pending of read.ok.checkpoint.calls) {
        const interrupted = await interruptForCancel(control, pending)
        if ('failure' in interrupted) return interrupted
      }
      const withdrawn = await closing.withdrawOpen(read.ok.checkpoint, 'F0/cancel', control)
      if ('failure' in withdrawn) return withdrawn
      return step('cancelled', null)
    },
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
      if (
        preparation?.kind === 'cannot-fit' &&
        (decided?.kind !== 'try-finish' || decided.failure?.kind !== 'cannot-fit')
      ) {
        const instant = await ports.clock.now()
        if ('failure' in instant) return instant
        decided = cannotFit(execution, at.step, preparation, instant.ok)
      }
      const next = required(decided, 'decision')
      if (next.kind !== 'try-finish') throw new Error(`coordinator defect: F1 after ${next.kind}`)
      const read = latest
      // A newer input cannot be folded into a candidate made before it was accepted.
      if (read.ok.revision !== revision) {
        finishRefused = true
        return step('reconcile', null)
      }
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
        ...(next.failure?.kind === 'no-reply' || next.failure?.kind === 'model-refused'
          ? { checkpoint: { calls: [] } }
          : {}),
      })
    },
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

  const handlers: Partial<Record<LoopNode, Handler>> = {
    ...admitMessage,
    ...runExecutionNodes,
    ...runIter,
    ...runTools,
    ...prepareRequest,
    ...compact,
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
        iteration = beforeIntent || finishingFault ? null : mainCallIteration(at)
        reconciliationOperations = read.ok.unresolved
        const ran = await drive(
          pendingCommit !== null || reconciliationOperations.length > 0 ? 'R0' : 'E1',
          null,
        )
        return 'failure' in ran ? ran : succeed(undefined)
      })
    },
    async resume(input) {
      return exclusive('E1', async () => {
        const attached = await ports.journal.attach({
          ...access,
          execution,
          operation: input.operation,
          instance: binding.instance,
          grant: input.grant,
          recovery: input.recovery,
          takeover: null,
        })
        if ('failure' in attached) return fail({ node: 'E1', failure: attached.failure })
        authority = attached.ok.authority
        return succeed(attached.ok.authority)
      })
    },
    async handOver(input) {
      return exclusive('W0', async () => {
        if (!savedWait || pendingCommit !== null || reconciliationOperations.length > 0)
          return succeed(null)
        const detached = await ports.journal.detach({
          ...access,
          execution,
          operation: input.operation,
          authority: required(authority, 'authority'),
          reason: input.reason,
        })
        if ('failure' in detached) return fail({ node: 'W0', failure: detached.failure })
        yieldedWait = false
        savedWait = false
        return succeed(detached.ok)
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
          held,
          position: waitingAt,
          ...input,
        })
        if ('failure' in result) return fail({ node: 'W0', failure: result.failure })
        if (result.ok !== 'unheld') return succeed(result.ok)
        heldTools.clear()
        if (iteration?.admission === 'accepted') iteration.admission = 'unknown'
        return succeed('ready')
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
        savedWait = false
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
