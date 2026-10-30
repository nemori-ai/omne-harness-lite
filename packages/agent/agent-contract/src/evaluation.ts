// Pure evaluation types of the Agent contract (README, "身份、原位置与纯求值"): the facts the loop
// reads, the next step it returns, and the evaluator port. Types only; no function runs here.
import type { Outcome } from '@omne-harness/operation-result'
import type { Message, ToolPart } from '@omne-harness/message'
import type * as M from '@omne-harness/model-contract'
import type * as T from '@omne-harness/tool-contract'
import type { ControlRecord, ResultResponsibility } from './execution.ts'
import type {
  Adoption,
  ActionBatchId,
  ActionId,
  AgentInstant,
  AgentOperationId,
  CardRoundId,
  ConsumerRef,
  ConsumptionId,
  Continuation,
  DurableEvidence,
  InputBatchId,
  InputId,
  PassageId,
  StepId,
} from './identity.ts'
import type { JsonValue } from '@omne-harness/json-text'
import type { HandoffReference, MessageSource, Passage } from './passages.ts'
import type { CompactionProgress, CompactionState, Preparation } from './request.ts'

export type ProducedResult = Readonly<{
  producer:
    | Readonly<{ kind: 'model'; call: M.ModelCallId }>
    | Readonly<{ kind: 'tool'; call: T.ToolCallId }>
  version: string
  delivery: string | null
  source: DurableEvidence
}>
export type InputBatch = Readonly<{
  id: InputBatchId
  watermark: DurableEvidence
  ordered: readonly InputId[]
}>
export type ProgressionDirective =
  | Readonly<{ kind: 'evaluate-completion'; basis: DurableEvidence }>
  | Readonly<{ kind: 'continue'; basis: DurableEvidence }>
export type Waiting =
  | Readonly<{ kind: 'producer'; pending: PendingCall }>
  | Readonly<{ kind: 'human'; passage: PassageId; cards: readonly DurableEvidence[] }>
  | Readonly<{ kind: 'dependency'; owner: string; position: string }>
export type AgentConclusion =
  | Readonly<{ kind: 'complete' }>
  | Readonly<{ kind: 'fail' | 'cancelled'; cause: DurableEvidence }>
export type FailureCandidate = Readonly<{
  step: StepId | null
  at: AgentInstant
  source: DurableEvidence
}> &
  (
    | Readonly<{
        kind: 'cannot-fit'
        reason: 'fixed' | 'after-compaction'
        context: DurableEvidence
        veto?: DurableEvidence
        rejection?: DurableEvidence
        plan?: CompactionProgress
      }>
    | Readonly<{
        kind: 'compaction-invalid'
        plan: DurableEvidence
        progress?: Readonly<{ expected: CompactionProgress; returned: CompactionProgress }>
        transition?: DurableEvidence
      }>
    | Readonly<{
        kind: 'request-rejected'
        failure: Extract<Failure, { kind: 'invalid' }>
        model: DurableEvidence
        selection: DurableEvidence
      }>
    | Readonly<{ kind: 'no-reply'; call: M.ModelCallId; result: ProducedResult }>
    | Readonly<{ kind: 'message-rejected'; from: MessageSource; evidence: DurableEvidence }>
    | Readonly<{ kind: 'extension-stop'; passage: PassageId; reason: string }>
    | Readonly<{ kind: 'guard'; level: 3; basis: DurableEvidence }>
  )
/**
 * The narrow view Agent keeps of a compaction transition (SPEC "请求准备与压缩" 7): the exact
 * message, the lawful source basis, and, kept apart from that basis, the original candidate, the
 * plan, the complete versioned basis material, the commitment and the real history epoch.
 */
export type PreparedContextTransition = Readonly<{
  preparation: ActionId
  message: Message
  source: DurableEvidence
  derivation: DurableEvidence
  commitment: DurableEvidence
  candidate: DurableEvidence
  plan: DurableEvidence
  basis: Readonly<{ schema: Adoption; value: JsonValue }>
  epoch: string
}>
export type Failure =
  | Readonly<{ kind: 'denied'; action: string }>
  | Readonly<{ kind: 'invalid'; field: string; reason: string }>
  | Readonly<{ kind: 'unavailable'; owner: string; diagnostic: string }>
  | Readonly<{
      kind: 'stale-advance' | 'not-ready' | 'terminal' | 'busy' | 'changed' | 'unsupported'
    }>
  | Readonly<{ kind: 'commit-unknown'; operation: AgentOperationId }>
  | Readonly<{ kind: 'conflict'; operation: AgentOperationId }>
export type Reply<A> = Promise<Outcome<A, Failure>>
export type ModelPurpose = 'main' | 'compaction' | 'extension'
type PendingCommon = Readonly<{
  action: ActionId
  consumption: ConsumptionId
  position: ConsumerRef
  fixed: DurableEvidence
}>
export type PendingCall = PendingCommon &
  (
    | Readonly<{
        kind: 'model'
        reference: M.ModelInvocationRef
        purpose: ModelPurpose
      }>
    | (Readonly<{
        kind: 'tool'
        purpose: 'action'
        call?: never
        admission?: never
      }> &
        (
          | Readonly<{ association: 'intent'; reference?: never }>
          | Readonly<{ association: 'associated'; reference: T.ToolInvocationRef }>
        ))
  )
export type ActionJudgment =
  | Readonly<{ kind: 'pending'; passage: PassageId }>
  | Readonly<{ kind: 'waiting'; passage: PassageId; cards: readonly DurableEvidence[] }>
  | Readonly<{ kind: 'denied'; evidence: DurableEvidence }>
  | Readonly<{ kind: 'allowed'; evidence: DurableEvidence; request: T.ToolInvokeRequest }>
export type Action = Readonly<{
  id: ActionId
  original: ToolPart & Readonly<{ kind: 'tool_call' }>
  effectiveArguments: string
  judgment: ActionJudgment
  call: PendingCall | null
}>
export type ActionBarrier =
  | Readonly<{
      kind: 'closed'
      judging: readonly ActionId[]
      asked: readonly Readonly<{ action: ActionId; passage: PassageId; round: CardRoundId }>[]
    }>
  | Readonly<{
      kind: 'open'
      evidence: DurableEvidence
      approved: readonly [ActionId, ...ActionId[]]
    }>
  | Readonly<{ kind: 'all-denied'; evidence: DurableEvidence }>
export type ActionSlot = Readonly<{
  action: ActionId
  each: readonly PassageId[] | null
  candidate: Message | null
  handoff: HandoffReference | null
}> &
  (
    | Readonly<{ kind: 'denied'; evidence: DurableEvidence }>
    | Readonly<{ kind: 'dispatched' }>
    | Readonly<{
        kind: 'result'
        result: ProducedResult
        terminal: T.ToolTerminal
        custody: DurableEvidence
      }>
    | Readonly<{ kind: 'background'; placeholder: ProducedResult; confirmation: DurableEvidence }>
  )
export type ActionBatch = Readonly<{
  id: ActionBatchId
  source: ProducedResult
  actions: readonly Action[]
  barrier: ActionBarrier
  slots: readonly ActionSlot[]
  batchPass: readonly PassageId[] | null
}>
export type ModelReplyAdmission = Readonly<{
  step: StepId
  action: ActionId
  call: M.ModelCallId
  resultVersion: string
  decision: 'admitted' | 'rejected'
  source: DurableEvidence
}>
export type ReplyAdmissionProjection = Readonly<{
  through: DurableEvidence
  rule: Adoption
  lastAdmission: DurableEvidence | null
  consecutiveDenials: string
  totalDenials: string
}>
export type ReplyAdmissionPage =
  | Readonly<{
      kind: 'page'
      through: DurableEvidence
      items: readonly Readonly<{ sequence: string; fact: ModelReplyAdmission }>[]
      next: string | null
      complete: boolean
    }>
  | Readonly<{ kind: 'gap'; recovery: DurableEvidence }>
export type GuardLevel = 0 | 1 | 2 | 3
export type GuardFact = Readonly<{
  level: GuardLevel
  policy: Adoption
  through: DurableEvidence
  basis: DurableEvidence
  passage: PassageId
  at: AgentInstant
}>
export type AgentCheckpoint = Readonly<{
  schema: Adoption
  definition: Adoption
  step: StepId
  position: string
  calls: readonly PendingCall[]
  passages: readonly Passage[]
  batch: ActionBatch | null
  inputBatch: InputBatchId | null
  requestPreparation: Preparation | null
  compaction: CompactionState | null
  adoptedContext: DurableEvidence | null
  guard: GuardFact | null
  completedPassages: readonly PassageId[]
  priorConditions: DurableEvidence | null
  /** The H of the current source position; set by P, cleared or moved only by a Ja, never by Rh. */
  currentHandoff: HandoffReference | null
}>
export type RuntimeConditions = Readonly<{
  source: DurableEvidence
  configuration: Adoption
  progression: ProgressionDirective
  model: Adoption
  context: DurableEvidence
  bindings: readonly Adoption[]
}>
export type ProducerDecisionView =
  | Readonly<{ kind: 'unresolved'; pending: PendingCall; source: DurableEvidence }>
  | Readonly<{
      kind: 'model-active'
      pending: Extract<PendingCall, { kind: 'model' }>
      source: DurableEvidence
    }>
  | Readonly<{
      kind: 'model-settled'
      pending: Extract<PendingCall, { kind: 'model' }>
      result: ProducedResult
      source: DurableEvidence
    }>
  | Readonly<{
      kind: 'tool-active'
      pending: Extract<PendingCall, { kind: 'tool'; association: 'associated' }>
      source: DurableEvidence
      waiting: 'none' | 'external' | 'human'
      supportedControls: readonly ('interrupt' | 'background')[]
    }>
  | Readonly<{
      kind: 'tool-result'
      pending: Extract<PendingCall, { kind: 'tool'; association: 'associated' }>
      result: ProducedResult
      source: DurableEvidence
    }>
  | Readonly<{
      kind: 'tool-background'
      pending: Extract<PendingCall, { kind: 'tool'; association: 'associated' }>
      placeholder: ProducedResult
      confirmation: DurableEvidence
      source: DurableEvidence
    }>
export type AdvancementFact = Readonly<{
  kind: 'current' | 'stopping' | 'ended' | 'superseded'
  source: DurableEvidence
}>
export type LoopFacts = Readonly<{
  advancement: AdvancementFact
  checkpoint: AgentCheckpoint
  conditions: RuntimeConditions
  batch: InputBatch
  inputs: readonly Message[]
  producers: readonly ProducerDecisionView[]
  consumption: readonly ResultResponsibility[]
  replyAdmissions: ReplyAdmissionProjection
  controls: readonly ControlRecord[]
}>
export type Next =
  | Readonly<{ kind: 'reconcile'; calls: readonly PendingCall[] }>
  | Readonly<{ kind: 'take-inputs'; position: string }>
  | Readonly<{ kind: 'prepare-request'; step: StepId; previous: Preparation | null }>
  | Readonly<{
      kind: 'compact-derive'
      original: Extract<Preparation, { kind: 'needs-compaction' }>
      progress: CompactionProgress
      result: Readonly<{ produced: ProducedResult; consumed: DurableEvidence }> | null
    }>
  | Readonly<{ kind: 'commit-transition'; value: PreparedContextTransition }>
  | Readonly<{
      kind: 'resume-request'
      original: Extract<Preparation, { kind: 'needs-compaction' }>
      transition: DurableEvidence
    }>
  | Readonly<{ kind: 'extension'; passage: PassageId }>
  | Readonly<{ kind: 'admit-model'; preparation: Extract<Preparation, { kind: 'ready' }> }>
  | Readonly<{ kind: 'admit-message'; source: MessageSource; candidate: Message }>
  | Readonly<{ kind: 'admit-tools'; batch: ActionBatch }>
  | Readonly<{ kind: 'consume'; consumption: ConsumptionId; result: ProducedResult }>
  | Readonly<{ kind: 'wait'; waiting: readonly Waiting[] }>
  | Readonly<{ kind: 'try-finish'; conclusion: AgentConclusion; failure: FailureCandidate | null }>
  | Readonly<{ kind: 'stop'; reason: 'cancelled' | 'terminal' | 'superseded' | 'suspended' }>
/** The pure evaluator of the loop: it reads `LoopFacts` and returns the `Next` step. It performs no effect; see SPEC "身份、原位置与纯求值". */
export interface AgentEvaluator {
  initial(
    input: Readonly<{ definition: Adoption; step: StepId }>,
  ): Outcome<AgentCheckpoint, Failure>
  next(input: LoopFacts): Outcome<Next, Failure>
  encode(value: AgentCheckpoint): Continuation
  decode(value: Continuation): Outcome<AgentCheckpoint, Failure>
}
