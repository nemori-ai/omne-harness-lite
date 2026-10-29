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
  AgentConclusion,
  GuardFact,
  PendingCall,
  ProducedResult,
  Reply,
  PreparedContextTransition,
} from './evaluation.ts'
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
  AgentOperationId,
  Authority,
  CardRoundId,
  ConsumerRef,
  DurableEvidence,
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
        decision: Readonly<{ card: DurableEvidence; answer: CardAnswer }> | null
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
export type HandoffResult =
  | Readonly<{ kind: 'accepted'; admission: DurableEvidence }>
  | Readonly<{ kind: 'rejected'; reason: string; evidence: DurableEvidence }>
/** The port that admits a candidate message from one of six sources; see SPEC "消息准入". */
export interface MessageHandoff<P> {
  accept(
    input: Access<P> &
      Readonly<{
        execution: AgentExecutionId
        operation: AgentOperationId
        advance: Authority | null
        source: MessageSource
        candidate: Message
      }>,
  ): Reply<HandoffResult>
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
