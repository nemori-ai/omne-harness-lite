import { describe, expectTypeOf, it } from 'vitest'
import type { CallAccount } from '@omne-harness/call-account'
import type { ContentBlock } from '@omne-harness/content-block'
import type { Message } from '@omne-harness/message'
import type { Outcome } from '@omne-harness/operation-result'
import type * as M from '@omne-harness/model-contract'
import type * as T from '@omne-harness/tool-contract'
import type {
  AcceptedInput,
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
  AgentAccessCheck,
  AgentAccessDecision,
  AgentAccessOperation,
  AgentAccessTarget,
  AgentAdoptions,
  AgentCheckpoint,
  AgentClock,
  AgentConclusion,
  AgentDirectory,
  AgentEvaluator,
  AgentEvent,
  AgentEventBody,
  AgentExecutionControl,
  AgentExecutionEvents,
  AgentExecutionHandle,
  AgentExecutionId,
  AgentExecutionInput,
  AgentExecutionRecovery,
  AgentHandle,
  AgentIdentity,
  AgentInstanceHost,
  AgentInstanceId,
  AgentInstant,
  AgentJournal,
  AgentJournalAttachment,
  AgentJournalEntry,
  AgentJournalFinishing,
  AgentJournalObservation,
  AgentJournalReading,
  AgentJournalRecording,
  AgentMaterials,
  AgentObservation,
  AgentOperationId,
  AgentRegistrationHandle,
  AgentRegistrationId,
  AgentRuntime,
  AgentRuntimeControl,
  AgentState,
  Authority,
  CallerCommit,
  CapturedRead,
  CardAnswer,
  CardRemark,
  CardReply,
  CardRequest,
  CardRound,
  CardRoundId,
  CardRoundProgress,
  CommandReceipt,
  CompactionAdvance,
  CompactionProgress,
  CompactionState,
  ConsumerRef,
  ConsumptionId,
  ContextContent,
  Continuation,
  ControlRecord,
  ControlStage,
  ControlStageFact,
  CurrentConditions,
  DecisionCards,
  EffectIntent,
  EventPage,
  DurableEvidence,
  ExecutionAttachmentId,
  ExecutionControl,
  ExecutionMutation,
  ExecutionRevision,
  ExecutionSnapshot,
  ExecutionState,
  ExtensionImplementations,
  ExtensionOutput,
  ExtensionReplayBinding,
  Failure,
  FailureCandidate,
  FinalRequest,
  FinishAuthorization,
  FinishIntent,
  FinishResult,
  CancellationBlock,
  CancellationDecision,
  CancellationJudgmentInput,
  CancellationJudgmentRecord,
  CancellationPolicy,
  CancellationPolicyInstallation,
  CancellationUnknown,
  CandidateSupersession,
  ContinuationRequest,
  ExecutionSettlement,
  ExtensionInvocationResult,
  FinishCandidate,
  FinishCandidateContent,
  FinishObligation,
  FinishObligations,
  FinishRoute,
  HandoffRecordMaterial,
  InvocationUnresolved,
  JournalCommitState,
  LegacyF2Entry,
  LegacyInvocationReturn,
  MigrationRecord,
  ObligationCategory,
  ObligationDisposition,
  PendingReason,
  RecoveryAction,
  RecoveryContinuation,
  ResponsibilityCoverage,
  SettlementRequest,
  SettlementResult,
  TerminalParticipantFacts,
  ToolAssociationRecord,
  GuardFact,
  GuardLevel,
  HandoffChange,
  HandoffCustody,
  HandoffCustodyAttempt,
  HandoffDecision,
  HandoffExclusionRecord,
  HandoffFactSource,
  HandoffHistory,
  HandoffLookup,
  HandoffOutcome,
  HandoffPosition,
  HandoffPrepare,
  HandoffReference,
  HandoffRequest,
  HandoffResolution,
  HandoffRetirement,
  ExecutionHandoff,
  IdentityFailure,
  InputEntry,
  InputHandoff,
  InputOrigin,
  InvokeRuntimeContext,
  JournalSubmitLineage,
  OriginalInputAcceptance,
  PendingHandoff,
  SubmitDelivery,
  InputBatch,
  InputBatchId,
  InputId,
  JournalCapabilities,
  JournalCommit,
  LoopExtensionImplementation,
  LoopExtensionDeclaration,
  LoopFacts,
  Material,
  MessageHandoff,
  MessageSource,
  NamedCapturedRead,
  NeedDeclaration,
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
  QuiesceResult,
  RegisteredReads,
  Registration,
  RegistrationState,
  Reply,
  ReplyAdmissionPage,
  ReplyAdmissionProjection,
  RequestPreparation,
  ResultResponsibility,
  RuntimeConditions,
  SelectedModel,
  StepId,
  StructureFailure,
  Subject,
  UtcInstantText,
  TerminalObservation,
  Waiting,
} from '@omne-harness/agent-contract'
// J09: the definition has no version, so the entry no longer names a version choice. The import
// is the assertion; the name is not used.
// @ts-expect-error `VersionChoice` left the entry with `AgentDefinition.version`.
import type { VersionChoice as _VersionChoice } from '@omne-harness/agent-contract'

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
  CardRemark: CardRemark
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
  DurableEvidence: DurableEvidence
  ExecutionAttachmentId: ExecutionAttachmentId
  ExecutionRevision: ExecutionRevision
  ExtensionImplementations: ExtensionImplementations<string>
  Failure: Failure
  FailureCandidate: FailureCandidate
  FinalRequest: FinalRequest
  GuardFact: GuardFact
  GuardLevel: GuardLevel
  HandoffChange: HandoffChange
  HandoffCustody: HandoffCustody
  HandoffCustodyAttempt: HandoffCustodyAttempt
  HandoffDecision: HandoffDecision
  HandoffExclusionRecord: HandoffExclusionRecord
  HandoffFactSource: HandoffFactSource
  HandoffHistory: HandoffHistory
  HandoffLookup: HandoffLookup
  HandoffOutcome: HandoffOutcome
  HandoffPosition: HandoffPosition
  HandoffPrepare: HandoffPrepare
  HandoffReference: HandoffReference
  HandoffRequest: HandoffRequest
  HandoffResolution: HandoffResolution
  HandoffRetirement: HandoffRetirement
  ExecutionHandoff: ExecutionHandoff
  IdentityFailure: IdentityFailure
  InputEntry: InputEntry
  InputHandoff: InputHandoff
  InputOrigin: InputOrigin
  InvokeRuntimeContext: InvokeRuntimeContext
  JournalSubmitLineage: JournalSubmitLineage
  OriginalInputAcceptance: OriginalInputAcceptance
  PendingHandoff: PendingHandoff
  SubmitDelivery: SubmitDelivery
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
  NamedCapturedRead: NamedCapturedRead
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
  AcceptedInput: AcceptedInput
  AgentAccessCheck: AgentAccessCheck<string>
  AgentAccessDecision: AgentAccessDecision
  AgentAccessOperation: AgentAccessOperation
  AgentAccessTarget: AgentAccessTarget
  AgentAdoptions: AgentAdoptions<string>
  AgentClock: AgentClock
  AgentDirectory: AgentDirectory<string>
  AgentEvent: AgentEvent
  AgentEventBody: AgentEventBody
  AgentExecutionControl: AgentExecutionControl<string>
  AgentExecutionEvents: AgentExecutionEvents<string>
  AgentExecutionHandle: AgentExecutionHandle<string>
  AgentExecutionInput: AgentExecutionInput<string>
  AgentExecutionRecovery: AgentExecutionRecovery<string>
  AgentHandle: AgentHandle<string>
  AgentInstanceHost: AgentInstanceHost<string>
  AgentJournal: AgentJournal<string>
  AgentJournalAttachment: AgentJournalAttachment<string>
  AgentJournalFinishing: AgentJournalFinishing<string>
  AgentJournalObservation: AgentJournalObservation<string>
  AgentJournalReading: AgentJournalReading<string>
  AgentJournalRecording: AgentJournalRecording<string>
  AgentObservation: AgentObservation
  AgentRegistrationHandle: AgentRegistrationHandle<string>
  AgentRuntime: AgentRuntime<string>
  AgentRuntimeControl: AgentRuntimeControl<string>
  AgentState: AgentState
  CallerCommit: CallerCommit
  CommandReceipt: CommandReceipt
  ControlRecord: ControlRecord
  ControlStage: ControlStage
  ControlStageFact: ControlStageFact
  EffectIntent: EffectIntent
  EventPage: EventPage
  ExecutionControl: ExecutionControl
  ExecutionMutation: ExecutionMutation<string>
  ExecutionSnapshot: ExecutionSnapshot
  ExecutionState: ExecutionState
  FinishAuthorization: FinishAuthorization
  FinishIntent: FinishIntent
  FinishResult: FinishResult
  CancellationBlock: CancellationBlock
  CancellationDecision: CancellationDecision
  CancellationJudgmentInput: CancellationJudgmentInput
  CancellationJudgmentRecord: CancellationJudgmentRecord
  CancellationPolicy: CancellationPolicy
  CancellationPolicyInstallation: CancellationPolicyInstallation
  CancellationUnknown: CancellationUnknown
  CandidateSupersession: CandidateSupersession
  ContinuationRequest: ContinuationRequest<unknown>
  ExecutionSettlement: ExecutionSettlement
  FinishCandidate: FinishCandidate
  FinishCandidateContent: FinishCandidateContent
  FinishObligation: FinishObligation
  FinishObligations: FinishObligations
  FinishRoute: FinishRoute
  HandoffRecordMaterial: HandoffRecordMaterial
  InvocationUnresolved: InvocationUnresolved
  JournalCommitState: JournalCommitState
  LegacyF2Entry: LegacyF2Entry
  LegacyInvocationReturn: LegacyInvocationReturn
  MigrationRecord: MigrationRecord
  ObligationCategory: ObligationCategory
  ObligationDisposition: ObligationDisposition
  PendingReason: PendingReason
  RecoveryAction: RecoveryAction
  RecoveryContinuation: RecoveryContinuation
  ResponsibilityCoverage: ResponsibilityCoverage
  SettlementRequest: SettlementRequest<string>
  SettlementResult: SettlementResult
  TerminalParticipantFacts: TerminalParticipantFacts
  ToolAssociationRecord: ToolAssociationRecord
  JournalCapabilities: JournalCapabilities
  JournalCommit: JournalCommit<string>
  QuiesceResult: QuiesceResult
  Registration: Registration
  RegistrationState: RegistrationState
  ResultResponsibility: ResultResponsibility
  TerminalObservation: TerminalObservation
}

/*
 * Every name of the chapters of docs/public-api/README.md that this package implements, imported
 * from the package entry. A name that the entry does not export fails the type check of this
 * file. `IdentityFailure` and `StructureFailure` are this package's own judgment failures, not
 * design-page names.
 */
describe('the names of the design page', () => {
  it('resolve to concrete types from the package entry', () => {
    expectTypeOf<Landed>().not.toBeAny()
    expectTypeOf<keyof Landed>().not.toBeNever()
  })
})

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

  it('declare each need with a name, the exact adoption of its contract and whether it is required', () => {
    expectTypeOf<NeedDeclaration>().toEqualTypeOf<
      Readonly<{ name: string; schema: Adoption; required: boolean }>
    >()
    expectTypeOf<LoopExtensionDeclaration['needs']>().toEqualTypeOf<
      readonly [NeedDeclaration, ...NeedDeclaration[]] | undefined
    >()
  })

  it('brand the UTC instant text that only judgeExtensionOutput mints', () => {
    expectTypeOf<UtcInstantText>().toExtend<string>()
    expectTypeOf<string>().not.toExtend<UtcInstantText>()
    expectTypeOf<AgentInstant>().not.toExtend<UtcInstantText>()
    expectTypeOf<UtcInstantText>().not.toExtend<ActionId>()
    expectTypeOf<
      Extract<ExtensionOutput, { kind: 'retry' }>['plan']['notBefore']
    >().toEqualTypeOf<UtcInstantText | null>()
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
      readonly DurableEvidence[]
    >()
  })

  it('PendingCall splits by kind into a model call and a tool call', () => {
    expectTypeOf<KindOf<PendingCall>>().toEqualTypeOf<'model' | 'tool'>()
    const model = null as unknown as Extract<PendingCall, { kind: 'model' }>
    const tool = null as unknown as Extract<PendingCall, { kind: 'tool' }>
    expectTypeOf(model.reference).toEqualTypeOf<M.ModelInvocationRef>()
    // @ts-expect-error Model intent uses the pre-admission locator.
    void model.call
    // @ts-expect-error Admission operation is encoded in the locator.
    void model.admission
    expectTypeOf(model.purpose).toEqualTypeOf<ModelPurpose>()
    expectTypeOf(tool.call).toEqualTypeOf<undefined>()
    expectTypeOf(tool.admission).toEqualTypeOf<undefined>()
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

  it('has one variant for each row of the subject table of extensions.md, and no other', () => {
    // Each row as the table of docs/public-api/extensions.md, "位置与作者可见的 subject", writes it.
    // A row equals exactly one variant: `Extract` keeps every variant assignable to the row, so a
    // second match or a drifted shape makes the two sides differ.
    type Started = Readonly<{ execution: AgentExecutionId; conditions: DurableEvidence }>
    type BeforeCompaction = Readonly<{
      preparation: Extract<Preparation, { kind: 'needs-compaction' }>
    }>
    type AfterCompaction = Readonly<{ transition: PreparedContextTransition }>
    type BeforeMainCall = Readonly<{
      purpose: 'main'
      preparation: Extract<Preparation, { kind: 'assembled' }>
    }>
    type BeforeCompactionCall = Readonly<{
      purpose: 'compaction'
      step: Extract<Preparation, { kind: 'ready' }>
      progress: CompactionProgress
    }>
    type CompleteReply = Readonly<{
      purpose: 'main' | 'compaction'
      call: M.ModelCallId
      result: ProducedResult
      reply: Message
      termination: M.Termination
      account: CallAccount | null
    }>
    type CallFailure = Readonly<{
      purpose: 'main' | 'compaction'
      call: M.ModelCallId
      request: M.FixedModelRequest
      fault: M.ModelFault
      dispatches: readonly M.DispatchRecord[]
      retry: M.RetryResolution | null
    }>
    type BeforeAction = Readonly<{
      action: ActionId
      original: Action['original']
      effectiveArguments: string
      definition: T.ToolDefinition
      batch: readonly ActionId[]
    }>
    type EachResult = Readonly<{
      action: ActionId
      outcome:
        | Readonly<{ kind: 'denied'; evidence: DurableEvidence }>
        | Readonly<{ kind: 'executed'; result: ProducedResult; terminal: T.ToolTerminal }>
      candidate: Message
    }>
    type BatchResult = Readonly<{
      batch: ActionBatchId
      outcomes: readonly Readonly<{
        action: ActionId
        outcome: 'denied' | 'executed'
        terminal: T.ToolTerminal | null
      }>[]
    }>
    type BeforeTerminal = Readonly<{ proposed: AgentConclusion; basis: DurableEvidence }>
    type AfterTerminal = Readonly<{ terminal: AgentConclusion; disposition: DurableEvidence }>

    expectTypeOf<Extract<Subject, Started>>().toEqualTypeOf<Started>()
    expectTypeOf<Extract<Subject, BeforeCompaction>>().toEqualTypeOf<BeforeCompaction>()
    expectTypeOf<Extract<Subject, AfterCompaction>>().toEqualTypeOf<AfterCompaction>()
    expectTypeOf<Extract<Subject, BeforeMainCall>>().toEqualTypeOf<BeforeMainCall>()
    expectTypeOf<Extract<Subject, BeforeCompactionCall>>().toEqualTypeOf<BeforeCompactionCall>()
    expectTypeOf<Extract<Subject, CompleteReply>>().toEqualTypeOf<CompleteReply>()
    expectTypeOf<Extract<Subject, CallFailure>>().toEqualTypeOf<CallFailure>()
    expectTypeOf<Extract<Subject, BeforeAction>>().toEqualTypeOf<BeforeAction>()
    expectTypeOf<Extract<Subject, EachResult>>().toEqualTypeOf<EachResult>()
    expectTypeOf<Extract<Subject, BatchResult>>().toEqualTypeOf<BatchResult>()
    expectTypeOf<Extract<Subject, BeforeTerminal>>().toEqualTypeOf<BeforeTerminal>()
    expectTypeOf<Extract<Subject, AfterTerminal>>().toEqualTypeOf<AfterTerminal>()
    expectTypeOf<
      | Started
      | BeforeCompaction
      | AfterCompaction
      | BeforeMainCall
      | BeforeCompactionCall
      | CompleteReply
      | CallFailure
      | BeforeAction
      | EachResult
      | BatchResult
      | BeforeTerminal
      | AfterTerminal
    >().toEqualTypeOf<Subject>()
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
    expectTypeOf<{
      execution: AgentExecutionId
      conditions: DurableEvidence
    }>().toExtend<Subject>()
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
    expectTypeOf<KindOf<CardRemark>>().toEqualTypeOf<'remark'>()
    expectTypeOf<KindOf<CardReply>>().toEqualTypeOf<
      'chosen' | 'declined' | 'remark' | 'pending' | 'invalidated'
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
    expectTypeOf<KindOf<HandoffDecision>>().toEqualTypeOf<'prepared' | 'rejected'>()
    expectTypeOf<KindOf<Material<ContentBlock>>>().toEqualTypeOf<'model' | 'tool' | 'facts'>()
  })

  it('carry a remark to the original extension and to action admission, never a pending or invalidated reply', () => {
    type AdmissionAnswer = NonNullable<
      Parameters<ActionAdmission<string>['admit']>[0]['decision']
    >['answer']
    expectTypeOf<CardRemark>().toEqualTypeOf<
      Readonly<{ kind: 'remark'; text: string; evidence: DurableEvidence }>
    >()
    expectTypeOf<
      NonNullable<ExtensionReplayBinding['rounds'][number]['cards'][number]['response']>['answer']
    >().toEqualTypeOf<CardAnswer | CardRemark>()
    expectTypeOf<AdmissionAnswer>().toEqualTypeOf<CardAnswer | CardRemark>()
    expectTypeOf<CardRemark>().toExtend<AdmissionAnswer>()
    expectTypeOf<Readonly<{ kind: 'pending' }>>().not.toExtend<AdmissionAnswer>()
    expectTypeOf<
      Readonly<{ kind: 'invalidated'; evidence: DurableEvidence }>
    >().not.toExtend<AdmissionAnswer>()
  })

  it('hand action admission the reads by need name, an empty list meaning no read', () => {
    expectTypeOf<NamedCapturedRead>().toEqualTypeOf<CapturedRead & Readonly<{ need: string }>>()
    expectTypeOf<Parameters<ActionAdmission<string>['admit']>[0]['permissions']>().toEqualTypeOf<
      readonly NamedCapturedRead[]
    >()
    expectTypeOf<readonly []>().toExtend<
      Parameters<ActionAdmission<string>['admit']>[0]['permissions']
    >()
    expectTypeOf<null>().not.toExtend<
      Parameters<ActionAdmission<string>['admit']>[0]['permissions']
    >()
    expectTypeOf<CapturedRead>().not.toExtend<NamedCapturedRead>()
  })

  it('shapes the message admission: three prepare branches, three lookup conclusions, two origins and the entry index', () => {
    expectTypeOf<keyof MessageHandoff<string>>().toEqualTypeOf<'prepare' | 'lookup' | 'exclude'>()
    expectTypeOf<KindOf<HandoffPrepare>>().toEqualTypeOf<'execution' | 'invoke' | 'submit'>()
    expectTypeOf<Extract<HandoffPrepare, { kind: 'execution' }>>().toEqualTypeOf<
      Readonly<{ kind: 'execution'; request: PendingHandoff; advance: Authority }>
    >()
    expectTypeOf<Extract<HandoffPrepare, { kind: 'invoke' }>>().toEqualTypeOf<
      Readonly<{ kind: 'invoke'; request: InputHandoff; runtime: InvokeRuntimeContext }>
    >()
    // The submit branch has no advance, runtime, current or grant member.
    expectTypeOf<Extract<HandoffPrepare, { kind: 'submit' }>>().toEqualTypeOf<
      Readonly<{ kind: 'submit'; request: InputHandoff }>
    >()
    expectTypeOf<KindOf<HandoffDecision>>().toEqualTypeOf<'prepared' | 'rejected'>()
    expectTypeOf<KindOf<HandoffResolution>>().toEqualTypeOf<'recorded' | 'excluded' | 'unknown'>()
    expectTypeOf<
      Extract<HandoffResolution, { kind: 'unknown' }>['original']
    >().toEqualTypeOf<Readonly<{
      request: HandoffRequest
      origin: InputOrigin | null
      record: DurableEvidence
    }> | null>()
    expectTypeOf<KindOf<HandoffReference>>().toEqualTypeOf<'execution' | 'input'>()
    expectTypeOf<KindOf<HandoffRequest>>().toEqualTypeOf<'execution' | 'input'>()
    expectTypeOf<KindOf<HandoffLookup>>().toEqualTypeOf<'execution' | 'input-entry'>()
    expectTypeOf<KindOf<InputOrigin>>().toEqualTypeOf<'invoke' | 'submit'>()
    expectTypeOf<KindOf<SubmitDelivery>>().toEqualTypeOf<'runtime-view' | 'durable-view'>()
    expectTypeOf<KindOf<InputEntry>>().toEqualTypeOf<'invoke' | 'submit'>()
    expectTypeOf<Extract<InputEntry, { kind: 'submit' }>>().not.toHaveProperty('checkpoint')
    expectTypeOf<
      Extract<InputEntry, { kind: 'invoke' }>['checkpoint']
    >().toEqualTypeOf<AgentCheckpoint>()
    expectTypeOf<PendingHandoff['source']>().toEqualTypeOf<
      Exclude<MessageSource, { kind: 'external-input' }>
    >()
    expectTypeOf<HandoffOutcome['origin']>().toEqualTypeOf<InputOrigin | null>()
    expectTypeOf<HandoffPosition>().toEqualTypeOf<
      Readonly<{ step: StepId; node: string; slot: string | null }>
    >()
  })

  it('give the ports their reply types', () => {
    expectTypeOf<ReturnType<MessageHandoff<string>['prepare']>>().toEqualTypeOf<
      Reply<HandoffOutcome>
    >()
    expectTypeOf<ReturnType<MessageHandoff<string>['lookup']>>().toEqualTypeOf<
      Reply<HandoffResolution>
    >()
    expectTypeOf<ReturnType<MessageHandoff<string>['exclude']>>().toEqualTypeOf<
      Reply<HandoffResolution>
    >()
    expectTypeOf<Parameters<MessageHandoff<string>['exclude']>[0]>().toEqualTypeOf<
      Access<string> & Readonly<{ request: PendingHandoff; control: AgentOperationId }>
    >()
    expectTypeOf<ReturnType<ActionAdmission<string>['admit']>>().toEqualTypeOf<
      Reply<AdmissionDecision>
    >()
    expectTypeOf<ReturnType<DecisionCards<string>['read']>>().toEqualTypeOf<Reply<CardReply>>()
    expectTypeOf<ReturnType<AgentMaterials<string, ContentBlock>['preserve']>>().toEqualTypeOf<
      Reply<DurableEvidence>
    >()
    expectTypeOf<ReturnType<ExtensionImplementations<string>['resolve']>>().toEqualTypeOf<
      Reply<LoopExtensionImplementation>
    >()
  })
})

describe('the discriminants of the coordination chapter', () => {
  it('ExecutionState has five kinds and each carries its own members', () => {
    expectTypeOf<KindOf<ExecutionState>>().toEqualTypeOf<
      'reconciling' | 'advancing' | 'waiting' | 'settling' | 'suspended' | 'ended'
    >()
    expectTypeOf<Extract<ExecutionState, { kind: 'waiting' }>['waits']>().toEqualTypeOf<
      readonly Waiting[]
    >()
    expectTypeOf<
      Extract<ExecutionState, { kind: 'settling' }>['intent']
    >().toEqualTypeOf<FinishIntent>()
    expectTypeOf<
      Extract<ExecutionState, { kind: 'suspended' }>['handoff']
    >().toEqualTypeOf<DurableEvidence>()
    expectTypeOf<
      Extract<ExecutionState, { kind: 'ended' }>['disposition']
    >().toEqualTypeOf<DurableEvidence>()
    expectTypeOf<
      Extract<ExecutionState, { kind: 'ended' }>['conclusion']
    >().toEqualTypeOf<AgentConclusion>()
  })

  it('FinishResult separates ended, changed and blocked with five blocking reasons', () => {
    expectTypeOf<KindOf<FinishResult>>().toEqualTypeOf<'ended' | 'changed' | 'blocked'>()
    expectTypeOf<Extract<FinishResult, { kind: 'blocked' }>['reason']>().toEqualTypeOf<
      'inputs' | 'controls' | 'operations' | 'passages' | 'custody'
    >()
    expectTypeOf<
      Extract<FinishResult, { kind: 'ended' }>['receipt']
    >().toEqualTypeOf<CommandReceipt>()
    expectTypeOf<KindOf<FinishAuthorization>>().toEqualTypeOf<'advancement' | 'cancel'>()
  })

  it('ExecutionControl names the four controls and the call each interrupt targets', () => {
    expectTypeOf<KindOf<ExecutionControl>>().toEqualTypeOf<
      'interrupt-model' | 'interrupt-tool' | 'background-tool' | 'cancel' | 'suspend'
    >()
    expectTypeOf<
      Extract<ExecutionControl, { kind: 'interrupt-model' }>['call']
    >().toEqualTypeOf<M.ModelCallId>()
    expectTypeOf<Extract<ExecutionControl, { call: T.ToolCallId }>['kind']>().toEqualTypeOf<
      'interrupt-tool' | 'background-tool'
    >()
    expectTypeOf<ControlStage>().toEqualTypeOf<
      | 'accepted'
      | 'intent-established'
      | 'qualification-revoked'
      | 'producer-confirmed'
      | 'physically-stopped'
      | 'duty-released'
    >()
    expectTypeOf<ControlStageFact['state']>().toEqualTypeOf<'reached' | 'unresolved'>()
    expectTypeOf<ControlRecord['stages']['accepted']>().toEqualTypeOf<ControlStageFact>()
  })

  it('AgentEventBody has seven kinds; a commit carries neither the ended nor the entry kind', () => {
    expectTypeOf<KindOf<AgentEventBody>>().toEqualTypeOf<
      'input-taken' | 'message' | 'producer' | 'entry' | 'waiting' | 'control' | 'ended'
    >()
    expectTypeOf<
      Extract<AgentEventBody, { kind: 'entry' }>['entry']
    >().toEqualTypeOf<AgentJournalEntry>()
    expectTypeOf<
      Extract<AgentEventBody, { kind: 'control' }>['stage']
    >().toEqualTypeOf<ControlStage>()
    expectTypeOf<KindOf<JournalCommit<string>['events'][number]>>().toEqualTypeOf<
      'input-taken' | 'message' | 'producer' | 'waiting' | 'control'
    >()
    expectTypeOf<KindOf<JournalCommit<string>['state']>>().toEqualTypeOf<
      'reconciling' | 'advancing' | 'waiting' | 'settling' | 'suspended'
    >()
  })

  it('the pages, observations and states keep their literals', () => {
    expectTypeOf<KindOf<EventPage>>().toEqualTypeOf<'page' | 'gap'>()
    expectTypeOf<KindOf<AgentState>>().toEqualTypeOf<
      'idle' | 'occupied' | 'draining' | 'disposed'
    >()
    expectTypeOf<KindOf<AgentObservation>>().toEqualTypeOf<'state' | 'ended'>()
    expectTypeOf<Extract<AgentObservation, { kind: 'ended' }>['reason']>().toEqualTypeOf<
      'closed' | 'denied' | 'retired' | 'unavailable'
    >()
    expectTypeOf<RegistrationState>().toEqualTypeOf<'published' | 'withdrawing' | 'withdrawn'>()
    expectTypeOf<CommandReceipt['state']>().toEqualTypeOf<'accepted' | 'applied' | 'unresolved'>()
    expectTypeOf<AcceptedInput['priority']>().toEqualTypeOf<'ordinary' | 'urgent'>()
    expectTypeOf<QuiesceResult['kind']>().toEqualTypeOf<'drained' | 'unresolved'>()
  })

  it('AgentAccessDecision has three kinds and only an allowance carries evidence', () => {
    expectTypeOf<KindOf<AgentAccessDecision>>().toEqualTypeOf<
      'allowed' | 'denied' | 'unavailable'
    >()
    expectTypeOf<
      Extract<AgentAccessDecision, { kind: 'allowed' }>['evidence']
    >().toEqualTypeOf<DurableEvidence>()
    expectTypeOf<
      Extract<AgentAccessDecision, { kind: 'unavailable' }>['diagnostic']
    >().toEqualTypeOf<string>()
    // SPEC "主体资格核验": four target branches; the execution target is the logical execution alone.
    expectTypeOf<KindOf<AgentAccessTarget>>().toEqualTypeOf<
      'scope' | 'instance' | 'execution' | 'input-entry'
    >()
    expectTypeOf<Extract<AgentAccessTarget, { kind: 'execution' }>>().toEqualTypeOf<
      Readonly<{ kind: 'execution'; execution: AgentExecutionId }>
    >()
    expectTypeOf<Extract<AgentAccessTarget, { kind: 'input-entry' }>>().toEqualTypeOf<
      Readonly<{ kind: 'input-entry'; execution: AgentExecutionId; operation: AgentOperationId }>
    >()
    expectTypeOf<'takeover'>().toExtend<AgentAccessOperation>()
    expectTypeOf<'record-terminal-observation'>().toExtend<AgentAccessOperation>()
    expectTypeOf<'read-message-handoff'>().toExtend<AgentAccessOperation>()
    expectTypeOf<'record-message-handoff'>().toExtend<AgentAccessOperation>()
    expectTypeOf<'exclude-message-handoff'>().toExtend<AgentAccessOperation>()
    expectTypeOf<'settle'>().toExtend<AgentAccessOperation>()
    expectTypeOf<'migrate-cancellation'>().toExtend<AgentAccessOperation>()
    expectTypeOf<'attach'>().not.toExtend<AgentAccessOperation>()
    expectTypeOf<ReturnType<AgentAccessCheck<string>['check']>>().toEqualTypeOf<
      Promise<AgentAccessDecision>
    >()
  })

  it('the stream and observation ports are async iterables, a registration is a plain report', () => {
    expectTypeOf<ReturnType<AgentExecutionEvents<string>['events']>>().toEqualTypeOf<
      AsyncIterable<Outcome<EventPage, Failure>>
    >()
    expectTypeOf<ReturnType<AgentHandle<string>['observe']>>().toEqualTypeOf<
      AsyncIterable<AgentObservation>
    >()
    expectTypeOf<ReturnType<AgentRegistrationHandle<string>['report']>>().toEqualTypeOf<void>()
    expectTypeOf<Parameters<AgentClock['now']>>().toEqualTypeOf<[]>()
    expectTypeOf<ReturnType<AgentClock['now']>>().toEqualTypeOf<Reply<AgentInstant>>()
    expectTypeOf<ReturnType<AgentClock['waitUntil']>>().toEqualTypeOf<
      Reply<'elapsed' | 'cancelled'>
    >()
    expectTypeOf<ReturnType<AgentRuntime<string>['invoke']>>().toEqualTypeOf<
      Reply<AgentExecutionHandle<string>>
    >()
    expectTypeOf<ReturnType<AgentExecutionRecovery<string>['load']>>().toEqualTypeOf<
      Reply<ExecutionSnapshot>
    >()
  })

  it('ExecutionMutation carries the access, the execution and the operation', () => {
    expectTypeOf<ExecutionMutation<string>['execution']>().toEqualTypeOf<AgentExecutionId>()
    expectTypeOf<ExecutionMutation<string>['operation']>().toEqualTypeOf<AgentOperationId>()
    expectTypeOf<ExecutionMutation<string>>().toExtend<Access<string>>()
  })
})

describe('the discriminants of the Journal chapter', () => {
  it('CallerCommit has five kinds and the capabilities exclude none', () => {
    expectTypeOf<KindOf<CallerCommit>>().toEqualTypeOf<
      'none' | 'message' | 'context-transition' | 'custody' | 'processed'
    >()
    expectTypeOf<
      Extract<CallerCommit, { kind: 'custody' }>['retained']
    >().toEqualTypeOf<DurableEvidence>()
    expectTypeOf<
      Extract<CallerCommit, { kind: 'processed' }>['completion']
    >().toEqualTypeOf<DurableEvidence>()
    expectTypeOf<JournalCapabilities['participants']>().toEqualTypeOf<
      ReadonlySet<'message' | 'context-transition' | 'custody' | 'processed'>
    >()
    // SPEC "提交参加者协议": the binding declares its coordination mode; there is no implicit default.
    expectTypeOf<JournalCapabilities['coordination']>().toEqualTypeOf<
      'standalone' | 'coordinated'
    >()
    expectTypeOf<keyof JournalCapabilities>().toEqualTypeOf<'coordination' | 'participants'>()
    expectTypeOf<EffectIntent['pending']>().toEqualTypeOf<PendingCall>()
  })

  it('AgentJournal is assignable to each of its five role groups and adds the capabilities', () => {
    expectTypeOf<AgentJournal<string>>().toExtend<AgentJournalAttachment<string>>()
    expectTypeOf<AgentJournal<string>>().toExtend<AgentJournalRecording<string>>()
    expectTypeOf<AgentJournal<string>>().toExtend<AgentJournalFinishing<string>>()
    expectTypeOf<AgentJournal<string>>().toExtend<AgentJournalObservation<string>>()
    expectTypeOf<AgentJournal<string>>().toExtend<AgentJournalReading<string>>()
    expectTypeOf<AgentJournal<string>['capabilities']>().toEqualTypeOf<JournalCapabilities>()
  })

  it('the groups keep the capabilities apart: reading holds no write, finishing holds one operation', () => {
    expectTypeOf<keyof AgentJournalFinishing<string>>().toEqualTypeOf<
      'tryFinish' | 'prepareFinish' | 'commitSettlement'
    >()
    expectTypeOf<
      keyof AgentJournalObservation<string>
    >().toEqualTypeOf<'recordTerminalObservation'>()
    expectTypeOf<keyof AgentJournalReading<string>>().toEqualTypeOf<
      'load' | 'inputs' | 'readReplyAdmissions' | 'query' | 'output'
    >()
    expectTypeOf<keyof AgentJournalAttachment<string>>().toEqualTypeOf<
      'open' | 'attach' | 'detach'
    >()
    expectTypeOf<AgentJournalReading<string>['output']>().toEqualTypeOf<
      Pick<AgentExecutionEvents<string>, 'read' | 'events'>
    >()
    expectTypeOf<AgentJournalRecording<string>>().not.toExtend<AgentJournalFinishing<string>>()
    expectTypeOf<AgentJournalReading<string>>().not.toExtend<AgentJournalRecording<string>>()
  })

  it('commits carry the handoff change, open takes the two acceptance parts, submit takes its lineage and the snapshot lists the handoffs', () => {
    expectTypeOf<JournalCommit<string>['handoff']>().toEqualTypeOf<HandoffChange | null>()
    expectTypeOf<KindOf<HandoffChange>>().toEqualTypeOf<'prepare' | 'resolve' | 'retire'>()
    expectTypeOf<Extract<HandoffChange, { kind: 'retire' }>['excluded']>().toEqualTypeOf<
      Extract<HandoffResolution, { kind: 'excluded' }>
    >()
    expectTypeOf<KindOf<HandoffHistory>>().toEqualTypeOf<
      'pending' | 'committed' | 'not-applicable' | 'retained'
    >()
    expectTypeOf<ExecutionSnapshot['handoffs']>().toEqualTypeOf<readonly ExecutionHandoff[]>()
    expectTypeOf<ExecutionHandoff['resolution']>().toEqualTypeOf<Extract<
      HandoffResolution,
      { kind: 'recorded' | 'excluded' }
    > | null>()
    expectTypeOf<AgentCheckpoint['currentHandoff']>().toEqualTypeOf<HandoffReference | null>()
    expectTypeOf<ActionSlot['handoff']>().toEqualTypeOf<HandoffReference | null>()
    expectTypeOf<Parameters<AgentJournalAttachment<string>['open']>[0]>().toEqualTypeOf<
      ExecutionMutation<string> &
        Readonly<{ original: OriginalInputAcceptance; runtime: InvokeRuntimeContext }>
    >()
    expectTypeOf<KindOf<JournalSubmitLineage>>().toEqualTypeOf<'new-input' | 'recognize-input'>()
    expectTypeOf<
      Parameters<AgentJournalRecording<string>['submit']>[0]['lineage']
    >().toEqualTypeOf<JournalSubmitLineage>()
    expectTypeOf<keyof AgentJournalRecording<string>>().toEqualTypeOf<
      | 'commit'
      | 'submit'
      | 'control'
      | 'acknowledge'
      | 'recordResult'
      | 'recordControl'
      | 'recordHandoff'
    >()
    expectTypeOf<Parameters<AgentJournalRecording<string>['recordHandoff']>[0]>().toEqualTypeOf<
      ExecutionMutation<string> &
        Readonly<{
          original: Extract<HandoffResolution, { kind: 'recorded' | 'excluded' }>
          custody: HandoffCustody | null
        }>
    >()
    expectTypeOf<HandoffCustody['protocol']>().toEqualTypeOf<'hand-off-custody-successor/1'>()
    expectTypeOf<HandoffCustody['priorExcluded']>().toEqualTypeOf<
      readonly HandoffExclusionRecord[]
    >()
    expectTypeOf<HandoffCustody['factSource']>().toEqualTypeOf<HandoffFactSource>()
    expectTypeOf<HandoffCustodyAttempt['state']>().toEqualTypeOf<'committed' | 'excluded'>()
    expectTypeOf<ExecutionHandoff['retirement']>().toEqualTypeOf<HandoffRetirement | null>()
    // Q14: the transition keeps its original candidate, plan, basis material and epoch.
    expectTypeOf<keyof PreparedContextTransition>().toEqualTypeOf<
      | 'preparation'
      | 'message'
      | 'source'
      | 'derivation'
      | 'commitment'
      | 'candidate'
      | 'plan'
      | 'basis'
      | 'epoch'
    >()
  })

  it('reuses the handle operations as inputs and answers the query like recovery does', () => {
    expectTypeOf<Parameters<AgentJournalRecording<string>['submit']>[0]>().toEqualTypeOf<
      Parameters<AgentExecutionInput<string>['submit']>[0] &
        Readonly<{ lineage: JournalSubmitLineage }>
    >()
    expectTypeOf<ReturnType<AgentJournalReading<string>['query']>>().toEqualTypeOf<
      ReturnType<AgentExecutionRecovery<string>['query']>
    >()
    // SPEC "查询的四种结论与持久拒绝": rejected carries the fixed conflict, the audit and its revision.
    type QueryConclusion =
      Awaited<ReturnType<AgentExecutionRecovery<string>['query']>> extends Outcome<
        infer Conclusion,
        Failure
      >
        ? Conclusion
        : never
    expectTypeOf<KindOf<QueryConclusion>>().toEqualTypeOf<
      'committed' | 'rejected' | 'excluded' | 'unknown'
    >()
    expectTypeOf<Extract<QueryConclusion, { kind: 'rejected' }>>().toEqualTypeOf<
      Readonly<{
        kind: 'rejected'
        failure: Extract<Failure, { kind: 'conflict' }>
        audit: DurableEvidence
        revision: ExecutionRevision
      }>
    >()
    expectTypeOf<
      Extract<QueryConclusion, { kind: 'committed' }>['receipt']
    >().toEqualTypeOf<CommandReceipt>()
    expectTypeOf<ReturnType<AgentJournalFinishing<string>['tryFinish']>>().toEqualTypeOf<
      Reply<FinishResult>
    >()
    expectTypeOf<
      Parameters<AgentJournalRecording<string>['recordControl']>[0]['stage']
    >().toEqualTypeOf<Exclude<ControlStage, 'accepted'>>()
  })
})

describe('Tool association and control references', () => {
  type Common = Pick<PendingCall, 'action' | 'consumption' | 'position' | 'fixed'>
  type Intent = Common & Readonly<{ kind: 'tool'; purpose: 'action'; association: 'intent' }>
  type Associated = Common &
    Readonly<{
      kind: 'tool'
      purpose: 'action'
      association: 'associated'
      reference: T.ToolInvocationRef
    }>

  it('allows intent before identity and requires the Tool reference after association', () => {
    expectTypeOf<Intent>().toExtend<PendingCall>()
    expectTypeOf<Associated>().toExtend<PendingCall>()
    expectTypeOf<Omit<Associated, 'reference'>>().not.toExtend<PendingCall>()
    expectTypeOf<Intent & { call: T.ToolCallId }>().not.toExtend<PendingCall>()
    expectTypeOf<Intent & { admission: T.ToolOperationId }>().not.toExtend<PendingCall>()
    expectTypeOf<Intent & { reference: T.ToolInvocationRef }>().not.toExtend<PendingCall>()
    expectTypeOf<Associated & { call: T.ToolCallId }>().not.toExtend<PendingCall>()
    expectTypeOf<Associated & { admission: T.ToolOperationId }>().not.toExtend<PendingCall>()
    expectTypeOf<
      Omit<Associated, 'reference'> & { reference: M.ModelInvocationRef }
    >().not.toExtend<PendingCall>()
    expectTypeOf<
      Omit<Associated, 'reference'> & { reference: T.ToolOperationRef }
    >().not.toExtend<PendingCall>()
  })

  it('admits only associated Tool calls into active, result and background views', () => {
    type Known = Extract<
      ProducerDecisionView,
      { kind: 'tool-active' | 'tool-result' | 'tool-background' }
    >
    expectTypeOf<Intent>().not.toExtend<Known['pending']>()
    expectTypeOf<Associated>().toExtend<Known['pending']>()
    expectTypeOf<Intent>().toExtend<
      Extract<ProducerDecisionView, { kind: 'unresolved' }>['pending']
    >()
    expectTypeOf<
      Extract<ActionJudgment, { kind: 'allowed' }>['request']
    >().toEqualTypeOf<T.ToolInvokeRequest>()
    expectTypeOf<{
      kind: 'allowed'
      evidence: DurableEvidence
      request: T.ToolInvokeRequest
    }>().toExtend<ActionJudgment>()
  })

  it('requires invocation and nullable operation only for Tool controls', () => {
    type Base = Pick<ControlRecord, 'operation' | 'stages'>
    type Tool = Base & {
      command: Extract<ExecutionControl, { kind: 'interrupt-tool' | 'background-tool' }>
      toolInvocation: T.ToolInvocationRef
      toolOperation: T.ToolOperationRef | null
    }
    type Other = Base & {
      command: Extract<ExecutionControl, { kind: 'cancel' | 'suspend' | 'interrupt-model' }>
    }
    expectTypeOf<Tool>().toExtend<ControlRecord>()
    expectTypeOf<Omit<Tool, 'toolInvocation'>>().not.toExtend<ControlRecord>()
    expectTypeOf<Omit<Tool, 'toolOperation'>>().not.toExtend<ControlRecord>()
    expectTypeOf<Other>().toExtend<ControlRecord>()
    expectTypeOf<Other & { toolInvocation: T.ToolInvocationRef }>().not.toExtend<ControlRecord>()
    expectTypeOf<Other & { toolOperation: null }>().not.toExtend<ControlRecord>()
    expectTypeOf<
      Omit<Tool, 'toolInvocation'> & { toolInvocation: M.ModelInvocationRef }
    >().not.toExtend<ControlRecord>()
    expectTypeOf<
      Omit<Tool, 'toolOperation'> & { toolOperation: T.ToolInvocationRef }
    >().not.toExtend<ControlRecord>()
    expectTypeOf<
      Parameters<AgentJournalRecording<string>['recordControl']>[0]['toolOperation']
    >().toEqualTypeOf<T.ToolOperationRef | undefined>()
  })
})

describe('S3: the finish projection, the candidate commit, the obligations and the settlement', () => {
  it('FinishIntent is the projection the Journal maintains: candidate, nullable obligations, nullable beforeTerminal', () => {
    expectTypeOf<FinishIntent['candidate']>().toEqualTypeOf<AgentOperationId>()
    expectTypeOf<FinishIntent['obligations']>().toEqualTypeOf<DurableEvidence | null>()
    expectTypeOf<FinishIntent['beforeTerminal']>().toEqualTypeOf<DurableEvidence | null>()
    expectTypeOf<FinishIntent['conclusion']>().toEqualTypeOf<AgentConclusion>()
  })
  it('a commit writes the candidate content in `finish` and a settling state without the intent', () => {
    expectTypeOf<JournalCommit<string>['finish']>().toEqualTypeOf<FinishCandidateContent | null>()
    expectTypeOf<JournalCommit<string>['state']>().toEqualTypeOf<JournalCommitState>()
    expectTypeOf<Extract<JournalCommitState, { kind: 'settling' }>>().toEqualTypeOf<
      Readonly<{ kind: 'settling' }>
    >()
    expectTypeOf<KindOf<JournalCommitState>>().toEqualTypeOf<
      'reconciling' | 'advancing' | 'waiting' | 'settling' | 'suspended'
    >()
    expectTypeOf<keyof FinishCandidateContent>().toEqualTypeOf<
      'origin' | 'conclusion' | 'failure' | 'inputWatermark' | 'conditions'
    >()
    expectTypeOf<FinishCandidate['checkpoint']>().toEqualTypeOf<AgentCheckpoint>()
    expectTypeOf<KindOf<FinishRoute>>().toEqualTypeOf<'author' | 'cancellation'>()
    expectTypeOf<
      Extract<FinishRoute, { kind: 'author' }>['beforeTerminal']
    >().toEqualTypeOf<DurableEvidence | null>()
    expectTypeOf<KindOf<Extract<FinishRoute, { kind: 'cancellation' }>['origin']>>().toEqualTypeOf<
      'native' | 'migration'
    >()
    expectTypeOf<KindOf<LegacyF2Entry>>().toEqualTypeOf<'not-started' | 'recorded'>()
  })
  it('the snapshot carries the issued obligations and the settlement projection at one revision', () => {
    expectTypeOf<ExecutionSnapshot['finishObligations']>().toEqualTypeOf<FinishObligations | null>()
    expectTypeOf<ExecutionSnapshot['settlement']>().toEqualTypeOf<ExecutionSettlement>()
    expectTypeOf<ExecutionSettlement['currentJudgment']>().toEqualTypeOf<AgentOperationId | null>()
    expectTypeOf<ExecutionSettlement['candidate']>().toEqualTypeOf<FinishCandidate | null>()
    expectTypeOf<ExecutionSettlement['route']>().toEqualTypeOf<FinishRoute | null>()
    expectTypeOf<ExecutionSettlement['migrations']>().toEqualTypeOf<readonly MigrationRecord[]>()
    expectTypeOf<ExecutionSettlement['judgments']>().toEqualTypeOf<
      readonly CancellationJudgmentRecord[]
    >()
    expectTypeOf<ExecutionSettlement['supersessions']>().toEqualTypeOf<
      readonly CandidateSupersession[]
    >()
    expectTypeOf<FinishObligations['items']>().toEqualTypeOf<readonly FinishObligation[]>()
    expectTypeOf<FinishObligations['coverage']>().toEqualTypeOf<ResponsibilityCoverage>()
    expectTypeOf<KindOf<FinishObligation>>().toEqualTypeOf<
      | 'accepted-input'
      | 'control'
      | 'operation'
      | 'handoff'
      | 'call'
      | 'passage'
      | 'card-round'
      | 'result'
      | 'material'
      | 'output'
      | 'terminal-observation'
    >()
    expectTypeOf<ObligationCategory>().toEqualTypeOf<
      'inputs' | 'controls' | 'operations' | 'passages' | 'custody'
    >()
    // The category is not a member of the head: the SPEC table fixes it per kind.
    expectTypeOf<KeysOfUnion<FinishObligation>>().not.toExtend<'category'>()
    expectTypeOf<
      Extract<FinishObligation, { kind: 'operation' }>['result']
    >().toEqualTypeOf<DurableEvidence | null>()
    expectTypeOf<Extract<FinishObligation, { kind: 'call' }>['interruptions']>().toEqualTypeOf<
      readonly AgentOperationId[]
    >()
    expectTypeOf<
      Extract<FinishObligation, { kind: 'card-round' }>['invalidate']
    >().toEqualTypeOf<Readonly<{ operation: AgentOperationId; reason: DurableEvidence }> | null>()
    expectTypeOf<
      Extract<FinishObligation, { kind: 'material' }>['acceptance']
    >().toEqualTypeOf<DurableEvidence | null>()
    expectTypeOf<FinishObligation['disposition']>().toEqualTypeOf<ObligationDisposition>()
    expectTypeOf<KindOf<ObligationDisposition>>().toEqualTypeOf<
      'settled' | 'held' | 'pending' | 'unknown'
    >()
    expectTypeOf<
      Extract<ObligationDisposition, { kind: 'pending' }>['reason']
    >().toEqualTypeOf<PendingReason>()
    expectTypeOf<
      Extract<ObligationDisposition, { kind: 'pending' }>['required']
    >().toEqualTypeOf<RecoveryContinuation>()
    expectTypeOf<'required-judgment'>().toExtend<PendingReason>()
    expectTypeOf<'handoff-history'>().toExtend<PendingReason>()
    // RecoveryContinuation is a closed union by action (SPEC "终结责任清单"): each variant carries the
    // request of its original public operation, the owner, the custodian and the purpose.
    expectTypeOf<KindOf<RecoveryContinuation>>().toEqualTypeOf<RecoveryAction>()
    expectTypeOf<RecoveryAction>().toEqualTypeOf<
      | 'original-operation-query'
      | 'original-invoke-recovery'
      | 'tool-association-retain'
      | 'producer-query'
      | 'producer-receive'
      | 'producer-release'
      | 'card-lookup'
      | 'card-read'
      | 'card-invalidate'
      | 'material-read'
      | 'input-read'
      | 'output-read-ack'
      | 'terminal-observe'
      | 'restore-source'
      | 'handoff-lookup'
      | 'handoff-exclude'
      | 'handoff-record'
      | 'handoff-source-recovery'
    >()
    expectTypeOf<KeysOfUnion<RecoveryContinuation>>().toEqualTypeOf<
      'kind' | 'request' | 'owner' | 'custodian' | 'purpose'
    >()
    expectTypeOf<KindOf<ContinuationRequest<unknown>>>().toEqualTypeOf<
      'parameters' | 'record' | 'unresolved'
    >()
    expectTypeOf<Extract<ContinuationRequest<unknown>, { kind: 'unresolved' }>>().toEqualTypeOf<
      Readonly<{ kind: 'unresolved'; key: string; missing: DurableEvidence }>
    >()
    expectTypeOf<
      Extract<RecoveryContinuation, { kind: 'original-operation-query' }>['purpose']
    >().toEqualTypeOf<'query'>()
    expectTypeOf<
      Extract<RecoveryContinuation, { kind: 'handoff-lookup' }>['purpose']
    >().toEqualTypeOf<'read-message-handoff'>()
    expectTypeOf<
      Extract<RecoveryContinuation, { kind: 'handoff-exclude' }>['purpose']
    >().toEqualTypeOf<'exclude-message-handoff'>()
    expectTypeOf<
      Extract<RecoveryContinuation, { kind: 'handoff-record' }>['purpose']
    >().toEqualTypeOf<'record-message-handoff'>()
    expectTypeOf<
      Extract<RecoveryContinuation, { kind: 'handoff-record' }>['request']
    >().toEqualTypeOf<
      ContinuationRequest<
        Readonly<{
          operation: AgentOperationId
          handoff: HandoffReference
          original: Extract<HandoffResolution, { kind: 'recorded' | 'excluded' }>
          provider: Adoption
          material: HandoffRecordMaterial
        }>
      >
    >()
    expectTypeOf<
      Extract<RecoveryContinuation, { kind: 'tool-association-retain' }>['purpose']
    >().toEqualTypeOf<'reconcile'>()
    expectTypeOf<KindOf<TerminalParticipantFacts>>().toEqualTypeOf<'standalone' | 'coordinated'>()
  })
  it('prepareFinish issues the list under an authorization, expected and candidate', () => {
    expectTypeOf<Parameters<AgentJournalFinishing<string>['prepareFinish']>[0]>().toEqualTypeOf<
      ExecutionMutation<string> &
        Readonly<{
          authorization: FinishAuthorization
          expected: ExecutionRevision
          candidate: AgentOperationId
        }>
    >()
    expectTypeOf<ReturnType<AgentJournalFinishing<string>['prepareFinish']>>().toEqualTypeOf<
      Reply<Readonly<{ receipt: CommandReceipt; obligations: DurableEvidence }>>
    >()
  })
  it('commitSettlement takes the six variants and answers each with its record', () => {
    expectTypeOf<Parameters<AgentJournalFinishing<string>['commitSettlement']>[0]>().toEqualTypeOf<
      SettlementRequest<string>
    >()
    expectTypeOf<ReturnType<AgentJournalFinishing<string>['commitSettlement']>>().toEqualTypeOf<
      Reply<SettlementResult>
    >()
    expectTypeOf<KindOf<SettlementRequest<string>>>().toEqualTypeOf<
      | 'establish-cancellation'
      | 'migrate-cancellation'
      | 'judge-cancellation'
      | 'record-card-reconciliation'
      | 'record-legacy-return'
      | 'record-tool-association'
    >()
    expectTypeOf<KindOf<SettlementResult>>().toEqualTypeOf<KindOf<SettlementRequest<string>>>()
    expectTypeOf<
      Extract<SettlementRequest<string>, { kind: 'establish-cancellation' }>['authorization']
    >().toEqualTypeOf<Extract<FinishAuthorization, { kind: 'cancel' }>>()
    expectTypeOf<
      Extract<SettlementRequest<string>, { kind: 'judge-cancellation' }>['expected']
    >().toEqualTypeOf<ExecutionRevision>()
    expectTypeOf<
      KeysOfUnion<Extract<SettlementRequest<string>, { kind: 'record-tool-association' }>>
    >().not.toExtend<'expected' | 'checkpoint' | 'state' | 'events' | 'effects' | 'caller'>()
    expectTypeOf<
      Extract<SettlementResult, { kind: 'migrate-cancellation' }>['migration']
    >().toEqualTypeOf<MigrationRecord>()
    expectTypeOf<
      Extract<SettlementResult, { kind: 'judge-cancellation' }>['judgment']
    >().toEqualTypeOf<CancellationJudgmentRecord>()
    expectTypeOf<
      Extract<SettlementResult, { kind: 'record-legacy-return' }>['legacyReturn']
    >().toEqualTypeOf<LegacyInvocationReturn>()
    expectTypeOf<
      Extract<SettlementResult, { kind: 'record-tool-association' }>['association']
    >().toEqualTypeOf<ToolAssociationRecord>()
    expectTypeOf<MigrationRecord['priorExcluded']>().toExtend<object | null>()
    expectTypeOf<KindOf<CancellationDecision>>().toEqualTypeOf<'allowed' | 'blocked' | 'unknown'>()
    expectTypeOf<ReturnType<CancellationPolicy['judge']>>().toEqualTypeOf<CancellationDecision>()
    expectTypeOf<
      Parameters<CancellationPolicy['judge']>[0]
    >().toEqualTypeOf<CancellationJudgmentInput>()
    expectTypeOf<CancellationBlock['category']>().toEqualTypeOf<ObligationCategory>()
    expectTypeOf<CancellationUnknown['reason']>().toEqualTypeOf<
      | 'original-operation-unknown'
      | 'source-unavailable'
      | 'source-not-authenticated'
      | 'coverage-incomplete'
      | 'policy-unavailable'
      | 'qualification-unavailable'
    >()
    expectTypeOf<keyof CancellationPolicyInstallation>().toEqualTypeOf<
      | 'record'
      | 'decision'
      | 'policy'
      | 'inputSchema'
      | 'implementation'
      | 'legacyProtocols'
      | 'admission'
    >()
    expectTypeOf<
      CancellationJudgmentRecord['supersedes']
    >().toEqualTypeOf<AgentOperationId | null>()
  })
  it('the extension invocation result has the non-final invocationUnresolved branch', () => {
    expectTypeOf<KindOf<ExtensionInvocationResult>>().toEqualTypeOf<
      | 'output'
      | 'errored'
      | 'notStartedUnavailable'
      | 'replayInconsistent'
      | 'controlUnavailable'
      | 'invocationUnresolved'
    >()
    expectTypeOf<
      Extract<ExtensionInvocationResult, { kind: 'invocationUnresolved' }>
    >().toEqualTypeOf<InvocationUnresolved>()
    expectTypeOf<KindOf<InvocationUnresolved['start']>>().toEqualTypeOf<'unknown' | 'started'>()
    expectTypeOf<InvocationUnresolved['recovery']>().toEqualTypeOf<DurableEvidence>()
  })
})
