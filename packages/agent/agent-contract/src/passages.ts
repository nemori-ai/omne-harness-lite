import type { Message } from '@omne-harness/message'
import type { ContentBlock } from '@omne-harness/content-block'
import type { JsonValue } from '@omne-harness/json-text'
import type { CallAccount } from '@omne-harness/call-account'
import type * as M from '@omne-harness/model-contract'
import type * as T from '@omne-harness/tool-contract'
import type {
  ActionToolCall,
  AgentConclusion,
  GuardFact,
  PendingCall,
  ProducedResult,
  Reply,
  PreparedContextTransition,
} from './evaluation.ts'
import type { AcceptedInput } from './execution.ts'
import type {
  Conclusion,
  DecisionCardDraft,
  Dimension,
  ExtensionInvocationMode,
  ExtensionOutput,
  LoopExtensionDeclaration,
  LoopExtensionImplementation,
  Position,
} from './extensions.ts'
import type {
  Access,
  Adoption,
  ActionBatchId,
  ActionId,
  AgentExecutionId,
  AgentInstanceId,
  AgentOperationId,
  Authority,
  CardRoundId,
  ConsumerRef,
  DurableEvidence,
  ExecutionRevision,
  InputId,
  PassageId,
  StepId,
} from './identity.ts'
import type { CompactionProgress, Preparation } from './request.ts'

export type CapturedRead = Readonly<{ schema: Adoption; value: JsonValue; source: DurableEvidence }>
export type NamedCapturedRead = CapturedRead & Readonly<{ need: string }>
export type CardRequest = Readonly<{ identity: string; schema: Adoption; value: JsonValue }>
export type CardAnswer =
  | Readonly<{ kind: 'chosen'; option: string; value: JsonValue | null; evidence: DurableEvidence }>
  | Readonly<{ kind: 'declined'; evidence: DurableEvidence }>
export type CardRemark = Readonly<{ kind: 'remark'; text: string; evidence: DurableEvidence }>
export type CardReply =
  | CardAnswer
  | CardRemark
  | Readonly<{ kind: 'pending' }>
  | Readonly<{ kind: 'invalidated'; evidence: DurableEvidence }>
export type PassageCard = Readonly<{
  identity: string
  card: DurableEvidence
  response: Exclude<CardReply, { kind: 'pending' }> | null
  processed: DurableEvidence | null
}>
export type PassageOperationProgress<R> =
  | Readonly<{ kind: 'requested' }>
  | Readonly<{ kind: 'resolved'; result: R }>
  | Readonly<{ kind: 'applied'; result: R; transition: DurableEvidence }>
export type CardRoundProgress =
  | Readonly<{ kind: 'requested' }>
  | Readonly<{ kind: 'presented'; cards: readonly PassageCard[] }>
  | Readonly<{ kind: 'answered'; cards: readonly PassageCard[] }>
  | Readonly<{ kind: 'processed'; cards: readonly PassageCard[]; conclusion: DurableEvidence }>
  | Readonly<{ kind: 'present-failed'; failure: DurableEvidence }>
export type CardRound = Readonly<{
  round: CardRoundId
  ask: Conclusion & Readonly<{ output: Extract<ExtensionOutput, { kind: 'ask' }> }>
  requests: readonly CardRequest[]
  progress: CardRoundProgress
}>
export type PassageOperation = Readonly<{
  action: ActionId
  ordinal: number
  input: DurableEvidence
}> &
  (
    | Readonly<{
        kind: 'producer'
        pending: Extract<PendingCall, { kind: 'model' }>
        progress: PassageOperationProgress<
          Readonly<{ result: ProducedResult; consumed: DurableEvidence }>
        >
      }>
    | Readonly<{
        kind: 'read'
        owner: string
        protocol: Adoption
        query: JsonValue
        progress: PassageOperationProgress<CapturedRead>
      }>
    | Readonly<{ kind: 'guard'; progress: PassageOperationProgress<GuardFact> }>
  )
export type PassageProgress =
  | Readonly<{ kind: 'requested'; mode: ExtensionInvocationMode }>
  | Readonly<{ kind: 'asked'; rounds: readonly [CardRound, ...CardRound[]] }>
  | Readonly<{ kind: 'resolved'; rounds: readonly CardRound[]; conclusion: Conclusion }>
  | Readonly<{
      kind: 'applied'
      rounds: readonly CardRound[]
      conclusion: Conclusion
      transition: DurableEvidence
    }>
export type Passage = Readonly<{
  id: PassageId
  position: Position
  dimension: Dimension | null
  purpose: 'main' | 'compaction' | null
  action: ActionId | null
  ordinal: number
  declaration: LoopExtensionDeclaration
  implementation: Adoption
  input: DurableEvidence
  effective: DurableEvidence
  operations: readonly PassageOperation[]
  progress: PassageProgress
}>
export type Subject =
  | Readonly<{ execution: AgentExecutionId; conditions: DurableEvidence }>
  | Readonly<{ preparation: Extract<Preparation, { kind: 'needs-compaction' }> }>
  | Readonly<{ transition: PreparedContextTransition }>
  | Readonly<{ purpose: 'main'; preparation: Extract<Preparation, { kind: 'assembled' }> }>
  | Readonly<{
      purpose: 'compaction'
      step: Extract<Preparation, { kind: 'ready' }>
      progress: CompactionProgress
    }>
  | Readonly<{
      purpose: 'main' | 'compaction'
      call: M.ModelCallId
      result: ProducedResult
      reply: Message
      termination: M.Termination
      account: CallAccount | null
    }>
  | Readonly<{
      purpose: 'main' | 'compaction'
      call: M.ModelCallId
      request: M.FixedModelRequest
      fault: M.ModelFault
      dispatches: readonly M.DispatchRecord[]
      retry: M.RetryResolution | null
    }>
  | Readonly<{
      action: ActionId
      original: ActionToolCall
      effectiveArguments: string
      definition: T.ToolDefinition
      batch: readonly ActionId[]
    }>
  | Readonly<{
      action: ActionId
      candidate: Message
      outcome:
        | Readonly<{ kind: 'denied'; evidence: DurableEvidence }>
        | Readonly<{ kind: 'executed'; result: ProducedResult; terminal: T.ToolTerminal }>
    }>
  | Readonly<{
      batch: ActionBatchId
      outcomes: readonly Readonly<{
        action: ActionId
        outcome: 'denied' | 'executed'
        terminal: T.ToolTerminal | null
      }>[]
    }>
  | Readonly<{ proposed: AgentConclusion; basis: DurableEvidence }>
  | Readonly<{ terminal: AgentConclusion; disposition: DurableEvidence }>
export interface ExtensionImplementations<P> {
  resolve(input: Access<P> & Readonly<{ passage: Passage }>): Reply<LoopExtensionImplementation>
}
export interface DecisionCards<P> {
  present(
    input: Access<P> &
      Readonly<{
        advance: Authority
        passage: PassageId
        round: CardRoundId
        original: DurableEvidence
        requests: readonly CardRequest[]
      }>,
  ): Reply<readonly DurableEvidence[]>
  lookup(
    input: Access<P> &
      Readonly<{
        execution: AgentExecutionId
        passage: PassageId
        round: CardRoundId
        original: DurableEvidence
        requests: readonly CardRequest[]
      }>,
  ): Reply<
    | Readonly<{ kind: 'presented'; cards: readonly DurableEvidence[] }>
    | Readonly<{ kind: 'not-presented'; exclusion: DurableEvidence }>
    | Readonly<{ kind: 'unknown' }>
  >
  read(input: Access<P> & Readonly<{ card: DurableEvidence }>): Reply<CardReply>
  invalidate(
    input: Access<P> &
      Readonly<{
        operation: AgentOperationId
        passage: PassageId
        round: CardRoundId
        cards: readonly DurableEvidence[]
        reason: DurableEvidence
      }>,
  ): Reply<
    readonly Readonly<{ card: DurableEvidence; reply: Exclude<CardReply, { kind: 'pending' }> }>[]
  >
}
export type AdmissionDecision =
  | Readonly<{ kind: 'allow'; evidence: DurableEvidence }>
  | Readonly<{ kind: 'deny'; reason: string; evidence: DurableEvidence }>
  | Readonly<{ kind: 'need-decision'; card: DecisionCardDraft; evidence: DurableEvidence }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>
export interface ActionAdmission<P> {
  admit(
    input: Access<P> &
      Readonly<{
        advance: Authority
        execution: AgentExecutionId
        passage: PassageId
        action: ActionId
        original: ActionToolCall
        effectiveArguments: string
        definition: Adoption
        permissions: readonly NamedCapturedRead[]
        decision: Readonly<{ card: DurableEvidence; answer: CardAnswer | CardRemark }> | null
      }>,
  ): Reply<AdmissionDecision>
}
export type MessageSource =
  | Readonly<{ kind: 'external-input'; input: InputId }>
  | Readonly<{
      kind: 'model-reply'
      step: StepId
      action: ActionId
      call: M.ModelCallId
      result: ProducedResult
    }>
  | Readonly<{ kind: 'tool-result'; action: ActionId; call: T.ToolCallId; result: ProducedResult }>
  | Readonly<{ kind: 'action-denied'; action: ActionId; evidence: DurableEvidence }>
  | Readonly<{ kind: 'reminder'; passage: PassageId }>
  | Readonly<{ kind: 'context-transition'; transition: PreparedContextTransition }>
export type InputEntry =
  | Readonly<{
      kind: 'invoke'
      operation: AgentOperationId
      execution: AgentExecutionId
      initial: AcceptedInput
    }>
  | Readonly<{
      kind: 'submit'
      operation: AgentOperationId
      execution: AgentExecutionId
      value: AcceptedInput
    }>
export type InvokeRuntimeContext = Readonly<{
  instance: AgentInstanceId
  scope: DurableEvidence
  definition: Adoption
  grant: DurableEvidence | null
}>
export type SubmitDelivery =
  | Readonly<{ kind: 'runtime-view'; instance: AgentInstanceId }>
  | Readonly<{ kind: 'durable-view' }>
export type InputOrigin =
  | Readonly<{
      kind: 'invoke'
      instance: AgentInstanceId
      scope: DurableEvidence
      definition: Adoption
      grant: DurableEvidence | null
    }>
  | Readonly<{ kind: 'submit'; executionBinding: DurableEvidence; delivery: SubmitDelivery }>
export type HandoffPosition = Readonly<{
  step: StepId
  node: string
  slot: string | null
}>
export type HandoffReference =
  | Readonly<{ kind: 'execution'; execution: AgentExecutionId; operation: AgentOperationId }>
  | Readonly<{
      kind: 'input'
      execution: AgentExecutionId
      entry: AgentOperationId
      input: InputId
    }>
export type PendingHandoff = Readonly<{
  kind: 'execution'
  reference: Extract<HandoffReference, { kind: 'execution' }>
  predecessor: ExecutionRevision
  position: HandoffPosition
  source: Exclude<MessageSource, { kind: 'external-input' }>
  candidate: Message
  originalAdvance: Authority
  predecessorHandoff: Extract<HandoffReference, { kind: 'execution' }> | null
}>
export type InputHandoff = Readonly<{
  kind: 'input'
  reference: Extract<HandoffReference, { kind: 'input' }>
  entry: InputEntry
  source: Extract<MessageSource, { kind: 'external-input' }>
}>
export type HandoffRequest = PendingHandoff | InputHandoff
export type HandoffPrepare =
  | Readonly<{ kind: 'execution'; request: PendingHandoff; advance: Authority }>
  | Readonly<{ kind: 'invoke'; request: InputHandoff; runtime: InvokeRuntimeContext }>
  | Readonly<{ kind: 'submit'; request: InputHandoff }>
export type HandoffDecision =
  | Readonly<{ kind: 'prepared'; message: Message; admission: DurableEvidence }>
  | Readonly<{ kind: 'rejected'; reason: string; evidence: DurableEvidence }>
export type HandoffOutcome = Readonly<{
  request: HandoffRequest
  origin: InputOrigin | null
  provider: Adoption
  qualification: DurableEvidence
  record: DurableEvidence
  decision: HandoffDecision
}>
export type HandoffResolution =
  | Readonly<{ kind: 'recorded'; outcome: HandoffOutcome }>
  | Readonly<{
      kind: 'excluded'
      request: HandoffRequest
      origin: InputOrigin | null
      exclusion: DurableEvidence
    }>
  | Readonly<{
      kind: 'unknown'
      original: Readonly<{
        request: HandoffRequest
        origin: InputOrigin | null
        record: DurableEvidence
      }> | null
    }>
export type HandoffLookup =
  | Readonly<{
      kind: 'execution'
      execution: AgentExecutionId
      handoff: Extract<HandoffReference, { kind: 'execution' }>
    }>
  | Readonly<{ kind: 'input-entry'; execution: AgentExecutionId; operation: AgentOperationId }>
export interface MessageHandoff<P> {
  prepare(input: Access<P> & HandoffPrepare): Reply<HandoffOutcome>
  lookup(input: Access<P> & HandoffLookup): Reply<HandoffResolution>
  exclude(
    input: Access<P> & Readonly<{ request: PendingHandoff; control: AgentOperationId }>,
  ): Reply<HandoffResolution>
}
export type Material<B extends ContentBlock> =
  | Readonly<{ kind: 'model'; result: ProducedResult; pages: readonly M.ResultPage[] }>
  | Readonly<{ kind: 'tool'; result: ProducedResult; pages: readonly T.ResultPage<B>[] }>
  | Readonly<{ kind: 'facts'; schema: Adoption; value: JsonValue }>
export type MaterialDescription = Readonly<{
  digest: string
  size: number
  kind: Material<ContentBlock>['kind']
}>
export interface AgentMaterials<P, B extends ContentBlock> {
  preserve(
    input: Access<P> &
      Readonly<{
        execution: AgentExecutionId
        identity: string
        consumer: ConsumerRef
        value: Material<B>
      }>,
  ): Reply<DurableEvidence>
  read(input: Access<P> & Readonly<{ source: DurableEvidence }>): Reply<Material<B>>
  describe(input: Access<P> & Readonly<{ source: DurableEvidence }>): Reply<MaterialDescription>
}
export interface RegisteredReads<P> {
  read(
    input: Access<P> &
      Readonly<{
        action: ActionId
        passage: PassageId
        original: DurableEvidence
        owner: string
        protocol: Adoption
        query: JsonValue
      }>,
  ): Reply<Readonly<{ kind: 'captured'; value: CapturedRead }> | Readonly<{ kind: 'unknown' }>>
  lookup(
    input: Access<P> &
      Readonly<{
        action: ActionId
        passage: PassageId
        original: DurableEvidence
      }>,
  ): Reply<
    | Readonly<{ kind: 'captured'; value: CapturedRead }>
    | Readonly<{ kind: 'excluded'; evidence: DurableEvidence }>
    | Readonly<{ kind: 'unknown' }>
  >
}
