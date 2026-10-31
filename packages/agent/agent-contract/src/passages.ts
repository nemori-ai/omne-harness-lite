// Passage ledger, card, subject, material and admission types of the Agent contract (README,
// "扩展、人工卡片与材料"). The author protocol types they refer to live in extensions.ts.
import type { Message } from '@omne-harness/message'
import type { ContentBlock } from '@omne-harness/content-block'
import type { JsonValue } from '@omne-harness/json-text'
import type { CallAccount } from '@omne-harness/call-account'
import type * as M from '@omne-harness/model-contract'
import type * as T from '@omne-harness/tool-contract'
import type {
  Action,
  AgentCheckpoint,
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
/** One read handed to action admission under the need name the official admission declared. */
export type NamedCapturedRead = CapturedRead & Readonly<{ need: string }>
export type CardRequest = Readonly<{ identity: string; schema: Adoption; value: JsonValue }>
export type CardAnswer =
  | Readonly<{ kind: 'chosen'; option: string; value: JsonValue | null; evidence: DurableEvidence }>
  | Readonly<{ kind: 'declined'; evidence: DurableEvidence }>
/** The person spoke without granting or refusing; `text` is the non-empty verbatim remark. */
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
/**
 * What an extension author sees at a position, one shape per position and dimension. The union is
 * discriminated by the members each shape owns, not by one literal; `purpose` splits the model
 * positions. See extensions.md, "输入".
 */
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
      original: Action['original']
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
/** The port that resolves the implementation of an extension by its exact adoption; see SPEC "扩展、卡片与材料". */
export interface ExtensionImplementations<P> {
  resolve(input: Access<P> & Readonly<{ passage: Passage }>): Reply<LoopExtensionImplementation>
}
/** The port that presents, finds, reads and invalidates decision cards; see SPEC "卡片与准入端口的逐操作要素". */
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
        passage: PassageId
        round: CardRoundId
        original: DurableEvidence
        requests: readonly string[]
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
/** The port of the authorization domain that admits one action; see SPEC "整批判断屏障与动作准入". */
export interface ActionAdmission<P> {
  admit(
    input: Access<P> &
      Readonly<{
        advance: Authority
        execution: AgentExecutionId
        passage: PassageId
        action: ActionId
        original: Action['original']
        effectiveArguments: string
        definition: Adoption
        /** Reads by need name in declaration order; an empty list is "no read", not a grant. */
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
/**
 * The complete content of one external command, as the admission provider and the Journal keep
 * it (SPEC "输入内容与水位线"): the original entry operation O, the execution and the accepted
 * input, without instance or grant. An invoke entry also keeps the complete initial checkpoint
 * that the first prepare was given; a submit entry has none.
 */
export type InputEntry =
  | Readonly<{
      kind: 'invoke'
      operation: AgentOperationId
      execution: AgentExecutionId
      initial: AcceptedInput
      checkpoint: AgentCheckpoint
    }>
  | Readonly<{
      kind: 'submit'
      operation: AgentOperationId
      execution: AgentExecutionId
      value: AcceptedInput
    }>
/** The real runtime binding of one invoke: the instance, its scope, definition and grant. */
export type InvokeRuntimeContext = Readonly<{
  instance: AgentInstanceId
  scope: DurableEvidence
  definition: Adoption
  grant: DurableEvidence | null
}>
/**
 * How a submit was actually delivered: through the runtime view of an instance, which does not
 * claim that the instance is still alive, or through the durable view alone.
 */
export type SubmitDelivery =
  | Readonly<{ kind: 'runtime-view'; instance: AgentInstanceId }>
  | Readonly<{ kind: 'durable-view' }>
/**
 * The immutable provenance of a first admission (SPEC "输入内容与水位线"), written once by the
 * provider and returned unchanged afterwards. An invoke origin keeps the runtime binding of that
 * time; a submit origin keeps the reference to the original execution binding record and the
 * delivery route. Internal sources have no origin.
 */
export type InputOrigin =
  | Readonly<{
      kind: 'invoke'
      instance: AgentInstanceId
      scope: DurableEvidence
      definition: Adoption
      grant: DurableEvidence | null
    }>
  | Readonly<{ kind: 'submit'; executionBinding: DurableEvidence; delivery: SubmitDelivery }>
/** The stable source position of an internal candidate: the step, the node and the slot it fills. */
export type HandoffPosition = Readonly<{
  step: StepId
  node: string
  slot: string | null
}>
/**
 * The identity of one admission (H). An internal H is the operation that P fixed; an external H is
 * the entry index Ki (execution and original entry operation O) with the input identity, which the
 * provider maps to its own record.
 */
export type HandoffReference =
  | Readonly<{ kind: 'execution'; execution: AgentExecutionId; operation: AgentOperationId }>
  | Readonly<{
      kind: 'input'
      execution: AgentExecutionId
      entry: AgentOperationId
      input: InputId
    }>
/** The complete internal request that P saves before any prepare, conversion or external effect. */
export type PendingHandoff = Readonly<{
  kind: 'execution'
  reference: Extract<HandoffReference, { kind: 'execution' }>
  /** The expected revision of the P commit, which the derivation of H uses. */
  predecessor: ExecutionRevision
  position: HandoffPosition
  source: Exclude<MessageSource, { kind: 'external-input' }>
  candidate: Message
  /** Audit only: the advance that prepared the request, never a recovery qualification. */
  originalAdvance: Authority
  predecessorHandoff: Extract<HandoffReference, { kind: 'execution' }> | null
}>
/** The external request of one invoke or submit entry; the runtime cross-checks its three parts. */
export type InputHandoff = Readonly<{
  kind: 'input'
  reference: Extract<HandoffReference, { kind: 'input' }>
  entry: InputEntry
  source: Extract<MessageSource, { kind: 'external-input' }>
}>
export type HandoffRequest = PendingHandoff | InputHandoff
/**
 * The three branches of `MessageHandoff.prepare`, each a complete shape: an execution branch with
 * the current advance, an invoke branch with the real runtime context, a submit branch with the
 * input request alone (SPEC "消息准入").
 */
export type HandoffPrepare =
  | Readonly<{ kind: 'execution'; request: PendingHandoff; advance: Authority }>
  | Readonly<{ kind: 'invoke'; request: InputHandoff; runtime: InvokeRuntimeContext }>
  | Readonly<{ kind: 'submit'; request: InputHandoff }>
/** The fixed admission decision: the exact committable message with its basis, or the rejection. */
export type HandoffDecision =
  | Readonly<{ kind: 'prepared'; message: Message; admission: DurableEvidence }>
  | Readonly<{ kind: 'rejected'; reason: string; evidence: DurableEvidence }>
/** What `prepare` fixed for one H, bound to the complete original request and origin. */
export type HandoffOutcome = Readonly<{
  request: HandoffRequest
  origin: InputOrigin | null
  provider: Adoption
  /** The original admission basis, not a current permission for a retry. */
  qualification: DurableEvidence
  record: DurableEvidence
  decision: HandoffDecision
}>
/**
 * What `lookup` and `exclude` answer: the recorded outcome, the permanent exclusion of a request
 * whose outcome and effects can never happen, or unknown with the original material when it was
 * durably saved. `null` material means none was obtained, not that nothing was called.
 */
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
/** Which original admission `lookup` reads: an internal H, or the external entry index. */
export type HandoffLookup =
  | Readonly<{
      kind: 'execution'
      execution: AgentExecutionId
      handoff: Extract<HandoffReference, { kind: 'execution' }>
    }>
  | Readonly<{ kind: 'input-entry'; execution: AgentExecutionId; operation: AgentOperationId }>
/**
 * The port that fixes, reads and fences the admission of a candidate message from one of six
 * sources; see SPEC "消息准入" and "卡片与准入端口的逐操作要素".
 */
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
/** The port that preserves and reads the materials a consumer keeps; see SPEC "扩展、卡片与材料". */
export interface AgentMaterials<P, B extends ContentBlock> {
  preserve(
    input: Access<P> &
      Readonly<{
        identity: string
        consumer: ConsumerRef
        value: Material<B>
      }>,
  ): Reply<DurableEvidence>
  read(input: Access<P> & Readonly<{ source: DurableEvidence }>): Reply<Material<B>>
}
/** The port that captures a registered read-only protocol; see SPEC "扩展、卡片与材料". */
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
