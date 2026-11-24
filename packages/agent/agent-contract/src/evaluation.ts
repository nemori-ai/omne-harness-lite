import type { CompactionTaskIdentity, PreparedCompactionCommit } from './compaction.ts'
import type { Outcome } from '@omne-harness/operation-result'
import type { Message, ToolCallPart } from '@omne-harness/message'
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
  ReplyAdmissionPageCursor,
  ReplyAdmissionSequence,
  StepId,
} from './identity.ts'
import type { JsonValue } from '@omne-harness/json-text'
import type { HandoffReference, MessageSource, Passage } from './passages.ts'
import type { CompactionState, Preparation, SavedPreparation } from './request.ts'

export type ProducedResult = Readonly<{
  producer:
    | Readonly<{ kind: 'model'; call: M.ModelCallId }>
    | Readonly<{ kind: 'tool'; call: T.ToolCallId }>
    | Readonly<{ kind: 'compaction'; task: CompactionTaskIdentity }>
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
        kind: 'node-failed'
        node: string
        category: 'exception' | 'invariant' | 'unsupported-path' | 'rejected'
        failureKind: Failure['kind']
      }>
    | Readonly<{
        kind: 'cannot-fit'
        reason: 'fixed' | 'protected-floor' | 'after-compaction'
        context: DurableEvidence
        veto?: DurableEvidence
        rejection?: DurableEvidence
        task?: CompactionTaskIdentity
      }>
    | Readonly<{
        kind: 'compaction-invalid'
        task: CompactionTaskIdentity
        transition?: DurableEvidence
      }>
    | Readonly<{
        kind: 'compaction-failed'
        task: CompactionTaskIdentity
        reason: string
        diagnostic: string
      }>
    | Readonly<{
        kind: 'request-rejected'
        failure: Extract<Failure, { kind: 'invalid' }>
        model: DurableEvidence
        selection: DurableEvidence
      }>
    | Readonly<{
        kind: 'no-reply'
        call: M.ModelCallId
        result: ProducedResult
        fault?: M.ModelFault
      }>
    | Readonly<{
        kind: 'model-refused'
        call: M.ModelCallId
        failure: Extract<
          M.ModelFailure,
          { kind: 'denied' | 'invalid' | 'unsupported' | 'capacity' }
        >
      }>
    | Readonly<{ kind: 'message-rejected'; from: MessageSource; evidence: DurableEvidence }>
    | Readonly<{ kind: 'extension-stop'; passage: PassageId; reason: string }>
    | Readonly<{ kind: 'guard'; level: 3; basis: DurableEvidence }>
  )
export type Failure =
  | Readonly<{ kind: 'denied'; action: string }>
  | Readonly<{ kind: 'invalid'; field: string; reason: string }>
  | Readonly<{ kind: 'unavailable'; owner: string; diagnostic: string }>
  | Readonly<{
      kind:
        | 'stale-advance'
        | 'not-ready'
        | 'terminal'
        | 'busy'
        | 'changed'
        | 'unsupported'
        | 'reclaimed'
    }>
  | Readonly<{ kind: 'commit-unknown'; operation: AgentOperationId }>
  | Readonly<{ kind: 'conflict'; operation: AgentOperationId }>
export type Reply<A> = Promise<Outcome<A, Failure>>
export type ModelPurpose = 'main' | 'extension'
export type ToolAcceptance = 'accepted' | 'unknown'
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
          | Readonly<{ association: 'intent'; reference?: never; acceptance?: never }>
          | Readonly<{
              association: 'associated'
              reference: T.ToolInvocationRef
              acceptance: ToolAcceptance
            }>
        ))
  )
export type ActionJudgment =
  | Readonly<{ kind: 'pending'; passage: PassageId }>
  | Readonly<{ kind: 'waiting'; passage: PassageId; cards: readonly DurableEvidence[] }>
  | Readonly<{
      kind: 'denied'
      evidence: DurableEvidence
      answer?: DurableEvidence
      notice?: string
    }>
  | Readonly<{
      kind: 'allowed'
      evidence: DurableEvidence
      request: DurableEvidence
      notice?: string
    }>
export type ActionToolCall = ToolCallPart
export type Action = Readonly<{
  id: ActionId
  original: Readonly<{ callId: string }>
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
  candidateDigest: string | null
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
        completion: DurableEvidence | null
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
export type ReplyAdmissionPrefix = Readonly<{
  sequence: ReplyAdmissionSequence
  basis: DurableEvidence
}>
export type ReplyAdmissionProjection = Readonly<{
  through: DurableEvidence
  rule: Adoption
  lastAdmission: DurableEvidence | null
  consecutiveDenials: string
  totalDenials: string
  prefix: ReplyAdmissionPrefix
}>
export type ReplyAdmissionFrom =
  | Readonly<{ kind: 'origin' }>
  | Readonly<{ kind: 'prefix'; prefix: ReplyAdmissionPrefix }>
export type ReplyAdmissionItem = Readonly<{
  sequence: ReplyAdmissionSequence
  fact: ModelReplyAdmission
  publication: DurableEvidence
}>
export type ReplyAdmissionPageTail =
  | Readonly<{ kind: 'more'; next: ReplyAdmissionPageCursor }>
  | Readonly<{ kind: 'complete' }>
export type ReplyAdmissionGapReason =
  | 'retention'
  | 'missing-fact'
  | 'missing-basis'
  | 'range-unavailable'
export type ReplyAdmissionPage =
  | Readonly<{
      kind: 'page'
      through: DurableEvidence
      start: ReplyAdmissionPrefix
      end: ReplyAdmissionPrefix
      items: readonly ReplyAdmissionItem[]
      tail: ReplyAdmissionPageTail
    }>
  | Readonly<{ kind: 'gap'; reason: ReplyAdmissionGapReason; recovery: DurableEvidence }>
export type ReplyAdmissionRead =
  | Readonly<{ kind: 'unverified' }>
  | Readonly<{ kind: 'verified'; prefix: ReplyAdmissionPrefix }>
export type GuardLevel = 0 | 1 | 2 | 3
export type GuardFact = Readonly<{
  level: GuardLevel
  policy: Adoption
  through: DurableEvidence
  basis: DurableEvidence
  passage: PassageId
  at: AgentInstant
}>
export type AdoptedRequest = Readonly<{
  reference: M.ModelInvocationRef
  fixed: DurableEvidence
  schema: Adoption
  record: JsonValue
}>
export type VoidedIntent =
  | Readonly<{
      kind: 'model'
      step: StepId
      action: ActionId
      reference: M.ModelInvocationRef
      cause: 'not-accepted' | 'lost'
      basis: DurableEvidence
    }>
  | Readonly<{
      kind: 'tool'
      step: StepId
      action: ActionId
      reference?: never
      cause: 'not-accepted'
      basis: DurableEvidence
    }>
export type AgentCheckpoint = Readonly<{
  schema: Adoption
  definition: Adoption
  step: StepId
  position: string
  calls: readonly PendingCall[]
  passages: readonly Passage[]
  batch: ActionBatch | null
  inputBatch: InputBatch | null
  requestPreparation: SavedPreparation | null
  compaction: CompactionState | null
  adoptedContext: DurableEvidence | null
  adoptedRequest?: AdoptedRequest | null
  guard: GuardFact | null
  completedPassages: readonly PassageId[]
  priorConditions: DurableEvidence | null
  /** The H of the current source position; set by P, cleared or moved only by a Ja, never by Rh. */
  currentHandoff: HandoffReference | null
  replyAdmissionRead: ReplyAdmissionRead
  voided: readonly VoidedIntent[]
}>
export type RuntimeConditions = Readonly<{
  source: DurableEvidence
  configuration: Adoption
  progression: ProgressionDirective
  model: Adoption
  context: DurableEvidence
  bindings: readonly Adoption[]
  /** The resident segments of the system prompt; absent when the session keeps none. */
  segments?: readonly ResidentSegmentText[]
}>
/** A segment of the system prompt the session keeps: placed as written after the sections of the definition. */
export type ResidentSegmentText = Readonly<{ key: string; text: string }>
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
      kind: 'compact'
      original: Extract<Preparation, { kind: 'needs-compaction' }>
    }>
  | Readonly<{ kind: 'commit-transition'; value: PreparedCompactionCommit }>
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
export interface AgentEvaluator {
  initial(
    input: Readonly<{ definition: Adoption; step: StepId }>,
  ): Outcome<AgentCheckpoint, Failure>
  next(input: LoopFacts): Outcome<Next, Failure>
  encode(value: AgentCheckpoint): Continuation
  decode(value: Continuation): Outcome<AgentCheckpoint, Failure>
}
