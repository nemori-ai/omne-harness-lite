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
  Evidence,
  InputBatchId,
  InputId,
  PassageId,
  StepId,
} from './identity.ts'
import type { MessageSource, Passage } from './passages.ts'
import type { CompactionProgress, CompactionState, Preparation } from './request.ts'

export type ProducedResult = Readonly<{
  producer:
    | Readonly<{ kind: 'model'; call: M.ModelCallId }>
    | Readonly<{ kind: 'tool'; call: T.ToolCallId }>
  version: string
  delivery: string | null
  source: Evidence
}>
export type InputBatch = Readonly<{
  id: InputBatchId
  watermark: Evidence
  ordered: readonly InputId[]
}>
export type ProgressionDirective =
  | Readonly<{ kind: 'evaluate-completion'; basis: Evidence }>
  | Readonly<{ kind: 'continue'; basis: Evidence }>
export type Waiting =
  | Readonly<{ kind: 'producer'; pending: PendingCall }>
  | Readonly<{ kind: 'human'; passage: PassageId; cards: readonly Evidence[] }>
  | Readonly<{ kind: 'dependency'; owner: string; position: string }>
export type AgentConclusion =
  | Readonly<{ kind: 'complete' }>
  | Readonly<{ kind: 'fail' | 'cancelled'; cause: Evidence }>
export type FailureCandidate = Readonly<{
  step: StepId | null
  at: AgentInstant
  source: Evidence
}> &
  (
    | Readonly<{
        kind: 'cannot-fit'
        reason: 'fixed' | 'after-compaction'
        context: Evidence
        veto?: Evidence
        rejection?: Evidence
        plan?: CompactionProgress
      }>
    | Readonly<{
        kind: 'compaction-invalid'
        plan: Evidence
        progress?: Readonly<{ expected: CompactionProgress; returned: CompactionProgress }>
        transition?: Evidence
      }>
    | Readonly<{
        kind: 'request-rejected'
        failure: Extract<Failure, { kind: 'invalid' }>
        model: Evidence
        selection: Evidence
      }>
    | Readonly<{ kind: 'no-reply'; call: M.ModelCallId; result: ProducedResult }>
    | Readonly<{ kind: 'message-rejected'; from: MessageSource; evidence: Evidence }>
    | Readonly<{ kind: 'extension-stop'; passage: PassageId; reason: string }>
    | Readonly<{ kind: 'guard'; level: 3; basis: Evidence }>
  )
export type PreparedContextTransition = Readonly<{
  preparation: ActionId
  message: Message
  source: Evidence
  derivation: Evidence
  commitment: Evidence
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
export type PendingCall = Readonly<{
  action: ActionId
  consumption: ConsumptionId
  position: ConsumerRef
  fixed: Evidence
}> &
  (
    | Readonly<{
        kind: 'model'
        reference: M.ModelInvocationRef
        purpose: ModelPurpose
      }>
    | Readonly<{
        kind: 'tool'
        call: T.ToolCallId
        admission: T.ToolOperationId
        purpose: 'action'
      }>
  )
export type ActionJudgment =
  | Readonly<{ kind: 'pending'; passage: PassageId }>
  | Readonly<{ kind: 'waiting'; passage: PassageId; cards: readonly Evidence[] }>
  | Readonly<{ kind: 'denied'; evidence: Evidence }>
  | Readonly<{ kind: 'allowed'; evidence: Evidence; request: T.FixedToolRequest }>
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
  | Readonly<{ kind: 'open'; evidence: Evidence; approved: readonly [ActionId, ...ActionId[]] }>
  | Readonly<{ kind: 'all-denied'; evidence: Evidence }>
export type ActionSlot = Readonly<{
  action: ActionId
  each: readonly PassageId[] | null
  candidate: Message | null
  handoff: Evidence | null
}> &
  (
    | Readonly<{ kind: 'denied'; evidence: Evidence }>
    | Readonly<{ kind: 'dispatched' }>
    | Readonly<{
        kind: 'result'
        result: ProducedResult
        terminal: T.ToolTerminal
        custody: Evidence
      }>
    | Readonly<{ kind: 'background'; placeholder: ProducedResult; confirmation: Evidence }>
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
  source: Evidence
}>
export type ReplyAdmissionProjection = Readonly<{
  through: Evidence
  rule: Adoption
  lastAdmission: Evidence | null
  consecutiveDenials: string
  totalDenials: string
}>
export type ReplyAdmissionPage =
  | Readonly<{
      kind: 'page'
      through: Evidence
      items: readonly Readonly<{ sequence: string; fact: ModelReplyAdmission }>[]
      next: string | null
      complete: boolean
    }>
  | Readonly<{ kind: 'gap'; recovery: Evidence }>
export type GuardLevel = 0 | 1 | 2 | 3
export type GuardFact = Readonly<{
  level: GuardLevel
  policy: Adoption
  through: Evidence
  basis: Evidence
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
  adoptedContext: Evidence | null
  guard: GuardFact | null
  completedPassages: readonly PassageId[]
  priorConditions: Evidence | null
}>
export type RuntimeConditions = Readonly<{
  source: Evidence
  configuration: Adoption
  progression: ProgressionDirective
  model: Adoption
  context: Evidence
  bindings: readonly Adoption[]
}>
export type ProducerDecisionView =
  | Readonly<{ kind: 'unresolved'; pending: PendingCall; source: Evidence }>
  | Readonly<{
      kind: 'model-active'
      pending: Extract<PendingCall, { kind: 'model' }>
      source: Evidence
    }>
  | Readonly<{
      kind: 'model-settled'
      pending: Extract<PendingCall, { kind: 'model' }>
      result: ProducedResult
      source: Evidence
    }>
  | Readonly<{
      kind: 'tool-active'
      pending: Extract<PendingCall, { kind: 'tool' }>
      source: Evidence
      waiting: 'none' | 'external' | 'human'
      supportedControls: readonly ('interrupt' | 'background')[]
    }>
  | Readonly<{
      kind: 'tool-result'
      pending: Extract<PendingCall, { kind: 'tool' }>
      result: ProducedResult
      source: Evidence
    }>
  | Readonly<{
      kind: 'tool-background'
      pending: Extract<PendingCall, { kind: 'tool' }>
      placeholder: ProducedResult
      confirmation: Evidence
      source: Evidence
    }>
export type AdvancementFact = Readonly<{
  kind: 'current' | 'stopping' | 'ended' | 'superseded'
  source: Evidence
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
      result: Readonly<{ produced: ProducedResult; consumed: Evidence }> | null
    }>
  | Readonly<{ kind: 'commit-transition'; value: PreparedContextTransition }>
  | Readonly<{
      kind: 'resume-request'
      original: Extract<Preparation, { kind: 'needs-compaction' }>
      transition: Evidence
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
