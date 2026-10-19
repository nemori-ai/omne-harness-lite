import { describe, expectTypeOf, it } from 'vitest'
import type { ContentBlock } from '@omne-harness/content-block'
import type { Message } from '@omne-harness/message'
import type { Outcome } from '@omne-harness/operation-result'
import type * as M from '@omne-harness/model-contract'
import type * as T from '@omne-harness/tool-contract'
import type {
  LoopExtensionImplementation,
  Access,
  Action,
  ActionAdmission,
  ActionBarrier,
  ActionBatch,
  ActionBatchId,
  ActionId,
  ActionJudgment,
  ActionSlot,
  AdmissionDecision,
  Adoption,
  AdvancementFact,
  AgentCheckpoint,
  AgentConclusion,
  AgentEvaluator,
  AgentExecutionId,
  AgentIdentity,
  AgentInstanceId,
  AgentInstant,
  AgentMaterials,
  AgentOperationId,
  AgentRegistrationId,
  Authority,
  CapturedRead,
  CardAnswer,
  CardReply,
  CardRequest,
  CardRound,
  CardRoundId,
  CardRoundProgress,
  CompactionAdvance,
  CompactionProgress,
  CompactionState,
  ConsumerRef,
  ConsumptionId,
  ContextContent,
  Continuation,
  CurrentConditions,
  DecisionCards,
  Evidence,
  ExecutionAttachmentId,
  ExecutionRevision,
  ExtensionImplementations,
  Failure,
  FailureCandidate,
  FinalRequest,
  GuardFact,
  GuardLevel,
  HandoffResult,
  IdentityFailure,
  InputBatch,
  InputBatchId,
  InputId,
  LoopFacts,
  Material,
  MessageHandoff,
  MessageSource,
  ModelContextRead,
  ModelContextReader,
  ModelPurpose,
  ModelRecipient,
  ModelReplyAdmission,
  ModelSelection,
  Next,
  Passage,
  PassageCard,
  PassageId,
  PassageOperation,
  PassageOperationProgress,
  PassageProgress,
  PendingCall,
  Preparation,
  PreparedContextTransition,
  ProducedResult,
  ProducerDecisionView,
  ProgressionDirective,
  RegisteredReads,
  Reply,
  ReplyAdmissionPage,
  ReplyAdmissionProjection,
  RequestPreparation,
  RuntimeConditions,
  SelectedModel,
  StepId,
  StructureFailure,
  Subject,
  Waiting,
} from '@omne-harness/agent-contract'

type Landed = {
  Access: Access<string>
  Action: Action
  ActionAdmission: ActionAdmission<string>
  ActionBarrier: ActionBarrier
  ActionBatch: ActionBatch
  ActionBatchId: ActionBatchId
  ActionId: ActionId
  ActionJudgment: ActionJudgment
  ActionSlot: ActionSlot
  AdmissionDecision: AdmissionDecision
  Adoption: Adoption
  AdvancementFact: AdvancementFact
  AgentCheckpoint: AgentCheckpoint
  AgentConclusion: AgentConclusion
  AgentEvaluator: AgentEvaluator
  AgentExecutionId: AgentExecutionId
  AgentIdentity: AgentIdentity<'k'>
  AgentInstanceId: AgentInstanceId
  AgentInstant: AgentInstant
  AgentMaterials: AgentMaterials<string, ContentBlock>
  AgentOperationId: AgentOperationId
  AgentRegistrationId: AgentRegistrationId
  Authority: Authority
  CapturedRead: CapturedRead
  CardAnswer: CardAnswer
  CardReply: CardReply
  CardRequest: CardRequest
  CardRound: CardRound
  CardRoundId: CardRoundId
  CardRoundProgress: CardRoundProgress
  CompactionAdvance: CompactionAdvance
  CompactionProgress: CompactionProgress
  CompactionState: CompactionState
  ConsumerRef: ConsumerRef
  ConsumptionId: ConsumptionId
  ContextContent: ContextContent
  Continuation: Continuation
  CurrentConditions: CurrentConditions<string>
  DecisionCards: DecisionCards<string>
  Evidence: Evidence
  ExecutionAttachmentId: ExecutionAttachmentId
  ExecutionRevision: ExecutionRevision
  ExtensionImplementations: ExtensionImplementations<string>
  Failure: Failure
  FailureCandidate: FailureCandidate
  FinalRequest: FinalRequest
  GuardFact: GuardFact
  GuardLevel: GuardLevel
  HandoffResult: HandoffResult
  IdentityFailure: IdentityFailure
  InputBatch: InputBatch
  InputBatchId: InputBatchId
  InputId: InputId
  LoopFacts: LoopFacts
  Material: Material<ContentBlock>
  MessageHandoff: MessageHandoff<string>
  MessageSource: MessageSource
  ModelContextRead: ModelContextRead
  ModelContextReader: ModelContextReader<string>
  ModelPurpose: ModelPurpose
  ModelRecipient: ModelRecipient
  ModelReplyAdmission: ModelReplyAdmission
  ModelSelection: ModelSelection<string>
  Next: Next
  Passage: Passage
  PassageCard: PassageCard
  PassageId: PassageId
  PassageOperation: PassageOperation
  PassageOperationProgress: PassageOperationProgress<string>
  PassageProgress: PassageProgress
  PendingCall: PendingCall
  Preparation: Preparation
  PreparedContextTransition: PreparedContextTransition
  ProducedResult: ProducedResult
  ProducerDecisionView: ProducerDecisionView
  ProgressionDirective: ProgressionDirective
  RegisteredReads: RegisteredReads<string>
  Reply: Reply<number>
  ReplyAdmissionPage: ReplyAdmissionPage
  ReplyAdmissionProjection: ReplyAdmissionProjection
  RequestPreparation: RequestPreparation<string>
  RuntimeConditions: RuntimeConditions
  SelectedModel: SelectedModel
  StepId: StepId
  StructureFailure: StructureFailure
  Subject: Subject
  Waiting: Waiting
}

/*
 * Every name of the chapters "身份、原位置与纯求值", "请求准备、模型选择与压缩" and
 * "扩展、人工卡片与材料" of docs/public-api/README.md, imported from the package entry. A name that
 * the entry does not export fails the type check of this file. The three names after
 * `AgentInstant` in the import are this package's own judgment failures, not design-page names.
 */
export type { Landed }

type KindOf<U extends { kind: string }> = U['kind']
/** Every member name of every member of a union of object types. */
type KeysOfUnion<U> = U extends unknown ? keyof U & string : never

describe('the identity brands', () => {
  it('keep the brand literals of the design page and do not mix', () => {
    expectTypeOf<StepId>().toExtend<string>()
    expectTypeOf<string>().not.toExtend<StepId>()
    expectTypeOf<StepId>().not.toExtend<ActionId>()
    expectTypeOf<ActionId>().not.toExtend<StepId>()
    expectTypeOf<ActionId>().toEqualTypeOf<AgentIdentity<'AgentActionId'>>()
    expectTypeOf<StepId>().toEqualTypeOf<AgentIdentity<'AgentStepId'>>()
    expectTypeOf<InputId>().toEqualTypeOf<AgentIdentity<'AgentInputId'>>()
    expectTypeOf<ConsumptionId>().toEqualTypeOf<AgentIdentity<'AgentConsumptionId'>>()
    expectTypeOf<AgentInstant>().toEqualTypeOf<string>()
  })

  it('shape the failures of a decode and of a structure judgment', () => {
    expectTypeOf<IdentityFailure['reason']>().toEqualTypeOf<
      'type' | 'empty' | 'length' | 'character'
    >()
    expectTypeOf<StructureFailure['reason']>().toEqualTypeOf<
      'type' | 'empty' | 'unknown-field' | 'missing' | 'identity'
    >()
  })
})

describe('the discriminants of the evaluation chapter', () => {
  it('Next has the fourteen kinds of the loop nodes', () => {
    expectTypeOf<KindOf<Next>>().toEqualTypeOf<
      | 'reconcile'
      | 'take-inputs'
      | 'prepare-request'
      | 'compact-derive'
      | 'commit-transition'
      | 'resume-request'
      | 'extension'
      | 'admit-model'
      | 'admit-message'
      | 'admit-tools'
      | 'consume'
      | 'wait'
      | 'try-finish'
      | 'stop'
    >()
    expectTypeOf<Extract<Next, { kind: 'stop' }>['reason']>().toEqualTypeOf<
      'cancelled' | 'terminal' | 'superseded' | 'suspended'
    >()
    expectTypeOf<Extract<Next, { kind: 'wait' }>['waiting']>().toEqualTypeOf<readonly Waiting[]>()
    expectTypeOf<Extract<Next, { kind: 'admit-model' }>['preparation']>().toEqualTypeOf<
      Extract<Preparation, { kind: 'ready' }>
    >()
  })

  it('Failure has the six shapes and the group of the plain kinds', () => {
    expectTypeOf<KindOf<Failure>>().toEqualTypeOf<
      | 'denied'
      | 'invalid'
      | 'unavailable'
      | 'stale-advance'
      | 'not-ready'
      | 'terminal'
      | 'busy'
      | 'changed'
      | 'unsupported'
      | 'commit-unknown'
      | 'conflict'
    >()
    expectTypeOf<Extract<Failure, { kind: 'invalid' }>>().toEqualTypeOf<
      Readonly<{ kind: 'invalid'; field: string; reason: string }>
    >()
    expectTypeOf<
      Extract<Failure, { kind: 'commit-unknown' }>['operation']
    >().toEqualTypeOf<AgentOperationId>()
    expectTypeOf<
      Extract<Failure, { kind: 'conflict' }>['operation']
    >().toEqualTypeOf<AgentOperationId>()
  })

  it('Waiting has three kinds', () => {
    expectTypeOf<KindOf<Waiting>>().toEqualTypeOf<'producer' | 'human' | 'dependency'>()
    expectTypeOf<Extract<Waiting, { kind: 'producer' }>['pending']>().toEqualTypeOf<PendingCall>()
    expectTypeOf<Extract<Waiting, { kind: 'human' }>['cards']>().toEqualTypeOf<
      readonly Evidence[]
    >()
  })

  it('PendingCall splits by kind into a model call and a tool call', () => {
    expectTypeOf<KindOf<PendingCall>>().toEqualTypeOf<'model' | 'tool'>()
    const model = null as unknown as Extract<PendingCall, { kind: 'model' }>
    const tool = null as unknown as Extract<PendingCall, { kind: 'tool' }>
    expectTypeOf(model.call).toEqualTypeOf<M.ModelCallId>()
    expectTypeOf(model.admission).toEqualTypeOf<M.ModelOperationId>()
    expectTypeOf(model.purpose).toEqualTypeOf<ModelPurpose>()
    expectTypeOf(tool.call).toEqualTypeOf<T.ToolCallId>()
    expectTypeOf(tool.admission).toEqualTypeOf<T.ToolOperationId>()
    expectTypeOf(tool.purpose).toEqualTypeOf<'action'>()
    expectTypeOf<ModelPurpose>().toEqualTypeOf<'main' | 'compaction' | 'extension'>()
    expectTypeOf<PendingCall['position']>().toEqualTypeOf<ConsumerRef>()
  })

  it('keeps the small discriminants of the other unions', () => {
    expectTypeOf<KindOf<AgentConclusion>>().toEqualTypeOf<'complete' | 'fail' | 'cancelled'>()
    expectTypeOf<KindOf<ProgressionDirective>>().toEqualTypeOf<'evaluate-completion' | 'continue'>()
    expectTypeOf<KindOf<ActionJudgment>>().toEqualTypeOf<
      'pending' | 'waiting' | 'denied' | 'allowed'
    >()
    expectTypeOf<KindOf<ActionBarrier>>().toEqualTypeOf<'closed' | 'open' | 'all-denied'>()
    expectTypeOf<KindOf<ActionSlot>>().toEqualTypeOf<
      'denied' | 'dispatched' | 'result' | 'background'
    >()
    expectTypeOf<KindOf<ReplyAdmissionPage>>().toEqualTypeOf<'page' | 'gap'>()
    expectTypeOf<KindOf<FailureCandidate>>().toEqualTypeOf<
      | 'cannot-fit'
      | 'compaction-invalid'
      | 'request-rejected'
      | 'no-reply'
      | 'message-rejected'
      | 'extension-stop'
      | 'guard'
    >()
    expectTypeOf<KindOf<ProducerDecisionView>>().toEqualTypeOf<
      | 'unresolved'
      | 'model-active'
      | 'model-settled'
      | 'tool-active'
      | 'tool-result'
      | 'tool-background'
    >()
    expectTypeOf<GuardLevel>().toEqualTypeOf<0 | 1 | 2 | 3>()
    expectTypeOf<Extract<FailureCandidate, { kind: 'guard' }>['level']>().toEqualTypeOf<3>()
    expectTypeOf<Action['original']['kind']>().toEqualTypeOf<'tool_call'>()
  })

  it('Reply resolves to an Outcome of the value or a Failure', () => {
    expectTypeOf<Reply<number>>().toEqualTypeOf<Promise<Outcome<number, Failure>>>()
  })

  it('AgentEvaluator speaks Outcome and Continuation', () => {
    expectTypeOf<ReturnType<AgentEvaluator['next']>>().toEqualTypeOf<Outcome<Next, Failure>>()
    expectTypeOf<ReturnType<AgentEvaluator['encode']>>().toEqualTypeOf<Continuation>()
    expectTypeOf<ReturnType<AgentEvaluator['decode']>>().toEqualTypeOf<
      Outcome<AgentCheckpoint, Failure>
    >()
  })
})

describe('the discriminants of the request chapter', () => {
  it('Preparation has four kinds and each carries its own members', () => {
    expectTypeOf<KindOf<Preparation>>().toEqualTypeOf<
      'assembled' | 'ready' | 'needs-compaction' | 'cannot-fit'
    >()
    expectTypeOf<
      Extract<Preparation, { kind: 'ready' }>['request']
    >().toEqualTypeOf<M.FixedModelRequest>()
    expectTypeOf<
      Extract<Preparation, { kind: 'assembled' }>['input']
    >().toEqualTypeOf<M.AssembledModelInput>()
    expectTypeOf<
      Extract<Preparation, { kind: 'needs-compaction' }>['progress']
    >().toEqualTypeOf<CompactionProgress>()
    expectTypeOf<Extract<Preparation, { kind: 'cannot-fit' }>['reason']>().toEqualTypeOf<
      'fixed' | 'after-compaction'
    >()
    expectTypeOf<Preparation['purpose']>().toEqualTypeOf<ModelPurpose>()
  })

  it('CompactionAdvance and ContextContent keep their literals', () => {
    expectTypeOf<KindOf<CompactionAdvance>>().toEqualTypeOf<
      'continue' | 'transition' | 'cannot-fit'
    >()
    expectTypeOf<ContextContent>().toEqualTypeOf<'full' | 'incremental'>()
    expectTypeOf<CompactionState['ended']>().toEqualTypeOf<'committed' | 'failed' | null>()
  })

  it('prepare excludes the compaction purpose', () => {
    type PrepareInput = Parameters<RequestPreparation<string>['prepare']>[0]
    expectTypeOf<PrepareInput['purpose']>().toEqualTypeOf<'main' | 'extension'>()
    expectTypeOf<ReturnType<RequestPreparation<string>['prepare']>>().toEqualTypeOf<
      Reply<Preparation>
    >()
    expectTypeOf<ReturnType<ModelSelection<string>['select']>>().toEqualTypeOf<
      Reply<SelectedModel>
    >()
  })
})

describe('the subject of each position', () => {
  it('is the union of the twelve shapes of the design page and no other member name', () => {
    expectTypeOf<KeysOfUnion<Subject>>().toEqualTypeOf<
      | 'execution'
      | 'conditions'
      | 'preparation'
      | 'transition'
      | 'purpose'
      | 'step'
      | 'progress'
      | 'call'
      | 'result'
      | 'reply'
      | 'termination'
      | 'account'
      | 'request'
      | 'fault'
      | 'dispatches'
      | 'retry'
      | 'action'
      | 'original'
      | 'effectiveArguments'
      | 'definition'
      | 'batch'
      | 'candidate'
      | 'outcome'
      | 'outcomes'
      | 'proposed'
      | 'basis'
      | 'terminal'
      | 'disposition'
    >()
  })

  it('splits the model positions by the purpose literal', () => {
    type Main = Extract<Subject, { purpose: 'main'; preparation: unknown }>
    type Step = Extract<Subject, { purpose: 'compaction'; step: unknown }>
    expectTypeOf<Main['preparation']>().toEqualTypeOf<Extract<Preparation, { kind: 'assembled' }>>()
    expectTypeOf<Step['step']>().toEqualTypeOf<Extract<Preparation, { kind: 'ready' }>>()
    expectTypeOf<Step['progress']>().toEqualTypeOf<CompactionProgress>()
    type Reply_ = Extract<Subject, { reply: unknown }>
    expectTypeOf<Reply_['purpose']>().toEqualTypeOf<'main' | 'compaction'>()
    expectTypeOf<Reply_['reply']>().toEqualTypeOf<Message>()
    expectTypeOf<Reply_['termination']>().toEqualTypeOf<M.Termination>()
    type Failed = Extract<Subject, { fault: unknown }>
    expectTypeOf<Failed['fault']>().toEqualTypeOf<M.ModelFault>()
    expectTypeOf<Failed['dispatches']>().toEqualTypeOf<readonly M.DispatchRecord[]>()
    expectTypeOf<Failed['retry']>().toEqualTypeOf<M.RetryResolution | null>()
  })

  it('carries the original tool call, the outcome and the batch outcomes', () => {
    type Before = Extract<Subject, { definition: unknown }>
    expectTypeOf<Before['original']>().toEqualTypeOf<Action['original']>()
    expectTypeOf<Before['definition']>().toEqualTypeOf<T.ToolDefinition>()
    type Each = Extract<Subject, { outcome: unknown }>
    expectTypeOf<KindOf<Each['outcome']>>().toEqualTypeOf<'denied' | 'executed'>()
    type Batch = Extract<Subject, { outcomes: unknown }>
    expectTypeOf<Batch['outcomes'][number]['outcome']>().toEqualTypeOf<'denied' | 'executed'>()
    expectTypeOf<Batch['outcomes'][number]['terminal']>().toEqualTypeOf<T.ToolTerminal | null>()
    expectTypeOf<
      Extract<Subject, { proposed: unknown }>['proposed']
    >().toEqualTypeOf<AgentConclusion>()
    expectTypeOf<
      Extract<Subject, { terminal: unknown }>['terminal']
    >().toEqualTypeOf<AgentConclusion>()
  })

  it('accepts a start subject and refuses a loose record', () => {
    expectTypeOf<{ execution: AgentExecutionId; conditions: Evidence }>().toExtend<Subject>()
    expectTypeOf<Record<string, unknown>>().not.toExtend<Subject>()
    expectTypeOf<{ purpose: 'other'; preparation: unknown }>().not.toExtend<Subject>()
  })
})

describe('the discriminants of the passage ledger', () => {
  it('keep the progress literals', () => {
    expectTypeOf<KindOf<PassageProgress>>().toEqualTypeOf<
      'requested' | 'asked' | 'resolved' | 'applied'
    >()
    expectTypeOf<KindOf<CardRoundProgress>>().toEqualTypeOf<
      'requested' | 'presented' | 'answered' | 'processed' | 'present-failed'
    >()
    expectTypeOf<KindOf<PassageOperation>>().toEqualTypeOf<'producer' | 'read' | 'guard'>()
    expectTypeOf<KindOf<PassageOperationProgress<number>>>().toEqualTypeOf<
      'requested' | 'resolved' | 'applied'
    >()
    expectTypeOf<KindOf<CardAnswer>>().toEqualTypeOf<'chosen' | 'declined'>()
    expectTypeOf<KindOf<CardReply>>().toEqualTypeOf<
      'chosen' | 'declined' | 'pending' | 'invalidated'
    >()
    expectTypeOf<Passage['purpose']>().toEqualTypeOf<'main' | 'compaction' | null>()
  })

  it('keep the discriminants of admission, hand-over and material', () => {
    expectTypeOf<KindOf<AdmissionDecision>>().toEqualTypeOf<
      'allow' | 'deny' | 'need-decision' | 'unavailable'
    >()
    expectTypeOf<KindOf<MessageSource>>().toEqualTypeOf<
      | 'external-input'
      | 'model-reply'
      | 'tool-result'
      | 'action-denied'
      | 'reminder'
      | 'context-transition'
    >()
    expectTypeOf<KindOf<HandoffResult>>().toEqualTypeOf<'accepted' | 'rejected'>()
    expectTypeOf<KindOf<Material<ContentBlock>>>().toEqualTypeOf<'model' | 'tool' | 'facts'>()
  })

  it('give the ports their reply types', () => {
    expectTypeOf<ReturnType<MessageHandoff<string>['accept']>>().toEqualTypeOf<
      Reply<HandoffResult>
    >()
    expectTypeOf<ReturnType<ActionAdmission<string>['admit']>>().toEqualTypeOf<
      Reply<AdmissionDecision>
    >()
    expectTypeOf<ReturnType<DecisionCards<string>['read']>>().toEqualTypeOf<Reply<CardReply>>()
    expectTypeOf<ReturnType<AgentMaterials<string, ContentBlock>['preserve']>>().toEqualTypeOf<
      Reply<Evidence>
    >()
    expectTypeOf<ReturnType<ExtensionImplementations<string>['resolve']>>().toEqualTypeOf<
      Reply<LoopExtensionImplementation>
    >()
  })
})
