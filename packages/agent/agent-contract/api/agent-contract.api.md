# @omne-harness/agent-contract 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `AGENT_IDENTITY_MAX_LENGTH` · `identity.d.ts`
- `ATTRIBUTE_ITEMS` · `definition.d.ts`
- `AcceptedInput` · `execution.d.ts`
- `Access` · 包 `@omne-harness/legal-identity`
- `Action` · `evaluation.d.ts`
- `ActionAdmission` · `passages.d.ts`
- `ActionBarrier` · `evaluation.d.ts`
- `ActionBatch` · `evaluation.d.ts`
- `ActionBatchId` · `identity.d.ts`
- `ActionId` · `identity.d.ts`
- `ActionIdentity` · `extensions.d.ts`
- `ActionJudgment` · `evaluation.d.ts`
- `ActionSlot` · `evaluation.d.ts`
- `AdmissionDecision` · `passages.d.ts`
- `Adoption` · 包 `@omne-harness/exchange-refs`
- `AdvancementFact` · `evaluation.d.ts`
- `AgentAccessCheck` · `execution.d.ts`
- `AgentAccessDecision` · `execution.d.ts`
- `AgentAccessOperation` · `execution.d.ts`
- `AgentAccessTarget` · `execution.d.ts`
- `AgentAccountHandoff` · `receiving.d.ts`
- `AgentAccountOutcome` · `receiving.d.ts`
- `AgentAccountOutlet` · `receiving.d.ts`
- `AgentAdoptions` · `execution.d.ts`
- `AgentCheckpoint` · `evaluation.d.ts`
- `AgentClock` · `execution.d.ts`
- `AgentConclusion` · `evaluation.d.ts`
- `AgentDefinition` · `definition.d.ts`
- `AgentDirectory` · `execution.d.ts`
- `AgentEvaluator` · `evaluation.d.ts`
- `AgentEvent` · `execution.d.ts`
- `AgentEventBody` · `execution.d.ts`
- `AgentExecutionControl` · `execution.d.ts`
- `AgentExecutionEvents` · `execution.d.ts`
- `AgentExecutionHandle` · `execution.d.ts`
- `AgentExecutionId` · `identity.d.ts`
- `AgentExecutionInput` · `execution.d.ts`
- `AgentExecutionRecovery` · `execution.d.ts`
- `AgentHandle` · `execution.d.ts`
- `AgentIdentity` · `identity.d.ts`
- `AgentInstanceHost` · `execution.d.ts`
- `AgentInstanceId` · `identity.d.ts`
- `AgentInstant` · `identity.d.ts`
- `AgentJournal` · `journal.d.ts`
- `AgentJournalAttachment` · `journal.d.ts`
- `AgentJournalEntries` · `receiving.d.ts`
- `AgentJournalEntry` · `receiving.d.ts`
- `AgentJournalFinishing` · `journal.d.ts`
- `AgentJournalObservation` · `journal.d.ts`
- `AgentJournalReading` · `journal.d.ts`
- `AgentJournalRecording` · `journal.d.ts`
- `AgentMaterials` · `passages.d.ts`
- `AgentObservation` · `execution.d.ts`
- `AgentOperationId` · `identity.d.ts`
- `AgentReceivedCommits` · `receiving.d.ts`
- `AgentReceivedProvider` · `receiving.d.ts`
- `AgentRegistrationHandle` · `execution.d.ts`
- `AgentRegistrationId` · `identity.d.ts`
- `AgentRuntime` · `execution.d.ts`
- `AgentRuntimeControl` · `execution.d.ts`
- `AgentState` · `execution.d.ts`
- `AssetReference` · `definition.d.ts`
- `AttributeDeclaration` · `definition.d.ts`
- `AttributeItem` · `definition.d.ts`
- `Authority` · `identity.d.ts`
- `BatchJudgment` · `judgment.d.ts`
- `CallerCommit` · `journal.d.ts`
- `CancellationBlock` · `finishing.d.ts`
- `CancellationDecision` · `finishing.d.ts`
- `CancellationJudgmentInput` · `finishing.d.ts`
- `CancellationJudgmentRecord` · `finishing.d.ts`
- `CancellationPolicy` · `finishing.d.ts`
- `CancellationPolicyInstallation` · `finishing.d.ts`
- `CancellationUnknown` · `finishing.d.ts`
- `CandidateSupersession` · `finishing.d.ts`
- `CapabilityRef` · `definition.d.ts`
- `CapturedRead` · `passages.d.ts`
- `CardAnswer` · `passages.d.ts`
- `CardOption` · `extensions.d.ts`
- `CardReconciliationRecord` · `finishing.d.ts`
- `CardRemark` · `passages.d.ts`
- `CardReply` · `passages.d.ts`
- `CardRequest` · `passages.d.ts`
- `CardRound` · `passages.d.ts`
- `CardRoundId` · `identity.d.ts`
- `CardRoundProgress` · `passages.d.ts`
- `CommandReceipt` · `execution.d.ts`
- `CompactionAdvance` · `request.d.ts`
- `CompactionProgress` · `request.d.ts`
- `CompactionState` · `request.d.ts`
- `Conclusion` · `extensions.d.ts`
- `ConsumerRef` · 包 `@omne-harness/exchange-refs`
- `ConsumptionId` · `identity.d.ts`
- `ContextContent` · `request.d.ts`
- `Continuation` · `identity.d.ts`
- `ContinuationRequest` · `finishing.d.ts`
- `ControlRecord` · `execution.d.ts`
- `ControlStage` · `execution.d.ts`
- `ControlStageFact` · `execution.d.ts`
- `CoverageFacet` · `finishing.d.ts`
- `CurrentConditions` · `request.d.ts`
- `DecisionCardDraft` · `extensions.d.ts`
- `DecisionCards` · `passages.d.ts`
- `Dimension` · `extensions.d.ts`
- `DurableEvidence` · 包 `@omne-harness/exchange-refs`
- `EffectIntent` · `journal.d.ts`
- `ErrorPolicy` · `extensions.d.ts`
- `EventPage` · `execution.d.ts`
- `ExcludedPredecessor` · `finishing.d.ts`
- `ExecutionAttachmentId` · `identity.d.ts`
- `ExecutionControl` · `execution.d.ts`
- `ExecutionHandoff` · `journal.d.ts`
- `ExecutionMutation` · `execution.d.ts`
- `ExecutionRevision` · `identity.d.ts`
- `ExecutionSettlement` · `finishing.d.ts`
- `ExecutionSnapshot` · `execution.d.ts`
- `ExecutionState` · `execution.d.ts`
- `ExtensionImplementationDeclaration` · `extensions.d.ts`
- `ExtensionImplementations` · `passages.d.ts`
- `ExtensionInput` · `extensions.d.ts`
- `ExtensionInvocationMode` · `extensions.d.ts`
- `ExtensionInvocationResult` · `extensions.d.ts`
- `ExtensionOutput` · `extensions.d.ts`
- `ExtensionOutputJudgeInput` · `judge-output.d.ts`
- `ExtensionReplayBinding` · `extensions.d.ts`
- `Failure` · `evaluation.d.ts`
- `FailureCandidate` · `evaluation.d.ts`
- `FinalRequest` · `request.d.ts`
- `FinishAuthorization` · `execution.d.ts`
- `FinishCandidate` · `finishing.d.ts`
- `FinishCandidateContent` · `finishing.d.ts`
- `FinishIntent` · `execution.d.ts`
- `FinishObligation` · `finishing.d.ts`
- `FinishObligations` · `finishing.d.ts`
- `FinishResult` · `execution.d.ts`
- `FinishRoute` · `finishing.d.ts`
- `GuardFact` · `evaluation.d.ts`
- `GuardLevel` · `evaluation.d.ts`
- `HandoffChange` · `journal.d.ts`
- `HandoffCustody` · `journal.d.ts`
- `HandoffCustodyAttempt` · `journal.d.ts`
- `HandoffDecision` · `passages.d.ts`
- `HandoffExclusionRecord` · `journal.d.ts`
- `HandoffFactSource` · `journal.d.ts`
- `HandoffHistory` · `journal.d.ts`
- `HandoffLookup` · `passages.d.ts`
- `HandoffOutcome` · `passages.d.ts`
- `HandoffPosition` · `passages.d.ts`
- `HandoffPrepare` · `passages.d.ts`
- `HandoffRecordMaterial` · `finishing.d.ts`
- `HandoffReference` · `passages.d.ts`
- `HandoffRequest` · `passages.d.ts`
- `HandoffResolution` · `passages.d.ts`
- `HandoffRetirement` · `journal.d.ts`
- `IdentityFailure` · `identity.d.ts`
- `InputBatch` · `evaluation.d.ts`
- `InputBatchId` · `identity.d.ts`
- `InputEntry` · `passages.d.ts`
- `InputHandoff` · `passages.d.ts`
- `InputId` · `identity.d.ts`
- `InputOrigin` · `passages.d.ts`
- `InvocationUnresolved` · `extensions.d.ts`
- `InvokeRuntimeContext` · `passages.d.ts`
- `JournalCapabilities` · `journal.d.ts`
- `JournalCommit` · `journal.d.ts`
- `JournalCommitState` · `journal.d.ts`
- `JournalEntryRecord` · `receiving.d.ts`
- `JournalSubmitLineage` · `journal.d.ts`
- `Judgment` · `judgment.d.ts`
- `LegacyF2Entry` · `finishing.d.ts`
- `LegacyInvocationReturn` · `finishing.d.ts`
- `LoopExtensionDeclaration` · `extensions.d.ts`
- `LoopExtensionImplementation` · `extensions.d.ts`
- `LoopFacts` · `evaluation.d.ts`
- `Material` · `passages.d.ts`
- `MessageHandoff` · `passages.d.ts`
- `MessageSource` · `passages.d.ts`
- `MigrationRecord` · `finishing.d.ts`
- `ModelContextRead` · `request.d.ts`
- `ModelContextReader` · `request.d.ts`
- `ModelPurpose` · `evaluation.d.ts`
- `ModelRecipient` · `request.d.ts`
- `ModelReplyAdmission` · `evaluation.d.ts`
- `ModelSelection` · `request.d.ts`
- `NamedCapturedRead` · `passages.d.ts`
- `NeedDeclaration` · `extensions.d.ts`
- `Next` · `evaluation.d.ts`
- `ObligationCategory` · `finishing.d.ts`
- `ObligationDisposition` · `finishing.d.ts`
- `OriginalInputAcceptance` · `journal.d.ts`
- `OutputRefusalReason` · `judgment.d.ts`
- `POSITIONS` · `extensions.d.ts`
- `POSITION_OUTPUTS` · `judge-output.d.ts`
- `POWERS` · `extensions.d.ts`
- `Passage` · `passages.d.ts`
- `PassageCard` · `passages.d.ts`
- `PassageId` · `identity.d.ts`
- `PassageOperation` · `passages.d.ts`
- `PassageOperationProgress` · `passages.d.ts`
- `PassageProgress` · `passages.d.ts`
- `PendingCall` · `evaluation.d.ts`
- `PendingHandoff` · `passages.d.ts`
- `PendingReason` · `finishing.d.ts`
- `Position` · `extensions.d.ts`
- `PositionOutputKey` · `judge-output.d.ts`
- `PositionOutputs` · `judge-output.d.ts`
- `Power` · `extensions.d.ts`
- `Preparation` · `request.d.ts`
- `PreparedContextTransition` · `evaluation.d.ts`
- `ProducedResult` · `evaluation.d.ts`
- `ProducerDecisionView` · `evaluation.d.ts`
- `ProgressionDirective` · `evaluation.d.ts`
- `QuiesceResult` · `execution.d.ts`
- `ReceivedCommitInput` · `receiving.d.ts`
- `ReceivedCommitQuery` · `receiving.d.ts`
- `ReceivedCommitResult` · `receiving.d.ts`
- `ReceivedCommitValue` · `receiving.d.ts`
- `ReceivedDelivery` · `receiving.d.ts`
- `ReceivedEntry` · `receiving.d.ts`
- `RecoveryAction` · `finishing.d.ts`
- `RecoveryContinuation` · `finishing.d.ts`
- `RefusalReason` · `judgment.d.ts`
- `RegisteredReads` · `passages.d.ts`
- `Registration` · `execution.d.ts`
- `RegistrationState` · `execution.d.ts`
- `Reply` · `evaluation.d.ts`
- `ReplyAdmissionPage` · `evaluation.d.ts`
- `ReplyAdmissionProjection` · `evaluation.d.ts`
- `RequestPreparation` · `request.d.ts`
- `ResponsibilityCoverage` · `finishing.d.ts`
- `ResultResponsibility` · `execution.d.ts`
- `RuntimeConditions` · `evaluation.d.ts`
- `SelectedModel` · `request.d.ts`
- `SettlementRequest` · `finishing.d.ts`
- `SettlementResult` · `finishing.d.ts`
- `StartFenceEntry` · `receiving.d.ts`
- `StepId` · `identity.d.ts`
- `StructureFailure` · `identity.d.ts`
- `Subject` · `passages.d.ts`
- `SubmitDelivery` · `passages.d.ts`
- `TerminalObservation` · `execution.d.ts`
- `TerminalParticipantFact` · `finishing.d.ts`
- `TerminalParticipantFacts` · `finishing.d.ts`
- `ToolAssociationRecord` · `finishing.d.ts`
- `ToolIntentKey` · `finishing.d.ts`
- `UnavailabilityPolicy` · `extensions.d.ts`
- `UtcInstantText` · `identity.d.ts`
- `Waiting` · `evaluation.d.ts`
- `agentBodyContract` · `body-contract.d.ts`
- `decodeActionBatchId` · `identity.d.ts`
- `decodeActionId` · `identity.d.ts`
- `decodeAgentExecutionId` · `identity.d.ts`
- `decodeAgentInstanceId` · `identity.d.ts`
- `decodeAgentOperationId` · `identity.d.ts`
- `decodeAgentRegistrationId` · `identity.d.ts`
- `decodeCardRoundId` · `identity.d.ts`
- `decodeConsumptionId` · `identity.d.ts`
- `decodeExecutionAttachmentId` · `identity.d.ts`
- `decodeExecutionRevision` · `identity.d.ts`
- `decodeInputBatchId` · `identity.d.ts`
- `decodeInputId` · `identity.d.ts`
- `decodePassageId` · `identity.d.ts`
- `decodeStepId` · `identity.d.ts`
- `judgeAccess` · `identity.d.ts`
- `judgeAdoption` · `identity.d.ts`
- `judgeAgentDefinition` · `judge-definition.d.ts`
- `judgeAuthority` · `identity.d.ts`
- `judgeEvidence` · `identity.d.ts`
- `judgeExtensionOutput` · `judge-output.d.ts`
- `judgeHandoffPrepare` · `judge-handoff.d.ts`
- `judgeInputOrigin` · `judge-handoff.d.ts`
- `judgeLoopExtensions` · `judge-extensions.d.ts`
- `obligationCategoryOf` · `finishing.d.ts`

## 入口 `./testing` · `testing.d.ts`

- `AgentAccountOutletFixture` · `testing-account-outlet.d.ts`
- `AgentJournalCoreFixture` · `testing-journal-helpers.d.ts`
- `AgentJournalCoreOpenOptions` · `testing-journal-helpers.d.ts`
- `AgentJournalCoreOpened` · `testing-journal-helpers.d.ts`
- `AgentJournalEntriesFixture` · `testing-journal-entries.d.ts`
- `ConformanceCase` · `testing-case.d.ts`
- `MemoryAgentAccountOutlet` · `testing-account-outlet.d.ts`
- `MemoryAgentJournalEntries` · `testing-journal-entries.d.ts`
- `ReceivedCommitFixture` · `testing-received-fixture.d.ts`
- `RecordFault` · `testing-journal-entries.d.ts`
- `RequiredReceivedCommits` · `testing-received-fixture.d.ts`
- `SettlementQualification` · `testing-journal-helpers.d.ts`
- `TEST_CANCELLATION_IMPLEMENTATION` · `testing-cancellation.d.ts`
- `TEST_CANCELLATION_INPUT_SCHEMA` · `testing-cancellation.d.ts`
- `TEST_CANCELLATION_POLICY` · `testing-cancellation.d.ts`
- `TestHostRecord` · `testing-cancellation.d.ts`
- `agentAccountOutletConformance` · `testing-account-outlet.d.ts`
- `agentJournalCoreConformance` · `testing-journal-core.d.ts`
- `agentJournalEntriesConformance` · `testing-journal-entries.d.ts`
- `createMemoryAgentAccountOutlet` · `testing-account-outlet.d.ts`
- `createMemoryAgentJournalEntries` · `testing-journal-entries.d.ts`
- `createTestCancellationPolicy` · `testing-cancellation.d.ts`
- `memoryAgentAccountOutletFixture` · `testing-account-outlet.d.ts`
- `memoryAgentJournalEntriesFixture` · `testing-journal-entries.d.ts`
- `memoryReceivedCommitFixture` · `testing-received-memory.d.ts`
- `sampleAccountHandoff` · `testing-account-outlet.d.ts`
- `sampleReceivedModelAccount` · `testing-journal-samples.d.ts`
- `sampleReceivedModelResult` · `testing-journal-samples.d.ts`
- `sampleReceivedToolAccount` · `testing-journal-samples.d.ts`
- `sampleStartFence` · `testing-journal-samples.d.ts`
- `testCancellationPolicyInstallation` · `testing-cancellation.d.ts`

## 声明文件 `body-contract.d.ts`

```ts
import { type BodyContract } from '@omne-harness/assets';
export declare function agentBodyContract(): BodyContract;
```

## 声明文件 `check.d.ts`

```ts
import { type JsonLimits } from '@omne-harness/json-text';
import { type SchemaIssue, type SchemaProvider } from '@omne-harness/schema-provider';
import { z } from 'zod';
export declare const adoptionShape: z.ZodObject<{
    owner: z.ZodString;
    name: z.ZodString;
    revision: z.ZodString;
    digest: z.ZodString;
}, z.core.$strict>;
export type Checked<T> = {
    readonly kind: 'valid';
    readonly value: T;
} | {
    readonly kind: 'invalid';
    readonly issues: readonly [
        SchemaIssue,
        ...SchemaIssue[]
    ];
} | {
    readonly kind: 'local-refusal';
    readonly reason: 'executable' | 'malformed' | 'checker-failed';
};
type Plain = {
    readonly ok: true;
    readonly value: unknown;
} | {
    readonly ok: false;
    readonly reason: 'executable' | 'malformed';
    readonly index: number;
};
export declare function jsonTextWithinBudget(value: unknown, limits?: JsonLimits): boolean;
export declare function isRecord(value: unknown): value is Record<string, unknown>;
export declare function openCheckDomain(): SchemaProvider;
export declare function closeCheckDomain(provider: SchemaProvider): void;
export declare function copyPlain(value: unknown, limits?: JsonLimits): Plain;
export declare function checkJson<T>(id: string, schema: z.ZodType<T>, value: unknown, domain?: SchemaProvider): Promise<Checked<T>>;
export {};
```

## 声明文件 `definition.d.ts`

```ts
export declare const ATTRIBUTE_ITEMS: readonly [
    'first_token_wait_limit',
    'post_first_token_stall_limit',
    'model'
];
export type AttributeItem = (typeof ATTRIBUTE_ITEMS)[number];
export type CapabilityRef = {
    readonly category: string;
    readonly name: string;
};
export type AssetReference = {
    readonly capability: CapabilityRef;
    readonly resident?: boolean;
};
export type AttributeDeclaration = {
    readonly item: AttributeItem;
};
export type AgentDefinition = {
    readonly category: 'AgentDefinition';
    readonly name: string;
    readonly references: readonly AssetReference[];
    readonly attributes: readonly AttributeDeclaration[];
};
export declare function attributeItem(text: string | undefined): AttributeItem | undefined;
```

## 声明文件 `evaluation.d.ts`

```ts
import type { Outcome } from '@omne-harness/operation-result';
import type { Message, ToolPart } from '@omne-harness/message';
import type * as M from '@omne-harness/model-contract';
import type * as T from '@omne-harness/tool-contract';
import type { ControlRecord, ResultResponsibility } from './execution.ts';
import type { Adoption, ActionBatchId, ActionId, AgentInstant, AgentOperationId, CardRoundId, ConsumerRef, ConsumptionId, Continuation, DurableEvidence, InputBatchId, InputId, PassageId, StepId } from './identity.ts';
import type { JsonValue } from '@omne-harness/json-text';
import type { HandoffReference, MessageSource, Passage } from './passages.ts';
import type { CompactionProgress, CompactionState, Preparation } from './request.ts';
export type ProducedResult = Readonly<{
    producer: Readonly<{
        kind: 'model';
        call: M.ModelCallId;
    }> | Readonly<{
        kind: 'tool';
        call: T.ToolCallId;
    }>;
    version: string;
    delivery: string | null;
    source: DurableEvidence;
}>;
export type InputBatch = Readonly<{
    id: InputBatchId;
    watermark: DurableEvidence;
    ordered: readonly InputId[];
}>;
export type ProgressionDirective = Readonly<{
    kind: 'evaluate-completion';
    basis: DurableEvidence;
}> | Readonly<{
    kind: 'continue';
    basis: DurableEvidence;
}>;
export type Waiting = Readonly<{
    kind: 'producer';
    pending: PendingCall;
}> | Readonly<{
    kind: 'human';
    passage: PassageId;
    cards: readonly DurableEvidence[];
}> | Readonly<{
    kind: 'dependency';
    owner: string;
    position: string;
}>;
export type AgentConclusion = Readonly<{
    kind: 'complete';
}> | Readonly<{
    kind: 'fail' | 'cancelled';
    cause: DurableEvidence;
}>;
export type FailureCandidate = Readonly<{
    step: StepId | null;
    at: AgentInstant;
    source: DurableEvidence;
}> & (Readonly<{
    kind: 'cannot-fit';
    reason: 'fixed' | 'after-compaction';
    context: DurableEvidence;
    veto?: DurableEvidence;
    rejection?: DurableEvidence;
    plan?: CompactionProgress;
}> | Readonly<{
    kind: 'compaction-invalid';
    plan: DurableEvidence;
    progress?: Readonly<{
        expected: CompactionProgress;
        returned: CompactionProgress;
    }>;
    transition?: DurableEvidence;
}> | Readonly<{
    kind: 'request-rejected';
    failure: Extract<Failure, {
        kind: 'invalid';
    }>;
    model: DurableEvidence;
    selection: DurableEvidence;
}> | Readonly<{
    kind: 'no-reply';
    call: M.ModelCallId;
    result: ProducedResult;
}> | Readonly<{
    kind: 'message-rejected';
    from: MessageSource;
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'extension-stop';
    passage: PassageId;
    reason: string;
}> | Readonly<{
    kind: 'guard';
    level: 3;
    basis: DurableEvidence;
}>);
export type PreparedContextTransition = Readonly<{
    preparation: ActionId;
    message: Message;
    source: DurableEvidence;
    derivation: DurableEvidence;
    commitment: DurableEvidence;
    candidate: DurableEvidence;
    plan: DurableEvidence;
    basis: Readonly<{
        schema: Adoption;
        value: JsonValue;
    }>;
    epoch: string;
}>;
export type Failure = Readonly<{
    kind: 'denied';
    action: string;
}> | Readonly<{
    kind: 'invalid';
    field: string;
    reason: string;
}> | Readonly<{
    kind: 'unavailable';
    owner: string;
    diagnostic: string;
}> | Readonly<{
    kind: 'stale-advance' | 'not-ready' | 'terminal' | 'busy' | 'changed' | 'unsupported';
}> | Readonly<{
    kind: 'commit-unknown';
    operation: AgentOperationId;
}> | Readonly<{
    kind: 'conflict';
    operation: AgentOperationId;
}>;
export type Reply<A> = Promise<Outcome<A, Failure>>;
export type ModelPurpose = 'main' | 'compaction' | 'extension';
type PendingCommon = Readonly<{
    action: ActionId;
    consumption: ConsumptionId;
    position: ConsumerRef;
    fixed: DurableEvidence;
}>;
export type PendingCall = PendingCommon & (Readonly<{
    kind: 'model';
    reference: M.ModelInvocationRef;
    purpose: ModelPurpose;
}> | (Readonly<{
    kind: 'tool';
    purpose: 'action';
    call?: never;
    admission?: never;
}> & (Readonly<{
    association: 'intent';
    reference?: never;
}> | Readonly<{
    association: 'associated';
    reference: T.ToolInvocationRef;
}>)));
export type ActionJudgment = Readonly<{
    kind: 'pending';
    passage: PassageId;
}> | Readonly<{
    kind: 'waiting';
    passage: PassageId;
    cards: readonly DurableEvidence[];
}> | Readonly<{
    kind: 'denied';
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'allowed';
    evidence: DurableEvidence;
    request: T.ToolInvokeRequest;
}>;
export type Action = Readonly<{
    id: ActionId;
    original: ToolPart & Readonly<{
        kind: 'tool_call';
    }>;
    effectiveArguments: string;
    judgment: ActionJudgment;
    call: PendingCall | null;
}>;
export type ActionBarrier = Readonly<{
    kind: 'closed';
    judging: readonly ActionId[];
    asked: readonly Readonly<{
        action: ActionId;
        passage: PassageId;
        round: CardRoundId;
    }>[];
}> | Readonly<{
    kind: 'open';
    evidence: DurableEvidence;
    approved: readonly [
        ActionId,
        ...ActionId[]
    ];
}> | Readonly<{
    kind: 'all-denied';
    evidence: DurableEvidence;
}>;
export type ActionSlot = Readonly<{
    action: ActionId;
    each: readonly PassageId[] | null;
    candidate: Message | null;
    handoff: HandoffReference | null;
}> & (Readonly<{
    kind: 'denied';
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'dispatched';
}> | Readonly<{
    kind: 'result';
    result: ProducedResult;
    terminal: T.ToolTerminal;
    custody: DurableEvidence;
}> | Readonly<{
    kind: 'background';
    placeholder: ProducedResult;
    confirmation: DurableEvidence;
}>);
export type ActionBatch = Readonly<{
    id: ActionBatchId;
    source: ProducedResult;
    actions: readonly Action[];
    barrier: ActionBarrier;
    slots: readonly ActionSlot[];
    batchPass: readonly PassageId[] | null;
}>;
export type ModelReplyAdmission = Readonly<{
    step: StepId;
    action: ActionId;
    call: M.ModelCallId;
    resultVersion: string;
    decision: 'admitted' | 'rejected';
    source: DurableEvidence;
}>;
export type ReplyAdmissionProjection = Readonly<{
    through: DurableEvidence;
    rule: Adoption;
    lastAdmission: DurableEvidence | null;
    consecutiveDenials: string;
    totalDenials: string;
}>;
export type ReplyAdmissionPage = Readonly<{
    kind: 'page';
    through: DurableEvidence;
    items: readonly Readonly<{
        sequence: string;
        fact: ModelReplyAdmission;
    }>[];
    next: string | null;
    complete: boolean;
}> | Readonly<{
    kind: 'gap';
    recovery: DurableEvidence;
}>;
export type GuardLevel = 0 | 1 | 2 | 3;
export type GuardFact = Readonly<{
    level: GuardLevel;
    policy: Adoption;
    through: DurableEvidence;
    basis: DurableEvidence;
    passage: PassageId;
    at: AgentInstant;
}>;
export type AgentCheckpoint = Readonly<{
    schema: Adoption;
    definition: Adoption;
    step: StepId;
    position: string;
    calls: readonly PendingCall[];
    passages: readonly Passage[];
    batch: ActionBatch | null;
    inputBatch: InputBatchId | null;
    requestPreparation: Preparation | null;
    compaction: CompactionState | null;
    adoptedContext: DurableEvidence | null;
    guard: GuardFact | null;
    completedPassages: readonly PassageId[];
    priorConditions: DurableEvidence | null;
    currentHandoff: HandoffReference | null;
}>;
export type RuntimeConditions = Readonly<{
    source: DurableEvidence;
    configuration: Adoption;
    progression: ProgressionDirective;
    model: Adoption;
    context: DurableEvidence;
    bindings: readonly Adoption[];
}>;
export type ProducerDecisionView = Readonly<{
    kind: 'unresolved';
    pending: PendingCall;
    source: DurableEvidence;
}> | Readonly<{
    kind: 'model-active';
    pending: Extract<PendingCall, {
        kind: 'model';
    }>;
    source: DurableEvidence;
}> | Readonly<{
    kind: 'model-settled';
    pending: Extract<PendingCall, {
        kind: 'model';
    }>;
    result: ProducedResult;
    source: DurableEvidence;
}> | Readonly<{
    kind: 'tool-active';
    pending: Extract<PendingCall, {
        kind: 'tool';
        association: 'associated';
    }>;
    source: DurableEvidence;
    waiting: 'none' | 'external' | 'human';
    supportedControls: readonly ('interrupt' | 'background')[];
}> | Readonly<{
    kind: 'tool-result';
    pending: Extract<PendingCall, {
        kind: 'tool';
        association: 'associated';
    }>;
    result: ProducedResult;
    source: DurableEvidence;
}> | Readonly<{
    kind: 'tool-background';
    pending: Extract<PendingCall, {
        kind: 'tool';
        association: 'associated';
    }>;
    placeholder: ProducedResult;
    confirmation: DurableEvidence;
    source: DurableEvidence;
}>;
export type AdvancementFact = Readonly<{
    kind: 'current' | 'stopping' | 'ended' | 'superseded';
    source: DurableEvidence;
}>;
export type LoopFacts = Readonly<{
    advancement: AdvancementFact;
    checkpoint: AgentCheckpoint;
    conditions: RuntimeConditions;
    batch: InputBatch;
    inputs: readonly Message[];
    producers: readonly ProducerDecisionView[];
    consumption: readonly ResultResponsibility[];
    replyAdmissions: ReplyAdmissionProjection;
    controls: readonly ControlRecord[];
}>;
export type Next = Readonly<{
    kind: 'reconcile';
    calls: readonly PendingCall[];
}> | Readonly<{
    kind: 'take-inputs';
    position: string;
}> | Readonly<{
    kind: 'prepare-request';
    step: StepId;
    previous: Preparation | null;
}> | Readonly<{
    kind: 'compact-derive';
    original: Extract<Preparation, {
        kind: 'needs-compaction';
    }>;
    progress: CompactionProgress;
    result: Readonly<{
        produced: ProducedResult;
        consumed: DurableEvidence;
    }> | null;
}> | Readonly<{
    kind: 'commit-transition';
    value: PreparedContextTransition;
}> | Readonly<{
    kind: 'resume-request';
    original: Extract<Preparation, {
        kind: 'needs-compaction';
    }>;
    transition: DurableEvidence;
}> | Readonly<{
    kind: 'extension';
    passage: PassageId;
}> | Readonly<{
    kind: 'admit-model';
    preparation: Extract<Preparation, {
        kind: 'ready';
    }>;
}> | Readonly<{
    kind: 'admit-message';
    source: MessageSource;
    candidate: Message;
}> | Readonly<{
    kind: 'admit-tools';
    batch: ActionBatch;
}> | Readonly<{
    kind: 'consume';
    consumption: ConsumptionId;
    result: ProducedResult;
}> | Readonly<{
    kind: 'wait';
    waiting: readonly Waiting[];
}> | Readonly<{
    kind: 'try-finish';
    conclusion: AgentConclusion;
    failure: FailureCandidate | null;
}> | Readonly<{
    kind: 'stop';
    reason: 'cancelled' | 'terminal' | 'superseded' | 'suspended';
}>;
export interface AgentEvaluator {
    initial(input: Readonly<{
        definition: Adoption;
        step: StepId;
    }>): Outcome<AgentCheckpoint, Failure>;
    next(input: LoopFacts): Outcome<Next, Failure>;
    encode(value: AgentCheckpoint): Continuation;
    decode(value: Continuation): Outcome<AgentCheckpoint, Failure>;
}
export {};
```

## 声明文件 `execution.d.ts`

```ts
import type { Message } from '@omne-harness/message';
import type * as M from '@omne-harness/model-contract';
import type { Outcome } from '@omne-harness/operation-result';
import type * as T from '@omne-harness/tool-contract';
import type { AgentDefinition } from './definition.ts';
import type { AgentCheckpoint, AgentConclusion, AgentEvaluator, Failure, FailureCandidate, InputBatch, ProducedResult, Reply, ReplyAdmissionProjection, Waiting } from './evaluation.ts';
import type { LoopExtensionDeclaration } from './extensions.ts';
import type { Access, Adoption, AgentExecutionId, AgentInstanceId, AgentInstant, AgentOperationId, AgentRegistrationId, Authority, ConsumptionId, Continuation, DurableEvidence, ExecutionAttachmentId, ExecutionRevision, InputId, PassageId } from './identity.ts';
import type { ExecutionSettlement, FinishObligations } from './finishing.ts';
import type { EffectIntent, ExecutionHandoff } from './journal.ts';
import type { AgentJournalEntry } from './receiving.ts';
export type ExecutionState = Readonly<{
    kind: 'reconciling' | 'advancing';
}> | Readonly<{
    kind: 'waiting';
    waits: readonly Waiting[];
}> | Readonly<{
    kind: 'settling';
    intent: FinishIntent;
}> | Readonly<{
    kind: 'suspended';
    handoff: DurableEvidence;
}> | Readonly<{
    kind: 'ended';
    conclusion: AgentConclusion;
    disposition: DurableEvidence;
}>;
export type ExecutionSnapshot = Readonly<{
    execution: AgentExecutionId;
    revision: ExecutionRevision;
    state: ExecutionState;
    checkpoint: AgentCheckpoint;
    inputWatermark: DurableEvidence;
    history: DurableEvidence;
    replyAdmissions: ReplyAdmissionProjection;
    executionAttachment: Authority | null;
    unresolved: readonly AgentOperationId[];
    controls: readonly ControlRecord[];
    results: readonly ResultResponsibility[];
    effects: readonly EffectIntent[];
    terminalObservations: readonly TerminalObservation[];
    handoffs: readonly ExecutionHandoff[];
    finishObligations: FinishObligations | null;
    settlement: ExecutionSettlement;
    output: Readonly<{
        emittedThrough: string | null;
        acknowledgedThrough: string | null;
    }>;
    entries?: readonly AgentJournalEntry[];
}>;
export type AgentState = Readonly<{
    kind: 'idle';
    instance: AgentInstanceId;
}> | Readonly<{
    kind: 'occupied';
    instance: AgentInstanceId;
    execution: AgentExecutionId;
    executionAttachment: ExecutionAttachmentId;
}> | Readonly<{
    kind: 'draining';
    instance: AgentInstanceId;
    unresolved: readonly AgentExecutionId[];
}> | Readonly<{
    kind: 'disposed';
    instance: AgentInstanceId;
}>;
export type AcceptedInput = Readonly<{
    id: InputId;
    content: Message;
    source: DurableEvidence | null;
    priority: 'ordinary' | 'urgent';
}>;
export type TerminalObservation = Readonly<{
    terminal: DurableEvidence;
    passage: PassageId;
    implementation: Adoption;
    observed: DurableEvidence | null;
}>;
export type FinishIntent = Readonly<{
    candidate: AgentOperationId;
    conclusion: AgentConclusion;
    inputWatermark: DurableEvidence;
    obligations: DurableEvidence | null;
    beforeTerminal: DurableEvidence | null;
    failure: FailureCandidate | null;
}>;
export type FinishResult = Readonly<{
    kind: 'ended';
    receipt: CommandReceipt;
}> | Readonly<{
    kind: 'changed';
    revision: ExecutionRevision;
}> | Readonly<{
    kind: 'blocked';
    reason: 'inputs' | 'controls' | 'operations' | 'passages' | 'custody';
    source: DurableEvidence;
}>;
export type FinishAuthorization = Readonly<{
    kind: 'advancement';
    authority: Authority;
}> | Readonly<{
    kind: 'cancel';
    control: AgentOperationId;
    source: DurableEvidence;
}>;
export type ExecutionControl = Readonly<{
    kind: 'interrupt-model';
    call: M.ModelCallId;
    reason: DurableEvidence;
}> | Readonly<{
    kind: 'interrupt-tool' | 'background-tool';
    call: T.ToolCallId;
    reason: DurableEvidence;
}> | Readonly<{
    kind: 'cancel';
    reason: DurableEvidence;
}> | Readonly<{
    kind: 'suspend';
    reason: DurableEvidence;
}>;
export type ControlStage = 'accepted' | 'intent-established' | 'qualification-revoked' | 'producer-confirmed' | 'physically-stopped' | 'duty-released';
export type ControlStageFact = Readonly<{
    state: 'reached' | 'unresolved';
    source: DurableEvidence;
}>;
type ToolControl = Extract<ExecutionControl, {
    kind: 'interrupt-tool' | 'background-tool';
}>;
export type ControlRecord = Readonly<{
    operation: AgentOperationId;
    stages: Readonly<{
        accepted: ControlStageFact;
    } & Partial<Record<Exclude<ControlStage, 'accepted'>, ControlStageFact>>>;
}> & (Readonly<{
    command: ToolControl;
    toolInvocation: T.ToolInvocationRef;
    toolOperation: T.ToolOperationRef | null;
}> | Readonly<{
    command: Exclude<ExecutionControl, ToolControl>;
    toolInvocation?: never;
    toolOperation?: never;
}>);
export type ResultResponsibility = Readonly<{
    result: ProducedResult;
    consumption: ConsumptionId;
    custody: DurableEvidence | null;
    completion: DurableEvidence | null;
    release: Readonly<{
        kind: 'pending';
    }> | Readonly<{
        kind: 'confirmed';
        receipt: DurableEvidence;
    }>;
}>;
export type ExecutionMutation<P> = Access<P> & Readonly<{
    execution: AgentExecutionId;
    operation: AgentOperationId;
}>;
export type CommandReceipt = Readonly<{
    operation: AgentOperationId;
    execution: AgentExecutionId;
    revision: ExecutionRevision;
    evidence: DurableEvidence;
    state: 'accepted' | 'applied' | 'unresolved';
}>;
export type AgentEventBody = Readonly<{
    kind: 'input-taken';
    batch: InputBatch;
}> | Readonly<{
    kind: 'message';
    message: Message;
    source: DurableEvidence;
}> | Readonly<{
    kind: 'producer';
    result: ProducedResult;
    consumption: ConsumptionId;
}> | Readonly<{
    kind: 'entry';
    entry: AgentJournalEntry;
}> | Readonly<{
    kind: 'waiting';
    waits: readonly Waiting[];
}> | Readonly<{
    kind: 'control';
    operation: AgentOperationId;
    stage: ControlStage;
    state: 'reached' | 'unresolved';
    source: DurableEvidence;
}> | Readonly<{
    kind: 'ended';
    conclusion: AgentConclusion;
    disposition: DurableEvidence;
}>;
export type AgentEvent = Readonly<{
    execution: AgentExecutionId;
    sequence: string;
    executionAttachment: ExecutionAttachmentId;
    schema: Adoption;
    cause: DurableEvidence;
    body: AgentEventBody;
}>;
export type EventPage = Readonly<{
    kind: 'page';
    events: readonly AgentEvent[];
    next: string;
    caughtUp: boolean;
}> | Readonly<{
    kind: 'gap';
    retainedFrom: string;
    recovery: DurableEvidence;
}>;
export interface AgentExecutionInput<P> {
    submit(input: ExecutionMutation<P> & Readonly<{
        value: AcceptedInput;
    }>): Reply<CommandReceipt>;
}
export interface AgentExecutionControl<P> {
    control(input: ExecutionMutation<P> & Readonly<{
        command: ExecutionControl;
    }>): Reply<CommandReceipt>;
}
export interface AgentExecutionEvents<P> {
    read(input: Access<P> & Readonly<{
        execution: AgentExecutionId;
        after: string | null;
        limit: number;
    }>): Reply<EventPage>;
    events(input: Access<P> & Readonly<{
        execution: AgentExecutionId;
        after: string | null;
        signal: AbortSignal;
    }>): AsyncIterable<Outcome<EventPage, Failure>>;
    acknowledge(input: ExecutionMutation<P> & Readonly<{
        through: string;
        receipt: DurableEvidence | null;
    }>): Reply<CommandReceipt>;
}
export interface AgentExecutionHandle<P> {
    readonly execution: AgentExecutionId;
    readonly input: AgentExecutionInput<P>;
    readonly control: AgentExecutionControl<P>;
    readonly output: AgentExecutionEvents<P>;
}
export interface AgentRuntime<P> {
    readonly instance: AgentInstanceId;
    invoke(input: ExecutionMutation<P> & Readonly<{
        initial: AcceptedInput;
        grant: DurableEvidence | null;
    }>): Reply<AgentExecutionHandle<P>>;
    resume(input: ExecutionMutation<P> & Readonly<{
        recovery: DurableEvidence;
        grant: DurableEvidence | null;
    }>): Reply<AgentExecutionHandle<P>>;
}
export type AgentObservation = Readonly<{
    kind: 'state';
    value: AgentState;
}> | Readonly<{
    kind: 'ended';
    reason: 'closed' | 'denied' | 'retired' | 'unavailable';
}>;
export interface AgentHandle<P> {
    readonly instance: AgentInstanceId;
    observe(input: Access<P> & Readonly<{
        signal: AbortSignal;
    }>): AsyncIterable<AgentObservation>;
}
export interface AgentDirectory<P> {
    resolve(input: Access<P> & Readonly<{
        instance: AgentInstanceId;
    }>): Reply<AgentRuntime<P>>;
    connect(input: Access<P> & Readonly<{
        instance: AgentInstanceId;
    }>): Reply<Readonly<{
        kind: 'live';
        handle: AgentHandle<P>;
    }> | Readonly<{
        kind: 'no-live-route';
    }>>;
}
export interface AgentExecutionRecovery<P> {
    query(input: ExecutionMutation<P>): Reply<Readonly<{
        kind: 'committed';
        receipt: CommandReceipt;
    }> | Readonly<{
        kind: 'rejected';
        failure: Extract<Failure, {
            kind: 'conflict';
        }>;
        audit: DurableEvidence;
        revision: ExecutionRevision;
    }> | Readonly<{
        kind: 'excluded';
        evidence: DurableEvidence;
    }> | Readonly<{
        kind: 'unknown';
    }>>;
    load(input: Access<P> & Readonly<{
        execution: AgentExecutionId;
    }>): Reply<ExecutionSnapshot>;
    reconcile(input: ExecutionMutation<P>): Reply<Readonly<{
        remaining: readonly ConsumptionId[];
        evidence: DurableEvidence;
    }>>;
    detach(input: ExecutionMutation<P> & Readonly<{
        authority: Authority;
        reason: DurableEvidence;
    }>): Reply<DurableEvidence>;
}
export interface AgentAdoptions<P> {
    resolve(input: Access<P> & Readonly<{
        adoption: Adoption;
    }>): Reply<Readonly<{
        definition: AgentDefinition;
        evaluator: AgentEvaluator;
        extensions: readonly LoopExtensionDeclaration[];
    }>>;
    handover(input: Access<P> & Readonly<{
        from: Adoption;
        to: Adoption;
        snapshot: ExecutionSnapshot;
        original: Continuation;
    }>): Reply<Readonly<{
        continuation: Continuation;
        evidence: DurableEvidence;
    }>>;
}
export type RegistrationState = 'published' | 'withdrawing' | 'withdrawn';
export type Registration = Readonly<{
    registration: AgentRegistrationId;
    state: RegistrationState;
}>;
export interface AgentRegistrationHandle<P> {
    readonly instance: AgentInstanceId;
    report(input: Readonly<{
        state: AgentState;
    }>): void;
    withdraw(input: Access<P> & Readonly<{
        operation: AgentOperationId;
        reason: DurableEvidence;
    }>): Reply<Registration | null>;
}
export interface AgentInstanceHost<P> {
    reserve(input: Access<P> & Readonly<{
        operation: AgentOperationId;
        scope: DurableEvidence;
        definition: Adoption;
    }>): Reply<Readonly<{
        instance: AgentInstanceId;
        registration: AgentRegistrationHandle<P>;
    }>>;
    publish(input: Access<P> & Readonly<{
        operation: AgentOperationId;
        instance: AgentInstanceId;
        scope: DurableEvidence;
        state: AgentState;
    }>): Reply<Registration>;
    withdraw(input: Access<P> & Readonly<{
        operation: AgentOperationId;
        instance: AgentInstanceId;
        registration: AgentRegistrationId;
    }>): Reply<Registration>;
    readonly directory: AgentDirectory<P>;
}
export type QuiesceResult = Readonly<{
    kind: 'drained' | 'unresolved';
    remaining: readonly AgentExecutionId[];
    evidence: DurableEvidence;
}>;
export interface AgentRuntimeControl<P> {
    quiesce(input: Access<P> & Readonly<{
        operation: AgentOperationId;
        reason: DurableEvidence;
    }>): Reply<QuiesceResult>;
}
export type AgentAccessOperation = 'invoke' | 'resume' | 'submit' | 'control' | 'read' | 'events' | 'acknowledge' | 'takeover' | 'observe' | 'resolve' | 'connect' | 'reserve' | 'publish' | 'withdraw' | 'quiesce' | 'query' | 'load' | 'reconcile' | 'detach' | 'record-terminal-observation' | 'receive-result' | 'read-message-handoff' | 'record-message-handoff' | 'exclude-message-handoff' | 'settle' | 'migrate-cancellation';
export type AgentAccessTarget = Readonly<{
    kind: 'scope';
    scope: DurableEvidence;
    definition: Adoption;
}> | Readonly<{
    kind: 'instance';
    instance: AgentInstanceId;
}> | Readonly<{
    kind: 'execution';
    execution: AgentExecutionId;
}> | Readonly<{
    kind: 'input-entry';
    execution: AgentExecutionId;
    operation: AgentOperationId;
}>;
export type AgentAccessDecision = Readonly<{
    kind: 'allowed';
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'denied';
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
export interface AgentAccessCheck<P> {
    check(input: Readonly<{
        access: Access<P>;
        operation: AgentAccessOperation;
        target: AgentAccessTarget;
    }>): Promise<AgentAccessDecision>;
}
export interface AgentClock {
    now(): Reply<AgentInstant>;
    waitUntil(instant: AgentInstant, signal: AbortSignal): Reply<'elapsed' | 'cancelled'>;
}
export {};
```

## 声明文件 `extensions.d.ts`

```ts
import type { JsonValue } from '@omne-harness/json-text';
import type { Message } from '@omne-harness/message';
import type * as M from '@omne-harness/model-contract';
import type { ActionId, Adoption, AgentExecutionId, AgentInstant, CardRoundId, DurableEvidence, PassageId, UtcInstantText } from './identity.ts';
import type { CardAnswer, CardRemark, Subject } from './passages.ts';
export declare const POSITIONS: readonly [
    'execution_started',
    'before_compaction',
    'after_compaction',
    'before_model_call',
    'after_model_call',
    'before_action',
    'after_action',
    'before_terminal',
    'after_terminal'
];
export type Position = (typeof POSITIONS)[number];
export type Dimension = Readonly<{
    ending: 'complete_reply' | 'failure';
}> | Readonly<{
    scope: 'each' | 'batch';
}>;
export declare const POWERS: readonly [
    'observe',
    'rewrite',
    'veto'
];
export type Power = (typeof POWERS)[number];
export type ErrorPolicy = 'ignore' | 'record' | 'treat_as_veto';
export type UnavailabilityPolicy = 'skip' | 'veto';
export type ExtensionImplementationDeclaration = Readonly<{
    kind: 'builtin';
    builtinName: string;
}> | Readonly<{
    kind: 'command';
    host: 'claude_code' | 'codex';
    dialect: string;
    event: string;
    command: string;
    matcher?: string;
    timeout?: string;
}>;
export type NeedDeclaration = Readonly<{
    name: string;
    schema: Adoption;
    required: boolean;
}>;
export type LoopExtensionDeclaration = Readonly<{
    name: string;
    position: Position;
    dimension?: Dimension;
    power: Power;
    needs?: readonly [
        NeedDeclaration,
        ...NeedDeclaration[]
    ];
    implementation: ExtensionImplementationDeclaration;
    onError?: ErrorPolicy;
    unavailability?: UnavailabilityPolicy;
}>;
export type ExtensionInput = Readonly<{
    position: Position;
    dimension?: Dimension;
    subject: Subject;
    earlier: readonly Conclusion[];
    execution: AgentExecutionId;
    passage: PassageId;
}>;
export type ExtensionOutput = Readonly<{
    kind: 'observed';
}> | Readonly<{
    kind: 'inject';
    message: Message & Readonly<{
        role: 'system_reminder';
    }>;
}> | Readonly<{
    kind: 'rewrite';
    subject: Subject;
}> | Readonly<{
    kind: 'select_model';
    route: string;
    reason?: string;
}> | Readonly<{
    kind: 'veto';
    reason: string;
}> | Readonly<{
    kind: 'stop';
    terminal?: 'cancelled' | 'failed';
    reason: string;
}> | Readonly<{
    kind: 'retry';
    plan: Readonly<{
        supplier: M.Supplier;
        notBefore: UtcInstantText | null;
        basis: Adoption;
    }>;
}> | Readonly<{
    kind: 'ask';
    card: DecisionCardDraft;
}>;
export type DecisionCardDraft = Readonly<{
    explanation: string;
    options: readonly [
        CardOption,
        ...CardOption[]
    ];
    about: Readonly<{
        position: Position;
        action?: ActionId;
    }>;
    proposedRewrite?: Readonly<{
        option: CardOption['id'];
        effectiveArguments: string;
    }>;
}>;
export type CardOption = Readonly<{
    id: string;
    label: string;
    effect?: JsonValue;
}>;
export type ActionIdentity = Readonly<{
    position: 'before_action';
    action: ActionId;
    call?: never;
}> | Readonly<{
    position: 'after_action';
    dimension: Readonly<{
        scope: 'each';
    }>;
    action: ActionId;
    call?: never;
}> | Readonly<{
    position: 'after_action';
    dimension: Readonly<{
        scope: 'batch';
    }>;
    action?: never;
    call?: never;
}> | Readonly<{
    position: 'after_model_call';
    dimension: Readonly<{
        ending: 'complete_reply';
    }>;
    action?: never;
    call?: never;
}> | Readonly<{
    position: 'after_model_call';
    dimension: Readonly<{
        ending: 'failure';
    }>;
    action?: never;
    call: M.ModelCallId;
}> | Readonly<{
    position: Exclude<Position, 'before_action' | 'after_action' | 'after_model_call'>;
    action?: never;
    call?: never;
}>;
export type Conclusion = ActionIdentity & Readonly<{
    passage: PassageId;
    extension: string;
    implementation: Adoption;
    power: Power;
    at: AgentInstant;
}> & (Readonly<{
    output: ExtensionOutput;
    skipped?: never;
    error?: never;
    unavailability?: never;
}> | Readonly<{
    skipped: 'unavailable';
    unavailability: UnavailabilityPolicy | 'fallback';
    output?: never;
    error?: never;
}> | Readonly<{
    skipped: 'errored';
    error: string;
    output: Extract<ExtensionOutput, {
        kind: 'observed' | 'veto';
    }>;
    unavailability?: never;
}>);
export type ExtensionInvocationMode = Readonly<{
    kind: 'fresh';
}> | Readonly<{
    kind: 'replay';
    binding: ExtensionReplayBinding;
}>;
export type ExtensionReplayBinding = Readonly<{
    passage: PassageId;
    rounds: readonly Readonly<{
        round: CardRoundId;
        cards: readonly Readonly<{
            identity: string;
            card: DurableEvidence;
            response: Readonly<{
                evidence: DurableEvidence;
                answer: CardAnswer | CardRemark;
            }> | null;
        }>[];
    }>[];
    control: 'valid' | 'replayInconsistent' | 'unavailable';
}>;
export type InvocationUnresolved = Readonly<{
    kind: 'invocationUnresolved';
    start: Readonly<{
        kind: 'unknown';
    }> | Readonly<{
        kind: 'started';
        evidence: DurableEvidence;
    }>;
    recovery: DurableEvidence;
}>;
export type ExtensionInvocationResult = Readonly<{
    kind: 'output';
    value: unknown;
}> | Readonly<{
    kind: 'errored';
    error: string;
    classification?: 'ordinary' | 'nonzero_exit' | 'timeout' | 'bad_output';
}> | Readonly<{
    kind: 'notStartedUnavailable';
}> | Readonly<{
    kind: 'replayInconsistent';
}> | Readonly<{
    kind: 'controlUnavailable';
}> | InvocationUnresolved;
export interface LoopExtensionImplementation {
    readonly implementation: Adoption;
    invoke(input: ExtensionInput, signal: AbortSignal, mode: ExtensionInvocationMode): Promise<ExtensionInvocationResult>;
}
```

## 声明文件 `finishing.d.ts`

```ts
import type * as T from '@omne-harness/tool-contract';
import type { AcceptedInput, AgentAccessOperation, ControlRecord, ExecutionMutation, CommandReceipt, FinishAuthorization, ResultResponsibility, TerminalObservation } from './execution.ts';
import type { AgentCheckpoint, AgentConclusion, FailureCandidate, PendingCall } from './evaluation.ts';
import type { ExtensionInvocationMode, ExtensionInvocationResult } from './extensions.ts';
import type { Access, ActionId, Adoption, AgentExecutionId, AgentOperationId, CardRoundId, ConsumerRef, ConsumptionId, DurableEvidence, ExecutionRevision, InputBatchId, InputId, PassageId } from './identity.ts';
import type { ExecutionHandoff, HandoffCustody } from './journal.ts';
import type { CardRound, HandoffLookup, HandoffReference, HandoffResolution, Passage, PendingHandoff } from './passages.ts';
import type { ProducedResult } from './evaluation.ts';
export type FinishCandidateContent = Readonly<{
    origin: DurableEvidence;
    conclusion: AgentConclusion;
    failure: FailureCandidate | null;
    inputWatermark: DurableEvidence;
    conditions: DurableEvidence;
}>;
export type FinishCandidate = Readonly<{
    candidate: AgentOperationId;
    origin: DurableEvidence;
    conclusion: AgentConclusion;
    failure: FailureCandidate | null;
    inputWatermark: DurableEvidence;
    checkpoint: AgentCheckpoint;
    conditions: DurableEvidence;
}>;
export type LegacyF2Entry = Readonly<{
    kind: 'not-started';
    ordinal: number;
    declaration: DurableEvidence;
    implementation: Adoption;
    passage: PassageId | null;
    exclusion: DurableEvidence;
}> | Readonly<{
    kind: 'recorded';
    passage: Passage;
    version: DurableEvidence;
}>;
export type FinishRoute = Readonly<{
    kind: 'author';
    record: DurableEvidence;
    candidate: AgentOperationId;
    policy: Adoption;
    plan: readonly LegacyF2Entry[];
    beforeTerminal: DurableEvidence | null;
}> | Readonly<{
    kind: 'cancellation';
    record: DurableEvidence;
    candidate: AgentOperationId;
    control: AgentOperationId;
    policy: Adoption;
    installation: DurableEvidence;
    origin: Readonly<{
        kind: 'native';
        operation: AgentOperationId;
    }> | Readonly<{
        kind: 'migration';
        operation: AgentOperationId;
    }>;
}>;
export type CandidateSupersession = Readonly<{
    from: AgentOperationId;
    to: AgentOperationId;
    control: AgentOperationId | null;
    revision: ExecutionRevision;
    route: FinishRoute;
}>;
export type PendingReason = 'input-disposition' | 'cancel-intent' | 'qualification-revocation' | 'operation-resolution' | 'call-custody' | 'required-judgment' | 'passage-custody' | 'card-custody' | 'result-custody' | 'material-custody' | 'output-custody' | 'observation-custody' | 'handoff-history';
export type RecoveryAction = 'original-operation-query' | 'original-invoke-recovery' | 'tool-association-retain' | 'producer-query' | 'producer-receive' | 'producer-release' | 'card-lookup' | 'card-read' | 'card-invalidate' | 'material-read' | 'input-read' | 'output-read-ack' | 'terminal-observe' | 'restore-source' | 'handoff-lookup' | 'handoff-exclude' | 'handoff-record' | 'handoff-source-recovery';
export type ContinuationRequest<Parameters> = Readonly<{
    kind: 'parameters';
    value: Parameters;
}> | Readonly<{
    kind: 'record';
    schema: Adoption;
    record: DurableEvidence;
}> | Readonly<{
    kind: 'unresolved';
    key: string;
    missing: DurableEvidence;
}>;
type ContinuationHead<K extends RecoveryAction, Parameters, Purpose extends AgentAccessOperation = AgentAccessOperation> = Readonly<{
    kind: K;
    request: ContinuationRequest<Parameters>;
    owner: string;
    custodian: ConsumerRef | null;
    purpose: Purpose;
}>;
export type HandoffRecordMaterial = Readonly<{
    kind: 'source-bound-request';
}> | Readonly<{
    kind: 'observed-operation';
    originalCall: DurableEvidence;
}>;
export type RecoveryContinuation = ContinuationHead<'original-operation-query', Readonly<{
    execution: AgentExecutionId;
    operation: AgentOperationId;
}>, 'query'> | ContinuationHead<'original-invoke-recovery', Readonly<{
    intent: ToolIntentKey;
    fixed: DurableEvidence;
}>> | ContinuationHead<'tool-association-retain', Readonly<{
    intent: ToolIntentKey;
    request: DurableEvidence;
    source: DurableEvidence;
    priorExcluded: ExcludedPredecessor | null;
}>, 'reconcile'> | ContinuationHead<'producer-query', Readonly<{
    pending: PendingCall;
}>> | ContinuationHead<'producer-receive', Readonly<{
    result: ProducedResult;
    consumption: ConsumptionId;
}>> | ContinuationHead<'producer-release', Readonly<{
    result: ProducedResult;
    consumption: ConsumptionId;
}>> | ContinuationHead<'card-lookup', Readonly<{
    passage: PassageId;
    round: CardRoundId;
}>> | ContinuationHead<'card-read', Readonly<{
    passage: PassageId;
    round: CardRoundId;
}>> | ContinuationHead<'card-invalidate', Readonly<{
    passage: PassageId;
    round: CardRoundId;
    reason: DurableEvidence;
}>> | ContinuationHead<'material-read', Readonly<{
    identity: string;
    consumer: ConsumerRef;
}>> | ContinuationHead<'input-read', Readonly<{
    input: InputId;
}>> | ContinuationHead<'output-read-ack', Readonly<{
    after: string | null;
    through: string | null;
}>> | ContinuationHead<'terminal-observe', Readonly<{
    passage: PassageId;
    terminal: DurableEvidence;
    implementation: Adoption;
}>, 'record-terminal-observation'> | ContinuationHead<'restore-source', Readonly<{
    source: DurableEvidence;
}>> | ContinuationHead<'handoff-lookup', Readonly<{
    lookup: HandoffLookup;
    provider: Adoption;
}>, 'read-message-handoff'> | ContinuationHead<'handoff-exclude', Readonly<{
    request: PendingHandoff;
    prepared: DurableEvidence;
    control: AgentOperationId;
}>, 'exclude-message-handoff'> | ContinuationHead<'handoff-record', Readonly<{
    operation: AgentOperationId;
    handoff: HandoffReference;
    original: Extract<HandoffResolution, {
        kind: 'recorded' | 'excluded';
    }>;
    provider: Adoption;
    material: HandoffRecordMaterial;
    custody: HandoffCustody | null;
}>, 'record-message-handoff'> | ContinuationHead<'handoff-source-recovery', Readonly<{
    handoff: Extract<HandoffReference, {
        kind: 'execution';
    }>;
    prepare: AgentOperationId;
    apply: AgentOperationId | null;
    request: PendingHandoff;
    material: DurableEvidence | null;
}>, 'query'>;
export type CancellationUnknown = Readonly<{
    owner: string;
    key: string;
    position: DurableEvidence;
    reason: 'original-operation-unknown' | 'source-unavailable' | 'source-not-authenticated' | 'coverage-incomplete' | 'policy-unavailable' | 'qualification-unavailable';
}>;
export type ObligationDisposition = Readonly<{
    kind: 'settled';
    completion: DurableEvidence;
}> | Readonly<{
    kind: 'held';
    custodian: ConsumerRef;
    acceptance: DurableEvidence;
    retained: DurableEvidence;
    continuation: RecoveryContinuation;
}> | Readonly<{
    kind: 'pending';
    reason: PendingReason;
    required: RecoveryContinuation;
}> | Readonly<{
    kind: 'unknown';
    question: CancellationUnknown;
    required: RecoveryContinuation;
}>;
export type ObligationCategory = 'inputs' | 'controls' | 'operations' | 'passages' | 'custody';
type ObligationHead<K extends string> = Readonly<{
    kind: K;
    key: string;
    source: DurableEvidence;
    version: DurableEvidence;
    position: ConsumerRef | null;
    disposition: ObligationDisposition;
}>;
export type FinishObligation = (ObligationHead<'accepted-input'> & Readonly<{
    input: InputId;
    value: AcceptedInput;
    acceptance: AgentOperationId;
    origin: DurableEvidence;
    taken: InputBatchId | null;
}>) | (ObligationHead<'control'> & Readonly<{
    control: AgentOperationId;
}>) | (ObligationHead<'operation'> & Readonly<{
    operation: AgentOperationId;
    method: string;
    request: DurableEvidence;
    resolution: 'committed' | 'rejected' | 'excluded' | 'unknown';
    result: DurableEvidence | null;
}>) | (ObligationHead<'handoff'> & Readonly<{
    handoff: HandoffReference;
    record: ExecutionHandoff;
}>) | (ObligationHead<'call'> & Readonly<{
    action: ActionId;
    intent: AgentOperationId;
    pending: PendingCall;
    started: DurableEvidence | null;
    outcome: DurableEvidence | null;
    interruptions: readonly AgentOperationId[];
    custodian: ConsumerRef | null;
}>) | (ObligationHead<'passage'> & Readonly<{
    passage: Passage;
    candidate: AgentOperationId;
    route: DurableEvidence;
    implementation: Adoption;
    superseded: boolean;
}>) | (ObligationHead<'card-round'> & Readonly<{
    passage: PassageId;
    round: CardRound;
    present: DurableEvidence | null;
    lookups: readonly AgentOperationId[];
    invalidate: Readonly<{
        operation: AgentOperationId;
        reason: DurableEvidence;
    }> | null;
}>) | (ObligationHead<'result'> & Readonly<{
    responsibility: ResultResponsibility;
    material: DurableEvidence | null;
}>) | (ObligationHead<'material'> & Readonly<{
    identity: string;
    consumer: ConsumerRef;
    schema: Adoption;
    resultVersion: DurableEvidence;
    material: DurableEvidence;
    custodian: ConsumerRef | null;
    acceptance: DurableEvidence | null;
}>) | (ObligationHead<'output'> & Readonly<{
    emittedThrough: string | null;
    acknowledgedThrough: string | null;
    retention: DurableEvidence;
}>) | (ObligationHead<'terminal-observation'> & Readonly<{
    observation: TerminalObservation;
    terminal: DurableEvidence | null;
}>);
export declare function obligationCategoryOf(kind: FinishObligation['kind']): ObligationCategory;
export type CoverageFacet = Readonly<{
    owner: string;
    version: DurableEvidence;
    read: DurableEvidence;
}>;
export type ResponsibilityCoverage = Readonly<{
    readRevision: ExecutionRevision;
    inputWatermark: DurableEvidence;
    operations: CoverageFacet;
    candidates: CoverageFacet;
    passages: CoverageFacet;
    results: CoverageFacet;
    materials: CoverageFacet;
    output: CoverageFacet;
    controls: CoverageFacet;
    observations: CoverageFacet;
    handoffs: CoverageFacet;
}>;
export type TerminalParticipantFact = Readonly<{
    owner: string;
    protocol: Adoption;
    source: DurableEvidence;
    version: DurableEvidence;
    condition: Readonly<{
        kind: 'ready' | 'changed' | 'unknown';
    }> | Readonly<{
        kind: 'blocked';
        category: ObligationCategory;
        source: DurableEvidence;
    }>;
    purpose: DurableEvidence;
}>;
export type TerminalParticipantFacts = Readonly<{
    kind: 'standalone';
    basis: DurableEvidence;
}> | Readonly<{
    kind: 'coordinated';
    association: DurableEvidence;
    participants: readonly TerminalParticipantFact[];
}>;
export type FinishObligations = Readonly<{
    operation: AgentOperationId;
    revision: ExecutionRevision;
    evidence: DurableEvidence;
    candidate: AgentOperationId;
    conclusion: AgentConclusion;
    failure: FailureCandidate | null;
    inputWatermark: DurableEvidence;
    checkpoint: DurableEvidence;
    conditions: DurableEvidence;
    items: readonly FinishObligation[];
    coverage: ResponsibilityCoverage;
}>;
export type CancellationPolicyInstallation = Readonly<{
    record: DurableEvidence;
    decision: DurableEvidence;
    policy: Adoption;
    inputSchema: Adoption;
    implementation: Adoption;
    legacyProtocols: readonly Readonly<{
        protocol: Adoption;
        checkpointSchema: Adoption;
        recognition: DurableEvidence;
    }>[];
    admission: DurableEvidence;
}>;
export type CancellationJudgmentInput = Readonly<{
    tenant: Access<unknown>['tenant'];
    execution: AgentExecutionId;
    candidate: FinishCandidate;
    control: ControlRecord;
    route: Extract<FinishRoute, {
        kind: 'cancellation';
    }>;
    readRevision: ExecutionRevision;
    coverage: ResponsibilityCoverage;
    items: readonly FinishObligation[];
    participants: TerminalParticipantFacts;
}>;
export type CancellationBlock = Readonly<{
    category: ObligationCategory;
    key: string;
    reason: PendingReason;
    source: DurableEvidence;
    required: RecoveryContinuation;
}>;
export type CancellationDecision = Readonly<{
    kind: 'allowed';
    basis: readonly DurableEvidence[];
}> | Readonly<{
    kind: 'blocked';
    reasons: readonly [
        CancellationBlock,
        ...CancellationBlock[]
    ];
}> | Readonly<{
    kind: 'unknown';
    questions: readonly [
        CancellationUnknown,
        ...CancellationUnknown[]
    ];
    knownBlocked: readonly CancellationBlock[];
}>;
export interface CancellationPolicy {
    readonly policy: Adoption;
    readonly implementation: Adoption;
    judge(input: CancellationJudgmentInput): CancellationDecision;
}
export type CancellationJudgmentRecord = Readonly<{
    operation: AgentOperationId;
    receipt: CommandReceipt;
    evidence: DurableEvidence;
    policy: Adoption;
    implementation: Adoption;
    inputSchema: Adoption;
    installation: DurableEvidence;
    qualification: DurableEvidence;
    candidate: AgentOperationId;
    control: AgentOperationId;
    route: DurableEvidence;
    input: CancellationJudgmentInput;
    decision: CancellationDecision;
    revision: ExecutionRevision;
    supersedes: AgentOperationId | null;
}>;
export type ExcludedPredecessor = Readonly<{
    operation: AgentOperationId;
    request: DurableEvidence;
    exclusion: DurableEvidence;
    chain: readonly AgentOperationId[];
}>;
export type MigrationRecord = Readonly<{
    operation: AgentOperationId;
    receipt: CommandReceipt;
    evidence: DurableEvidence;
    candidate: AgentOperationId;
    control: AgentOperationId;
    from: Readonly<{
        route: Extract<FinishRoute, {
            kind: 'author';
        }>;
        policy: Adoption;
        definition: Adoption;
        schema: Adoption;
        beforeTerminal: DurableEvidence | null;
        extensions: readonly Adoption[];
    }>;
    progress: readonly LegacyF2Entry[];
    to: Readonly<{
        policy: Adoption;
        implementation: Adoption;
        inputSchema: Adoption;
        installation: DurableEvidence;
        admission: DurableEvidence;
    }>;
    qualification: Readonly<{
        attribution: DurableEvidence;
        target: AgentExecutionId;
        issuer: DurableEvidence;
        check: DurableEvidence;
    }>;
    fence: DurableEvidence;
    coverage: ResponsibilityCoverage;
    obligations: readonly FinishObligation[];
    supersession: Readonly<{
        from: DurableEvidence;
        to: DurableEvidence;
        candidate: CandidateSupersession | null;
    }>;
    priorExcluded: ExcludedPredecessor | null;
}>;
export type LegacyInvocationReturn = Readonly<{
    operation: AgentOperationId;
    receipt: CommandReceipt;
    passage: PassageId;
    candidate: AgentOperationId;
    route: DurableEvidence;
    input: DurableEvidence;
    mode: ExtensionInvocationMode;
    implementation: Adoption;
    source: DurableEvidence;
    result: ExtensionInvocationResult;
    received: DurableEvidence;
    custody: DurableEvidence;
    revision: ExecutionRevision;
}>;
export type ToolIntentKey = Readonly<{
    intent: AgentOperationId;
    action: ActionId;
    position: ConsumerRef;
}>;
export type ToolAssociationRecord = Readonly<{
    operation: AgentOperationId;
    receipt: CommandReceipt;
    intent: ToolIntentKey;
    request: DurableEvidence;
    source: DurableEvidence;
    association: Readonly<{
        kind: 'no-proven-reference';
    }> | Readonly<{
        kind: 'commit-unknown';
        reference: T.ToolInvocationRef;
    }> | Readonly<{
        kind: 'accepted';
        reference: T.ToolInvocationRef;
        receipt: DurableEvidence;
    }>;
    obligation: FinishObligation;
    priorExcluded: ExcludedPredecessor | null;
    revision: ExecutionRevision;
}>;
export type CardReconciliationRecord = Readonly<{
    operation: AgentOperationId;
    receipt: CommandReceipt;
    passage: PassageId;
    round: CardRoundId;
    candidate: AgentOperationId;
    route: DurableEvidence;
    original: DurableEvidence;
    obligation: Extract<FinishObligation, {
        kind: 'card-round';
    }>;
    revision: ExecutionRevision;
}>;
export type ExecutionSettlement = Readonly<{
    candidate: FinishCandidate | null;
    route: FinishRoute | null;
    currentJudgment: AgentOperationId | null;
    candidates: readonly FinishCandidate[];
    routes: readonly FinishRoute[];
    supersessions: readonly CandidateSupersession[];
    migrations: readonly MigrationRecord[];
    judgments: readonly CancellationJudgmentRecord[];
    cardReconciliations: readonly CardReconciliationRecord[];
    legacyReturns: readonly LegacyInvocationReturn[];
    toolAssociations: readonly ToolAssociationRecord[];
}>;
type CancelAuthorization = Extract<FinishAuthorization, {
    kind: 'cancel';
}>;
export type SettlementRequest<P> = ExecutionMutation<P> & (Readonly<{
    kind: 'establish-cancellation';
    authorization: CancelAuthorization;
    expected: ExecutionRevision;
    installation: DurableEvidence;
    predecessor: AgentOperationId | null;
}> | Readonly<{
    kind: 'migrate-cancellation';
    authorization: CancelAuthorization;
    expected: ExecutionRevision;
    candidate: AgentOperationId;
    originalRoute: DurableEvidence;
    installation: DurableEvidence;
    priorExcluded: ExcludedPredecessor | null;
}> | Readonly<{
    kind: 'judge-cancellation';
    authorization: CancelAuthorization;
    expected: ExecutionRevision;
    candidate: AgentOperationId;
    route: DurableEvidence;
    installation: DurableEvidence;
}> | Readonly<{
    kind: 'record-card-reconciliation';
    passage: PassageId;
    round: CardRoundId;
    candidate: AgentOperationId;
    route: DurableEvidence;
    original: DurableEvidence;
}> | Readonly<{
    kind: 'record-legacy-return';
    passage: PassageId;
    candidate: AgentOperationId;
    route: DurableEvidence;
    request: DurableEvidence;
    source: DurableEvidence;
}> | Readonly<{
    kind: 'record-tool-association';
    intent: ToolIntentKey;
    request: DurableEvidence;
    source: DurableEvidence;
    priorExcluded: ExcludedPredecessor | null;
}>);
export type SettlementResult = Readonly<{
    kind: 'establish-cancellation';
    receipt: CommandReceipt;
    candidate: FinishCandidate;
    route: Extract<FinishRoute, {
        kind: 'cancellation';
    }>;
    supersession: CandidateSupersession | null;
}> | Readonly<{
    kind: 'migrate-cancellation';
    receipt: CommandReceipt;
    migration: MigrationRecord;
    route: Extract<FinishRoute, {
        kind: 'cancellation';
    }>;
}> | Readonly<{
    kind: 'judge-cancellation';
    receipt: CommandReceipt;
    judgment: CancellationJudgmentRecord;
}> | Readonly<{
    kind: 'record-card-reconciliation';
    receipt: CommandReceipt;
    reconciliation: CardReconciliationRecord;
}> | Readonly<{
    kind: 'record-legacy-return';
    receipt: CommandReceipt;
    legacyReturn: LegacyInvocationReturn;
}> | Readonly<{
    kind: 'record-tool-association';
    receipt: CommandReceipt;
    association: ToolAssociationRecord;
}>;
export {};
```

## 声明文件 `identity.d.ts`

```ts
import { type Access } from '@omne-harness/legal-identity';
import type { Adoption, DurableEvidence } from '@omne-harness/exchange-refs';
import type { JsonValue } from '@omne-harness/json-text';
import { type Outcome } from '@omne-harness/operation-result';
declare const agentIdentity: unique symbol;
export type AgentIdentity<K extends string> = string & {
    readonly [agentIdentity]: K;
};
export type AgentInstanceId = AgentIdentity<'AgentInstanceId'>;
export type StepId = AgentIdentity<'AgentStepId'>;
export type ActionId = AgentIdentity<'AgentActionId'>;
export type PassageId = AgentIdentity<'AgentPassageId'>;
export type CardRoundId = AgentIdentity<'AgentCardRoundId'>;
export type ActionBatchId = AgentIdentity<'AgentActionBatchId'>;
export type AgentExecutionId = AgentIdentity<'AgentExecutionId'>;
export type ExecutionAttachmentId = AgentIdentity<'ExecutionAttachmentId'>;
export type AgentRegistrationId = AgentIdentity<'AgentRegistrationId'>;
export type AgentOperationId = AgentIdentity<'AgentOperationId'>;
export type ExecutionRevision = AgentIdentity<'ExecutionRevision'>;
export type InputId = AgentIdentity<'AgentInputId'>;
export type InputBatchId = AgentIdentity<'AgentInputBatchId'>;
export type ConsumptionId = AgentIdentity<'AgentConsumptionId'>;
export type { Adoption, ConsumerRef, DurableEvidence } from '@omne-harness/exchange-refs';
export type { Access } from '@omne-harness/legal-identity';
export type Authority = Readonly<{
    execution: AgentExecutionId;
    executionAttachment: ExecutionAttachmentId;
    instance: AgentInstanceId;
    generation: string;
    source: DurableEvidence;
}>;
export type Continuation = Readonly<{
    position: string;
    definition: Adoption;
    schema: Adoption;
    value: JsonValue;
}>;
export type AgentInstant = string;
declare const utcInstantText: unique symbol;
export type UtcInstantText = string & {
    readonly [utcInstantText]: 'UtcInstantText';
};
export type IdentityFailure<K extends string = string> = Readonly<{
    field: K;
    reason: 'type' | 'empty' | 'length' | 'character';
}>;
export type StructureFailure = Readonly<{
    field: string;
    reason: 'type' | 'empty' | 'unknown-field' | 'missing' | 'identity';
}>;
export declare const AGENT_IDENTITY_MAX_LENGTH = 256;
type IdentityDecoder<T extends AgentIdentity<string>, N extends string> = (value: unknown) => Outcome<T, IdentityFailure<N>>;
export declare const decodeAgentInstanceId: IdentityDecoder<AgentInstanceId, "AgentInstanceId">;
export declare const decodeStepId: IdentityDecoder<StepId, "StepId">;
export declare const decodeActionId: IdentityDecoder<ActionId, "ActionId">;
export declare const decodePassageId: IdentityDecoder<PassageId, "PassageId">;
export declare const decodeCardRoundId: IdentityDecoder<CardRoundId, "CardRoundId">;
export declare const decodeActionBatchId: IdentityDecoder<ActionBatchId, "ActionBatchId">;
export declare const decodeAgentExecutionId: IdentityDecoder<AgentExecutionId, "AgentExecutionId">;
export declare const decodeExecutionAttachmentId: IdentityDecoder<ExecutionAttachmentId, "ExecutionAttachmentId">;
export declare const decodeAgentRegistrationId: IdentityDecoder<AgentRegistrationId, "AgentRegistrationId">;
export declare const decodeAgentOperationId: IdentityDecoder<AgentOperationId, "AgentOperationId">;
export declare const decodeExecutionRevision: IdentityDecoder<ExecutionRevision, "ExecutionRevision">;
export declare const decodeInputId: IdentityDecoder<InputId, "InputId">;
export declare const decodeInputBatchId: IdentityDecoder<InputBatchId, "InputBatchId">;
export declare const decodeConsumptionId: IdentityDecoder<ConsumptionId, "ConsumptionId">;
export declare function judgeAdoption(value: unknown): Outcome<Adoption, StructureFailure>;
export declare function judgeEvidence(value: unknown): Outcome<DurableEvidence, StructureFailure>;
export declare function judgeAccess<P>(value: unknown, judgePrincipal: (value: unknown) => Outcome<P, StructureFailure>): Outcome<Access<P>, StructureFailure>;
export declare function judgeAuthority(value: unknown): Outcome<Authority, StructureFailure>;
```

## 声明文件 `index.d.ts`

```ts
export { agentBodyContract } from './body-contract.ts';
export { obligationCategoryOf } from './finishing.ts';
export { ATTRIBUTE_ITEMS } from './definition.ts';
export { POSITIONS, POWERS } from './extensions.ts';
export { judgeAgentDefinition } from './judge-definition.ts';
export { judgeLoopExtensions } from './judge-extensions.ts';
export { judgeHandoffPrepare, judgeInputOrigin } from './judge-handoff.ts';
export { judgeExtensionOutput, POSITION_OUTPUTS } from './judge-output.ts';
export type { ExtensionOutputJudgeInput, PositionOutputKey, PositionOutputs, } from './judge-output.ts';
export type { AgentDefinition, AssetReference, AttributeDeclaration, AttributeItem, CapabilityRef, } from './definition.ts';
export { AGENT_IDENTITY_MAX_LENGTH, decodeActionBatchId, decodeActionId, decodeAgentExecutionId, decodeAgentInstanceId, decodeAgentOperationId, decodeAgentRegistrationId, decodeCardRoundId, decodeConsumptionId, decodeExecutionAttachmentId, decodeExecutionRevision, decodeInputBatchId, decodeInputId, decodePassageId, decodeStepId, judgeAccess, judgeAdoption, judgeAuthority, judgeEvidence, } from './identity.ts';
export type * from './evaluation.ts';
export type * from './execution.ts';
export type * from './extensions.ts';
export type * from './finishing.ts';
export type * from './identity.ts';
export type * from './journal.ts';
export type * from './passages.ts';
export type * from './receiving.ts';
export type * from './request.ts';
export type { BatchJudgment, Judgment, OutputRefusalReason, RefusalReason } from './judgment.ts';
```

## 声明文件 `journal.d.ts`

```ts
import type { ToolOperationRef } from '@omne-harness/tool-contract';
import type { Message } from '@omne-harness/message';
import type { AgentCheckpoint, InputBatch, ModelReplyAdmission, PendingCall, PreparedContextTransition, ProducedResult, Reply, ReplyAdmissionPage } from './evaluation.ts';
import type { HandoffOutcome, HandoffReference, HandoffRequest, HandoffResolution, InputEntry, InvokeRuntimeContext, PendingHandoff } from './passages.ts';
import type { AgentEventBody, AgentExecutionControl, AgentExecutionEvents, AgentExecutionInput, AgentExecutionRecovery, CommandReceipt, ControlStage, ExecutionMutation, ExecutionSnapshot, ExecutionState, FinishAuthorization, FinishIntent, FinishResult } from './execution.ts';
import type { Access, ActionId, Adoption, AgentExecutionId, AgentOperationId, Authority, ConsumptionId, DurableEvidence, ExecutionRevision, PassageId } from './identity.ts';
import type { FinishCandidateContent, SettlementRequest, SettlementResult } from './finishing.ts';
export type CallerCommit = Readonly<{
    kind: 'none';
}> | Readonly<{
    kind: 'message';
    message: Message;
    source: DurableEvidence;
    admission: DurableEvidence;
}> | Readonly<{
    kind: 'context-transition';
    value: PreparedContextTransition;
    admission: DurableEvidence;
}> | Readonly<{
    kind: 'custody';
    result: ProducedResult;
    consumption: ConsumptionId;
    retained: DurableEvidence;
}> | Readonly<{
    kind: 'processed';
    result: ProducedResult;
    consumption: ConsumptionId;
    completion: DurableEvidence;
}>;
export type EffectIntent = Readonly<{
    action: ActionId;
    pending: PendingCall;
    authority: Authority;
}>;
export type HandoffChange = Readonly<{
    kind: 'prepare';
    request: PendingHandoff;
}> | Readonly<{
    kind: 'resolve';
    outcome: HandoffOutcome;
}> | Readonly<{
    kind: 'retire';
    excluded: Extract<HandoffResolution, {
        kind: 'excluded';
    }>;
    reason: DurableEvidence;
}>;
export type JournalCommitState = Exclude<ExecutionState, {
    kind: 'ended' | 'settling';
}> | Readonly<{
    kind: 'settling';
}>;
export type JournalCommit<P> = ExecutionMutation<P> & Readonly<{
    authority: Authority;
    expected: ExecutionRevision;
    checkpoint: AgentCheckpoint;
    state: JournalCommitState;
    finish: FinishCandidateContent | null;
    events: readonly Exclude<AgentEventBody, {
        kind: 'ended' | 'entry';
    }>[];
    effects: readonly EffectIntent[];
    caller: CallerCommit;
    replyAdmission: ModelReplyAdmission | null;
    handoff: HandoffChange | null;
}>;
export type HandoffHistory = Readonly<{
    kind: 'pending';
}> | Readonly<{
    kind: 'committed';
    operation: AgentOperationId;
    revision: ExecutionRevision;
}> | Readonly<{
    kind: 'not-applicable';
}> | Readonly<{
    kind: 'retained';
    disposition: DurableEvidence;
}>;
export type HandoffRetirement = Readonly<{
    operation: AgentOperationId;
    revision: ExecutionRevision;
    reason: DurableEvidence;
}>;
export type HandoffCustodyAttempt = Readonly<{
    operation: AgentOperationId;
    predecessor: AgentOperationId | null;
    state: 'committed' | 'excluded';
}>;
export type ExecutionHandoff = Readonly<{
    handoff: HandoffReference;
    request: HandoffRequest;
    prepared: DurableEvidence | null;
    resolution: Extract<HandoffResolution, {
        kind: 'recorded' | 'excluded';
    }> | null;
    history: HandoffHistory;
    retirement: HandoffRetirement | null;
    custody: Readonly<{
        root: AgentOperationId;
        chain: readonly HandoffCustodyAttempt[];
        committed: AgentOperationId | null;
    }> | null;
}>;
export type OriginalInputAcceptance = Readonly<{
    entry: InputEntry;
    handoff: Extract<HandoffReference, {
        kind: 'input';
    }>;
    outcome: HandoffOutcome;
}>;
export type JournalSubmitLineage = Readonly<{
    kind: 'new-input';
    original: OriginalInputAcceptance;
}> | Readonly<{
    kind: 'recognize-input';
    original: OriginalInputAcceptance;
}>;
export type HandoffFactSource = Readonly<{
    owner: string;
    adoption: Adoption;
    record: string;
    version: string;
}>;
export type HandoffExclusionRecord = Readonly<{
    operation: AgentOperationId;
    method: 'recordHandoff';
    request: DurableEvidence;
    predecessor: AgentOperationId | null;
    authority: DurableEvidence;
    fence: DurableEvidence;
}>;
export type HandoffCustody = Readonly<{
    protocol: 'hand-off-custody-successor/1';
    custodyRoot: AgentOperationId;
    rootRequest: DurableEvidence;
    factSource: HandoffFactSource;
    predecessor: Readonly<{
        operation: AgentOperationId;
        request: DurableEvidence;
    }>;
    priorExcluded: readonly HandoffExclusionRecord[];
}>;
export interface AgentJournalAttachment<P> {
    open(input: ExecutionMutation<P> & Readonly<{
        original: OriginalInputAcceptance;
        runtime: InvokeRuntimeContext;
    }>): Reply<Readonly<{
        receipt: CommandReceipt;
        authority: Authority;
    }>>;
    attach(input: ExecutionMutation<P> & Readonly<{
        instance: InvokeRuntimeContext['instance'];
        grant: DurableEvidence | null;
        recovery: DurableEvidence;
        takeover: DurableEvidence | null;
    }>): Reply<Readonly<{
        receipt: CommandReceipt;
        authority: Authority;
    }>>;
    detach(input: Parameters<AgentExecutionRecovery<P>['detach']>[0]): Reply<DurableEvidence>;
}
export interface AgentJournalRecording<P> {
    commit(input: JournalCommit<P>): Reply<CommandReceipt>;
    submit(input: Parameters<AgentExecutionInput<P>['submit']>[0] & Readonly<{
        lineage: JournalSubmitLineage;
    }>): Reply<CommandReceipt>;
    control(input: Parameters<AgentExecutionControl<P>['control']>[0]): Reply<CommandReceipt>;
    acknowledge(input: Parameters<AgentExecutionEvents<P>['acknowledge']>[0]): Reply<CommandReceipt>;
    recordResult(input: ExecutionMutation<P> & Readonly<{
        result: ProducedResult;
        consumption: ConsumptionId;
        transfer: Extract<CallerCommit, {
            kind: 'custody' | 'processed';
        }> | Readonly<{
            kind: 'none';
        }>;
        release: Readonly<{
            kind: 'pending';
        }> | Readonly<{
            kind: 'confirmed';
            receipt: DurableEvidence;
        }>;
    }>): Reply<CommandReceipt>;
    recordControl(input: ExecutionMutation<P> & Readonly<{
        target: AgentOperationId;
        toolOperation?: ToolOperationRef;
        stage: Exclude<ControlStage, 'accepted'>;
        state: 'reached' | 'unresolved';
        source: DurableEvidence;
    }>): Reply<CommandReceipt>;
    recordHandoff(input: ExecutionMutation<P> & Readonly<{
        original: Extract<HandoffResolution, {
            kind: 'recorded' | 'excluded';
        }>;
        custody: HandoffCustody | null;
    }>): Reply<CommandReceipt>;
}
export interface AgentJournalFinishing<P> {
    prepareFinish(input: ExecutionMutation<P> & Readonly<{
        authorization: FinishAuthorization;
        expected: ExecutionRevision;
        candidate: AgentOperationId;
    }>): Reply<Readonly<{
        receipt: CommandReceipt;
        obligations: DurableEvidence;
    }>>;
    tryFinish(input: ExecutionMutation<P> & Readonly<{
        authorization: FinishAuthorization;
        expected: ExecutionRevision;
        intent: FinishIntent;
    }>): Reply<FinishResult>;
    commitSettlement(input: SettlementRequest<P>): Reply<SettlementResult>;
}
export interface AgentJournalObservation<P> {
    recordTerminalObservation(input: ExecutionMutation<P> & Readonly<{
        terminal: DurableEvidence;
        passage: PassageId;
        implementation: Adoption;
        observed: DurableEvidence;
    }>): Reply<CommandReceipt>;
}
export interface AgentJournalReading<P> {
    load(input: Access<P> & Readonly<{
        execution: AgentExecutionId;
    }>): Reply<ExecutionSnapshot>;
    inputs(input: Access<P> & Readonly<{
        execution: AgentExecutionId;
        watermark: DurableEvidence;
    }>): Reply<Readonly<{
        batch: InputBatch;
        messages: readonly Message[];
    }>>;
    readReplyAdmissions(input: Access<P> & Readonly<{
        execution: AgentExecutionId;
        through: DurableEvidence;
        after: string | null;
        limit: number;
    }>): Reply<ReplyAdmissionPage>;
    query(input: ExecutionMutation<P>): ReturnType<AgentExecutionRecovery<P>['query']>;
    readonly output: Pick<AgentExecutionEvents<P>, 'read' | 'events'>;
}
export type JournalCapabilities = Readonly<{
    coordination: 'standalone' | 'coordinated';
    participants: ReadonlySet<Exclude<CallerCommit['kind'], 'none'>>;
}>;
export interface AgentJournal<P> extends AgentJournalAttachment<P>, AgentJournalRecording<P>, AgentJournalFinishing<P>, AgentJournalObservation<P>, AgentJournalReading<P> {
    readonly capabilities: JournalCapabilities;
}
```

## 声明文件 `judge-definition.d.ts`

```ts
import { type AgentDefinition } from './definition.ts';
import { type Judgment } from './judgment.ts';
export declare function judgeAgentDefinition(value: unknown): Promise<Judgment<AgentDefinition>>;
```

## 声明文件 `judge-extensions.d.ts`

```ts
import { type LoopExtensionDeclaration } from './extensions.ts';
import { type BatchJudgment } from './judgment.ts';
export declare function judgeLoopExtensions(value: unknown): Promise<BatchJudgment<LoopExtensionDeclaration>>;
```

## 声明文件 `judge-handoff.d.ts`

```ts
import { type Outcome } from '@omne-harness/operation-result';
import { type StructureFailure } from './identity.ts';
import type { HandoffPrepare, InputOrigin } from './passages.ts';
type Judged<T> = Outcome<T, StructureFailure>;
export declare function judgeHandoffPrepare(value: unknown): Judged<HandoffPrepare>;
export declare function judgeInputOrigin(value: unknown): Judged<InputOrigin>;
export {};
```

## 声明文件 `judge-output.d.ts`

```ts
import { type Dimension, type ExtensionOutput, type Position, type Power } from './extensions.ts';
import type { Subject } from './passages.ts';
import type { Judgment, OutputRefusalReason } from './judgment.ts';
type OutputKind = ExtensionOutput['kind'];
type SplitPosition = 'before_model_call' | 'after_model_call' | 'after_action';
type Ending = Extract<Dimension, {
    ending: unknown;
}>['ending'];
type Scope = Extract<Dimension, {
    scope: unknown;
}>['scope'];
export type PositionOutputKey = Exclude<Position, SplitPosition> | `before_model_call/${NonNullable<ExtensionOutputJudgeInput['purpose']>}` | `after_model_call/${Ending}` | `after_action/${Scope}`;
export type PositionOutputs = Readonly<{
    allowed: readonly OutputKind[];
    rewritable: readonly (readonly string[])[];
}>;
export declare const POSITION_OUTPUTS: Readonly<Record<PositionOutputKey, PositionOutputs>>;
export type ExtensionOutputJudgeInput = Readonly<{
    position: Position;
    dimension: Dimension | null;
    purpose: 'main' | 'compaction' | null;
    power: Power;
    trigger: 'first-content' | 'final' | null;
    subject: Subject;
    output: unknown;
}>;
export declare function judgeExtensionOutput(input: ExtensionOutputJudgeInput): Judgment<ExtensionOutput, OutputRefusalReason>;
export {};
```

## 声明文件 `judgment.d.ts`

```ts
export type RefusalReason = 'malformed' | 'duplicate-capability' | 'unknown-attribute' | 'unknown-position' | 'unknown-power' | 'dimension-missing' | 'dimension-not-allowed' | 'power-above-ceiling' | 'needs-not-allowed' | 'implementation-missing' | 'error-policy-not-allowed' | 'unavailability-not-allowed' | 'executable' | 'checker-failed';
export type OutputRefusalReason = 'malformed' | 'position_unknown' | 'power_unknown' | 'dimension_missing' | 'dimension_not_allowed' | 'output_not_allowed_for_power' | 'output_not_allowed_at_position' | 'ask_at_forbidden_position' | 'rewrite_touches_immutable' | 'inject_source_mismatch';
export type Judgment<T, Reason extends string = RefusalReason> = {
    readonly kind: 'accepted';
    readonly value: T;
} | {
    readonly kind: 'refused';
    readonly reason: Reason;
};
export type BatchJudgment<T> = {
    readonly kind: 'accepted';
    readonly value: readonly T[];
} | {
    readonly kind: 'refused';
    readonly reason: RefusalReason;
    readonly index: number;
};
export declare function refused<T>(reason: RefusalReason): Judgment<T>;
```

## 声明文件 `passages.d.ts`

```ts
import type { Message } from '@omne-harness/message';
import type { ContentBlock } from '@omne-harness/content-block';
import type { JsonValue } from '@omne-harness/json-text';
import type { CallAccount } from '@omne-harness/call-account';
import type * as M from '@omne-harness/model-contract';
import type * as T from '@omne-harness/tool-contract';
import type { Action, AgentCheckpoint, AgentConclusion, GuardFact, PendingCall, ProducedResult, Reply, PreparedContextTransition } from './evaluation.ts';
import type { AcceptedInput } from './execution.ts';
import type { Conclusion, DecisionCardDraft, Dimension, ExtensionInvocationMode, ExtensionOutput, LoopExtensionDeclaration, LoopExtensionImplementation, Position } from './extensions.ts';
import type { Access, Adoption, ActionBatchId, ActionId, AgentExecutionId, AgentInstanceId, AgentOperationId, Authority, CardRoundId, ConsumerRef, DurableEvidence, ExecutionRevision, InputId, PassageId, StepId } from './identity.ts';
import type { CompactionProgress, Preparation } from './request.ts';
export type CapturedRead = Readonly<{
    schema: Adoption;
    value: JsonValue;
    source: DurableEvidence;
}>;
export type NamedCapturedRead = CapturedRead & Readonly<{
    need: string;
}>;
export type CardRequest = Readonly<{
    identity: string;
    schema: Adoption;
    value: JsonValue;
}>;
export type CardAnswer = Readonly<{
    kind: 'chosen';
    option: string;
    value: JsonValue | null;
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'declined';
    evidence: DurableEvidence;
}>;
export type CardRemark = Readonly<{
    kind: 'remark';
    text: string;
    evidence: DurableEvidence;
}>;
export type CardReply = CardAnswer | CardRemark | Readonly<{
    kind: 'pending';
}> | Readonly<{
    kind: 'invalidated';
    evidence: DurableEvidence;
}>;
export type PassageCard = Readonly<{
    identity: string;
    card: DurableEvidence;
    response: Exclude<CardReply, {
        kind: 'pending';
    }> | null;
    processed: DurableEvidence | null;
}>;
export type PassageOperationProgress<R> = Readonly<{
    kind: 'requested';
}> | Readonly<{
    kind: 'resolved';
    result: R;
}> | Readonly<{
    kind: 'applied';
    result: R;
    transition: DurableEvidence;
}>;
export type CardRoundProgress = Readonly<{
    kind: 'requested';
}> | Readonly<{
    kind: 'presented';
    cards: readonly PassageCard[];
}> | Readonly<{
    kind: 'answered';
    cards: readonly PassageCard[];
}> | Readonly<{
    kind: 'processed';
    cards: readonly PassageCard[];
    conclusion: DurableEvidence;
}> | Readonly<{
    kind: 'present-failed';
    failure: DurableEvidence;
}>;
export type CardRound = Readonly<{
    round: CardRoundId;
    ask: Conclusion & Readonly<{
        output: Extract<ExtensionOutput, {
            kind: 'ask';
        }>;
    }>;
    requests: readonly CardRequest[];
    progress: CardRoundProgress;
}>;
export type PassageOperation = Readonly<{
    action: ActionId;
    ordinal: number;
    input: DurableEvidence;
}> & (Readonly<{
    kind: 'producer';
    pending: Extract<PendingCall, {
        kind: 'model';
    }>;
    progress: PassageOperationProgress<Readonly<{
        result: ProducedResult;
        consumed: DurableEvidence;
    }>>;
}> | Readonly<{
    kind: 'read';
    owner: string;
    protocol: Adoption;
    query: JsonValue;
    progress: PassageOperationProgress<CapturedRead>;
}> | Readonly<{
    kind: 'guard';
    progress: PassageOperationProgress<GuardFact>;
}>);
export type PassageProgress = Readonly<{
    kind: 'requested';
    mode: ExtensionInvocationMode;
}> | Readonly<{
    kind: 'asked';
    rounds: readonly [
        CardRound,
        ...CardRound[]
    ];
}> | Readonly<{
    kind: 'resolved';
    rounds: readonly CardRound[];
    conclusion: Conclusion;
}> | Readonly<{
    kind: 'applied';
    rounds: readonly CardRound[];
    conclusion: Conclusion;
    transition: DurableEvidence;
}>;
export type Passage = Readonly<{
    id: PassageId;
    position: Position;
    dimension: Dimension | null;
    purpose: 'main' | 'compaction' | null;
    action: ActionId | null;
    ordinal: number;
    declaration: LoopExtensionDeclaration;
    implementation: Adoption;
    input: DurableEvidence;
    effective: DurableEvidence;
    operations: readonly PassageOperation[];
    progress: PassageProgress;
}>;
export type Subject = Readonly<{
    execution: AgentExecutionId;
    conditions: DurableEvidence;
}> | Readonly<{
    preparation: Extract<Preparation, {
        kind: 'needs-compaction';
    }>;
}> | Readonly<{
    transition: PreparedContextTransition;
}> | Readonly<{
    purpose: 'main';
    preparation: Extract<Preparation, {
        kind: 'assembled';
    }>;
}> | Readonly<{
    purpose: 'compaction';
    step: Extract<Preparation, {
        kind: 'ready';
    }>;
    progress: CompactionProgress;
}> | Readonly<{
    purpose: 'main' | 'compaction';
    call: M.ModelCallId;
    result: ProducedResult;
    reply: Message;
    termination: M.Termination;
    account: CallAccount | null;
}> | Readonly<{
    purpose: 'main' | 'compaction';
    call: M.ModelCallId;
    request: M.FixedModelRequest;
    fault: M.ModelFault;
    dispatches: readonly M.DispatchRecord[];
    retry: M.RetryResolution | null;
}> | Readonly<{
    action: ActionId;
    original: Action['original'];
    effectiveArguments: string;
    definition: T.ToolDefinition;
    batch: readonly ActionId[];
}> | Readonly<{
    action: ActionId;
    candidate: Message;
    outcome: Readonly<{
        kind: 'denied';
        evidence: DurableEvidence;
    }> | Readonly<{
        kind: 'executed';
        result: ProducedResult;
        terminal: T.ToolTerminal;
    }>;
}> | Readonly<{
    batch: ActionBatchId;
    outcomes: readonly Readonly<{
        action: ActionId;
        outcome: 'denied' | 'executed';
        terminal: T.ToolTerminal | null;
    }>[];
}> | Readonly<{
    proposed: AgentConclusion;
    basis: DurableEvidence;
}> | Readonly<{
    terminal: AgentConclusion;
    disposition: DurableEvidence;
}>;
export interface ExtensionImplementations<P> {
    resolve(input: Access<P> & Readonly<{
        passage: Passage;
    }>): Reply<LoopExtensionImplementation>;
}
export interface DecisionCards<P> {
    present(input: Access<P> & Readonly<{
        advance: Authority;
        passage: PassageId;
        round: CardRoundId;
        original: DurableEvidence;
        requests: readonly CardRequest[];
    }>): Reply<readonly DurableEvidence[]>;
    lookup(input: Access<P> & Readonly<{
        passage: PassageId;
        round: CardRoundId;
        original: DurableEvidence;
        requests: readonly string[];
    }>): Reply<Readonly<{
        kind: 'presented';
        cards: readonly DurableEvidence[];
    }> | Readonly<{
        kind: 'not-presented';
        exclusion: DurableEvidence;
    }> | Readonly<{
        kind: 'unknown';
    }>>;
    read(input: Access<P> & Readonly<{
        card: DurableEvidence;
    }>): Reply<CardReply>;
    invalidate(input: Access<P> & Readonly<{
        operation: AgentOperationId;
        passage: PassageId;
        round: CardRoundId;
        cards: readonly DurableEvidence[];
        reason: DurableEvidence;
    }>): Reply<readonly Readonly<{
        card: DurableEvidence;
        reply: Exclude<CardReply, {
            kind: 'pending';
        }>;
    }>[]>;
}
export type AdmissionDecision = Readonly<{
    kind: 'allow';
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'deny';
    reason: string;
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'need-decision';
    card: DecisionCardDraft;
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
export interface ActionAdmission<P> {
    admit(input: Access<P> & Readonly<{
        advance: Authority;
        execution: AgentExecutionId;
        passage: PassageId;
        action: ActionId;
        original: Action['original'];
        effectiveArguments: string;
        definition: Adoption;
        permissions: readonly NamedCapturedRead[];
        decision: Readonly<{
            card: DurableEvidence;
            answer: CardAnswer | CardRemark;
        }> | null;
    }>): Reply<AdmissionDecision>;
}
export type MessageSource = Readonly<{
    kind: 'external-input';
    input: InputId;
}> | Readonly<{
    kind: 'model-reply';
    step: StepId;
    action: ActionId;
    call: M.ModelCallId;
    result: ProducedResult;
}> | Readonly<{
    kind: 'tool-result';
    action: ActionId;
    call: T.ToolCallId;
    result: ProducedResult;
}> | Readonly<{
    kind: 'action-denied';
    action: ActionId;
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'reminder';
    passage: PassageId;
}> | Readonly<{
    kind: 'context-transition';
    transition: PreparedContextTransition;
}>;
export type InputEntry = Readonly<{
    kind: 'invoke';
    operation: AgentOperationId;
    execution: AgentExecutionId;
    initial: AcceptedInput;
    checkpoint: AgentCheckpoint;
}> | Readonly<{
    kind: 'submit';
    operation: AgentOperationId;
    execution: AgentExecutionId;
    value: AcceptedInput;
}>;
export type InvokeRuntimeContext = Readonly<{
    instance: AgentInstanceId;
    scope: DurableEvidence;
    definition: Adoption;
    grant: DurableEvidence | null;
}>;
export type SubmitDelivery = Readonly<{
    kind: 'runtime-view';
    instance: AgentInstanceId;
}> | Readonly<{
    kind: 'durable-view';
}>;
export type InputOrigin = Readonly<{
    kind: 'invoke';
    instance: AgentInstanceId;
    scope: DurableEvidence;
    definition: Adoption;
    grant: DurableEvidence | null;
}> | Readonly<{
    kind: 'submit';
    executionBinding: DurableEvidence;
    delivery: SubmitDelivery;
}>;
export type HandoffPosition = Readonly<{
    step: StepId;
    node: string;
    slot: string | null;
}>;
export type HandoffReference = Readonly<{
    kind: 'execution';
    execution: AgentExecutionId;
    operation: AgentOperationId;
}> | Readonly<{
    kind: 'input';
    execution: AgentExecutionId;
    entry: AgentOperationId;
    input: InputId;
}>;
export type PendingHandoff = Readonly<{
    kind: 'execution';
    reference: Extract<HandoffReference, {
        kind: 'execution';
    }>;
    predecessor: ExecutionRevision;
    position: HandoffPosition;
    source: Exclude<MessageSource, {
        kind: 'external-input';
    }>;
    candidate: Message;
    originalAdvance: Authority;
    predecessorHandoff: Extract<HandoffReference, {
        kind: 'execution';
    }> | null;
}>;
export type InputHandoff = Readonly<{
    kind: 'input';
    reference: Extract<HandoffReference, {
        kind: 'input';
    }>;
    entry: InputEntry;
    source: Extract<MessageSource, {
        kind: 'external-input';
    }>;
}>;
export type HandoffRequest = PendingHandoff | InputHandoff;
export type HandoffPrepare = Readonly<{
    kind: 'execution';
    request: PendingHandoff;
    advance: Authority;
}> | Readonly<{
    kind: 'invoke';
    request: InputHandoff;
    runtime: InvokeRuntimeContext;
}> | Readonly<{
    kind: 'submit';
    request: InputHandoff;
}>;
export type HandoffDecision = Readonly<{
    kind: 'prepared';
    message: Message;
    admission: DurableEvidence;
}> | Readonly<{
    kind: 'rejected';
    reason: string;
    evidence: DurableEvidence;
}>;
export type HandoffOutcome = Readonly<{
    request: HandoffRequest;
    origin: InputOrigin | null;
    provider: Adoption;
    qualification: DurableEvidence;
    record: DurableEvidence;
    decision: HandoffDecision;
}>;
export type HandoffResolution = Readonly<{
    kind: 'recorded';
    outcome: HandoffOutcome;
}> | Readonly<{
    kind: 'excluded';
    request: HandoffRequest;
    origin: InputOrigin | null;
    exclusion: DurableEvidence;
}> | Readonly<{
    kind: 'unknown';
    original: Readonly<{
        request: HandoffRequest;
        origin: InputOrigin | null;
        record: DurableEvidence;
    }> | null;
}>;
export type HandoffLookup = Readonly<{
    kind: 'execution';
    execution: AgentExecutionId;
    handoff: Extract<HandoffReference, {
        kind: 'execution';
    }>;
}> | Readonly<{
    kind: 'input-entry';
    execution: AgentExecutionId;
    operation: AgentOperationId;
}>;
export interface MessageHandoff<P> {
    prepare(input: Access<P> & HandoffPrepare): Reply<HandoffOutcome>;
    lookup(input: Access<P> & HandoffLookup): Reply<HandoffResolution>;
    exclude(input: Access<P> & Readonly<{
        request: PendingHandoff;
        control: AgentOperationId;
    }>): Reply<HandoffResolution>;
}
export type Material<B extends ContentBlock> = Readonly<{
    kind: 'model';
    result: ProducedResult;
    pages: readonly M.ResultPage[];
}> | Readonly<{
    kind: 'tool';
    result: ProducedResult;
    pages: readonly T.ResultPage<B>[];
}> | Readonly<{
    kind: 'facts';
    schema: Adoption;
    value: JsonValue;
}>;
export interface AgentMaterials<P, B extends ContentBlock> {
    preserve(input: Access<P> & Readonly<{
        identity: string;
        consumer: ConsumerRef;
        value: Material<B>;
    }>): Reply<DurableEvidence>;
    read(input: Access<P> & Readonly<{
        source: DurableEvidence;
    }>): Reply<Material<B>>;
}
export interface RegisteredReads<P> {
    read(input: Access<P> & Readonly<{
        action: ActionId;
        passage: PassageId;
        original: DurableEvidence;
        owner: string;
        protocol: Adoption;
        query: JsonValue;
    }>): Reply<Readonly<{
        kind: 'captured';
        value: CapturedRead;
    }> | Readonly<{
        kind: 'unknown';
    }>>;
    lookup(input: Access<P> & Readonly<{
        action: ActionId;
        passage: PassageId;
        original: DurableEvidence;
    }>): Reply<Readonly<{
        kind: 'captured';
        value: CapturedRead;
    }> | Readonly<{
        kind: 'excluded';
        evidence: DurableEvidence;
    }> | Readonly<{
        kind: 'unknown';
    }>>;
}
```

## 声明文件 `receiving.d.ts`

```ts
import type { CallAccount } from '@omne-harness/call-account';
import type { ContentBlock } from '@omne-harness/content-block';
import type * as M from '@omne-harness/model-contract';
import type * as T from '@omne-harness/tool-contract';
import type { Reply } from './evaluation.ts';
import type { CommandReceipt, ExecutionMutation } from './execution.ts';
import type { Access, Authority, ConsumerRef, ConsumptionId, DurableEvidence } from './identity.ts';
import type { AgentJournal } from './journal.ts';
import type { AgentMaterials, Material } from './passages.ts';
export type StartFenceEntry = Readonly<{
    kind: 'start-fence';
    operation: T.ToolOperationId;
    guard: Readonly<{
        owner: string;
        resource: string;
        revision: string;
        evidence: DurableEvidence;
    }>;
    fence: DurableEvidence;
}>;
export type ReceivedDelivery = Readonly<{
    producer: 'model';
    key: Extract<M.ModelDeliveryKey, {
        kind: 'result';
    }>;
    accounts: readonly M.ModelAccountSnapshot[];
}> | Readonly<{
    producer: 'model';
    key: Extract<M.ModelDeliveryKey, {
        kind: 'account';
    }>;
    account: CallAccount;
}> | Readonly<{
    producer: 'tool';
    key: Extract<T.ToolDeliveryKey, {
        kind: 'result';
    }>;
    account: CallAccount | null;
}> | Readonly<{
    producer: 'tool';
    key: Extract<T.ToolDeliveryKey, {
        kind: 'account';
    }>;
    account: CallAccount;
}>;
export type ReceivedEntry = Readonly<{
    kind: 'received';
    delivery: ReceivedDelivery;
    consumer: ConsumerRef;
    consumption: ConsumptionId;
    material: DurableEvidence;
}>;
export type AgentJournalEntry = StartFenceEntry | ReceivedEntry;
export type JournalEntryRecord<P> = ExecutionMutation<P> & (Readonly<{
    authority: Authority;
    entry: StartFenceEntry;
}> | Readonly<{
    authority: null;
    entry: ReceivedEntry;
}>);
export interface AgentJournalEntries<P> {
    record(input: JournalEntryRecord<P>): Reply<CommandReceipt>;
}
export type ReceivedCommitInput<P, B extends ContentBlock> = ExecutionMutation<P> & Readonly<{
    entry: Omit<ReceivedEntry, 'material'>;
    material: Material<B>;
}>;
export type ReceivedCommitValue = Readonly<{
    receipt: CommandReceipt;
    entry: ReceivedEntry;
    saved: DurableEvidence;
}>;
export type ReceivedCommitResult = Readonly<{
    kind: 'committed';
    value: ReceivedCommitValue;
}> | Readonly<{
    kind: 'excluded';
    evidence: DurableEvidence;
}>;
export type ReceivedCommitQuery = ReceivedCommitResult | Readonly<{
    kind: 'unknown';
}>;
export interface AgentReceivedCommits<P, B extends ContentBlock> {
    commit(input: ReceivedCommitInput<P, B>): Reply<ReceivedCommitResult>;
    query(input: ExecutionMutation<P>): Reply<ReceivedCommitQuery>;
}
export type AgentReceivedProvider<P, B extends ContentBlock> = Readonly<{
    journal: AgentJournal<P>;
    entries: AgentJournalEntries<P>;
    materials: AgentMaterials<P, B>;
    received: AgentReceivedCommits<P, B> | null;
}>;
export type AgentAccountHandoff = Readonly<{
    call: M.ModelInvocationRef;
    dispatch: M.DispatchId;
    account: CallAccount;
    resultVersion: M.ResultVersion | null;
    committed: DurableEvidence;
}>;
export type AgentAccountOutcome = Readonly<{
    kind: 'received';
}> | Readonly<{
    kind: 'denied';
}> | Readonly<{
    kind: 'conflict';
}> | Readonly<{
    kind: 'invalid';
    field: string;
    reason: string;
}> | Readonly<{
    kind: 'unknown';
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
export interface AgentAccountOutlet<P> {
    deliver(input: Readonly<{
        access: Access<P>;
        handoff: AgentAccountHandoff;
    }>): Promise<AgentAccountOutcome>;
}
```

## 声明文件 `request.d.ts`

```ts
import type { JsonValue } from '@omne-harness/json-text';
import type * as M from '@omne-harness/model-contract';
import type { ModelPurpose, PreparedContextTransition, ProducedResult, InputBatch, RuntimeConditions, Reply } from './evaluation.ts';
import type { Access, Adoption, ActionId, Authority, ConsumerRef, DurableEvidence, PassageId } from './identity.ts';
export type ModelRecipient = Readonly<{
    route: string;
    profile: Adoption;
}>;
export type SelectedModel = Readonly<{
    recipient: ModelRecipient;
    resolution: Extract<M.ProfileResolution, {
        kind: 'resolved';
    }> & Readonly<{
        selectable: true;
    }>;
    parameters: readonly M.Parameter[];
    tools: DurableEvidence;
    evidence: DurableEvidence;
}>;
export interface ModelSelection<P> {
    select(input: Access<P> & Readonly<{
        advance: Authority;
        scope: DurableEvidence;
        purpose: ModelPurpose;
        position: ConsumerRef;
        history: DurableEvidence;
        conditions: RuntimeConditions;
        alterations: readonly DurableEvidence[];
    }>): Reply<SelectedModel>;
}
export type ContextContent = 'full' | 'incremental';
export type ModelContextRead = Readonly<{
    recipient: ModelRecipient;
    content: ContextContent;
    source: DurableEvidence;
    coverage: DurableEvidence;
}>;
export interface ModelContextReader<P> {
    read(input: Access<P> & Readonly<{
        advance: Authority;
        position: ConsumerRef;
        recipient: ModelRecipient;
        history: DurableEvidence;
        adopted: DurableEvidence | null;
        transition: DurableEvidence | null;
    }>): Reply<ModelContextRead>;
}
export type CompactionProgress = Readonly<{
    plan: DurableEvidence;
    bound: string;
    completed: string;
}>;
export type Preparation = Readonly<{
    id: ActionId;
    purpose: ModelPurpose;
    position: ConsumerRef;
    source: DurableEvidence;
    state: JsonValue;
    schema: Adoption;
}> & (Readonly<{
    kind: 'assembled';
    input: M.AssembledModelInput;
    budget: DurableEvidence;
    recipient: ModelRecipient;
    coverage: DurableEvidence;
}> | Readonly<{
    kind: 'ready';
    request: M.FixedModelRequest;
    capacity: M.ResultCapacity;
    budget: DurableEvidence;
    recipient: ModelRecipient;
    coverage: DurableEvidence;
}> | Readonly<{
    kind: 'needs-compaction';
    original: Readonly<{
        input: DurableEvidence;
        alterations: readonly DurableEvidence[];
        beforeModelCall: readonly PassageId[] | null;
    }>;
    progress: CompactionProgress;
}> | Readonly<{
    kind: 'cannot-fit';
    reason: 'fixed' | 'after-compaction';
    diagnostic: string;
}>);
export type CompactionAdvance = Readonly<{
    kind: 'continue';
    progress: CompactionProgress;
    stepRequest: Extract<Preparation, {
        kind: 'ready';
    }>;
}> | Readonly<{
    kind: 'transition';
    progress: CompactionProgress;
    value: PreparedContextTransition;
}> | Readonly<{
    kind: 'cannot-fit';
    progress: CompactionProgress;
    reason: 'after-compaction';
    diagnostic: string;
}>;
export type CompactionState = Readonly<{
    action: ActionId;
    progress: CompactionProgress;
    initiated: string;
    stepRequest: Extract<Preparation, {
        kind: 'ready';
    }> | null;
    ended: 'committed' | 'failed' | null;
}>;
export type FinalRequest = Readonly<{
    preparation: ActionId;
    request: M.FixedModelRequest;
    capacity: M.ResultCapacity;
    recipient: ModelRecipient;
    coverage: DurableEvidence;
    alterations: readonly DurableEvidence[];
}>;
export interface RequestPreparation<P> {
    prepare(input: Access<P> & Readonly<{
        advance: Authority;
        action: ActionId;
        purpose: Exclude<ModelPurpose, 'compaction'>;
        position: ConsumerRef;
        history: DurableEvidence;
        inputs: InputBatch;
        conditions: RuntimeConditions;
        selection: SelectedModel;
        context: ModelContextRead;
        previous: Preparation | null;
        alterations: readonly DurableEvidence[];
        beforeModelCall: readonly PassageId[] | null;
    }>): Reply<Preparation>;
    derive(input: Access<P> & Readonly<{
        advance: Authority;
        original: Extract<Preparation, {
            kind: 'needs-compaction';
        }>;
        progress: CompactionProgress;
        action: ActionId;
        selection: SelectedModel;
        result: Readonly<{
            produced: ProducedResult;
            consumed: DurableEvidence;
        }> | null;
    }>): Reply<CompactionAdvance>;
    resume(input: Access<P> & Readonly<{
        advance: Authority;
        original: Extract<Preparation, {
            kind: 'needs-compaction';
        }>;
        transition: DurableEvidence;
        selection: SelectedModel;
        context: ModelContextRead;
    }>): Reply<Preparation>;
}
export interface CurrentConditions<P> {
    read(input: Access<P> & Readonly<{
        advance: Authority;
        previous: DurableEvidence | null;
    }>): Reply<RuntimeConditions>;
}
```

## 声明文件 `structure.d.ts`

```ts
import { type Outcome } from '@omne-harness/operation-result';
import type { AgentIdentity, IdentityFailure, StructureFailure } from './identity.ts';
export type OwnMembers = Readonly<Record<string, unknown>>;
export declare function ownMembers(value: unknown): OwnMembers | undefined;
export declare const refusal: (field: string, reason: StructureFailure['reason']) => Outcome<never, Readonly<{
    field: string;
    reason: 'type' | 'empty' | 'unknown-field' | 'missing' | 'identity';
}>>;
export declare function textMember(members: OwnMembers, name: string): Outcome<string, StructureFailure>;
export declare function unknownMember(members: OwnMembers, known: readonly string[]): string | undefined;
export declare function identityMember<T extends AgentIdentity<string>>(members: OwnMembers, name: string, decode: (value: unknown) => Outcome<T, IdentityFailure>): Outcome<T, StructureFailure>;
```

## 声明文件 `testing-account-outlet.d.ts`

```ts
import type { TenantId } from '@omne-harness/legal-identity';
import type { Access } from './identity.ts';
import type { AgentAccountHandoff, AgentAccountOutlet } from './receiving.ts';
import { type ConformanceCase } from './testing-case.ts';
export interface MemoryAgentAccountOutlet<P> extends AgentAccountOutlet<P> {
    readonly durability: 'none';
    received(tenant: TenantId): readonly AgentAccountHandoff[];
}
export declare function createMemoryAgentAccountOutlet<P>(): MemoryAgentAccountOutlet<P>;
export interface AgentAccountOutletFixture<P> {
    readonly outlet: AgentAccountOutlet<P>;
    readonly access: Access<P>;
    readonly otherAccess: Access<P>;
    current(access: Access<P>, handoff: AgentAccountHandoff): Promise<string | null>;
}
export declare function sampleAccountHandoff(tenant: TenantId, name: string, revision?: string, lexeme?: string): AgentAccountHandoff;
export declare function agentAccountOutletConformance<P>(fixture: AgentAccountOutletFixture<P>): readonly ConformanceCase[];
export declare function memoryAgentAccountOutletFixture<P>(access: Access<P>, otherAccess: Access<P>): AgentAccountOutletFixture<P> & Readonly<{
    double: MemoryAgentAccountOutlet<P>;
}>;
```

## 声明文件 `testing-cancellation.d.ts`

```ts
import type * as T from '@omne-harness/tool-contract';
import type { CancellationPolicy, CancellationPolicyInstallation, CancellationUnknown, ToolIntentKey } from './finishing.ts';
import type { ExtensionInvocationMode, ExtensionInvocationResult } from './extensions.ts';
import type { Adoption, AgentOperationId, CardRoundId, DurableEvidence, PassageId } from './identity.ts';
export declare const TEST_CANCELLATION_POLICY: Adoption;
export declare const TEST_CANCELLATION_INPUT_SCHEMA: Adoption;
export declare const TEST_CANCELLATION_IMPLEMENTATION: Adoption;
export declare const testCancellationPolicyInstallation: CancellationPolicyInstallation;
export declare function createTestCancellationPolicy(): CancellationPolicy;
export type TestHostRecord = Readonly<{
    kind: 'legacy-return';
    passage: PassageId;
    input: DurableEvidence;
    mode: ExtensionInvocationMode;
    implementation: Adoption;
    started: DurableEvidence;
    result: ExtensionInvocationResult;
    received: DurableEvidence;
    custody: DurableEvidence;
}> | Readonly<{
    kind: 'tool-return';
    intent: ToolIntentKey;
    request: DurableEvidence;
    returned: Readonly<{
        kind: 'commit-unknown';
        reference: T.ToolInvocationRef;
    }> | Readonly<{
        kind: 'accepted';
        reference: T.ToolInvocationRef;
        receipt: DurableEvidence;
    }>;
    received: DurableEvidence;
    custody: DurableEvidence;
}> | Readonly<{
    kind: 'card-reconciliation';
    passage: PassageId;
    round: CardRoundId;
    result: Readonly<{
        kind: 'known';
        present: DurableEvidence | null;
        lookups: readonly AgentOperationId[];
        invalidate: Readonly<{
            operation: AgentOperationId;
            reason: DurableEvidence;
        }> | null;
    }> | Readonly<{
        kind: 'unknown';
        reason: CancellationUnknown['reason'];
    }>;
}>;
```

## 声明文件 `testing-case.d.ts`

```ts
import { type TenantId } from '@omne-harness/legal-identity';
import type { AgentEvent, CommandReceipt } from './execution.ts';
import type { Adoption, Authority, DurableEvidence } from './identity.ts';
import type { AgentJournalEntry } from './receiving.ts';
export type ConformanceCase = Readonly<{
    name: string;
    run: () => Promise<void>;
}> | Readonly<{
    name: string;
    uncovered: string;
    run: () => Promise<never>;
}>;
export declare function uncoveredCase(name: string, capability: string): ConformanceCase;
export declare const DOUBLE_EVENT_SCHEMA: Adoption;
export type ProjectingExecution = Readonly<{
    authority: Authority;
    ended: boolean;
    events: AgentEvent[];
}>;
export declare function projectEntryEvent(execution: ProjectingExecution, entry: AgentJournalEntry, receipt: CommandReceipt): void;
export declare function canonicalText(value: unknown): string;
export declare function tenantText(tenant: TenantId): string;
export declare function doubleEvidence(owner: string, record: string, revision: string): DurableEvidence;
```

## 声明文件 `testing-journal-core.d.ts`

```ts
import { type ConformanceCase } from './testing-case.ts';
import { type AgentJournalCoreFixture } from './testing-journal-helpers.ts';
export type { AgentJournalCoreFixture, AgentJournalCoreOpenOptions, AgentJournalCoreOpened, SettlementQualification, } from './testing-journal-helpers.ts';
export declare function agentJournalCoreConformance<P>(fixture: AgentJournalCoreFixture<P>): readonly ConformanceCase[];
```

## 声明文件 `testing-journal-entries.d.ts`

```ts
import type { ContentBlock } from '@omne-harness/content-block';
import type { RequiredReceivedCommits } from './testing-received-fixture.ts';
import type { TenantId } from '@omne-harness/legal-identity';
import type { AgentEvent } from './execution.ts';
import { type Access, type AgentExecutionId, type Authority } from './identity.ts';
import type { AgentJournalEntries, AgentJournalEntry } from './receiving.ts';
import { type ConformanceCase } from './testing-case.ts';
export { sampleReceivedModelAccount, sampleReceivedModelResult, sampleReceivedToolAccount, sampleStartFence, } from './testing-journal-samples.ts';
export interface MemoryAgentJournalEntries<P> extends AgentJournalEntries<P> {
    readonly durability: 'none';
    open(input: Readonly<{
        tenant: TenantId;
        authority: Authority;
    }>): void;
    supersede(input: Readonly<{
        tenant: TenantId;
        authority: Authority;
    }>): void;
    detach(input: Readonly<{
        tenant: TenantId;
        execution: AgentExecutionId;
    }>): void;
    end(input: Readonly<{
        tenant: TenantId;
        execution: AgentExecutionId;
    }>): void;
    failNextRecord(input: Readonly<{
        tenant: TenantId;
        execution: AgentExecutionId;
    }>, fault: RecordFault): void;
    entries(input: Readonly<{
        tenant: TenantId;
        execution: AgentExecutionId;
    }>): readonly AgentJournalEntry[] | undefined;
    events(input: Readonly<{
        tenant: TenantId;
        execution: AgentExecutionId;
    }>): readonly AgentEvent[] | undefined;
}
export declare function createMemoryAgentJournalEntries<P>(): MemoryAgentJournalEntries<P>;
export type RecordFault = Readonly<{
    kind: 'commit-unknown';
    outcome: 'applied';
}> | Readonly<{
    kind: 'unavailable';
}>;
export interface AgentJournalEntriesFixture<P> {
    readonly entries: AgentJournalEntries<P>;
    readonly access: Access<P>;
    readonly otherAccess: Access<P>;
    open(access: Access<P>, execution: AgentExecutionId): Promise<Authority>;
    supersede(access: Access<P>, execution: AgentExecutionId): Promise<Authority>;
    end(access: Access<P>, execution: AgentExecutionId): Promise<void>;
    read(access: Access<P>, execution: AgentExecutionId): Promise<readonly AgentJournalEntry[] | undefined>;
    events(access: Access<P>, execution: AgentExecutionId): Promise<readonly AgentEvent[] | undefined>;
    detach?(access: Access<P>, execution: AgentExecutionId): Promise<void>;
    failNextRecord?(access: Access<P>, execution: AgentExecutionId, fault: RecordFault): Promise<void>;
}
export declare function agentJournalEntriesConformance<P, B extends ContentBlock = ContentBlock>(fixture: AgentJournalEntriesFixture<P>, profile?: RequiredReceivedCommits<P, B>): readonly ConformanceCase[];
export declare function memoryAgentJournalEntriesFixture<P>(access: Access<P>, otherAccess: Access<P>): AgentJournalEntriesFixture<P> & Readonly<{
    double: MemoryAgentJournalEntries<P>;
}>;
```

## 声明文件 `testing-journal-finishing.d.ts`

```ts
import { type ConformanceCase } from './testing-case.ts';
import { type AgentJournalCoreFixture } from './testing-journal-helpers.ts';
export declare function finishingCases<P>(fixture: AgentJournalCoreFixture<P>): readonly ConformanceCase[];
```

## 声明文件 `testing-journal-helpers.d.ts`

```ts
import { type Message } from '@omne-harness/message';
import type { Outcome } from '@omne-harness/operation-result';
import type { AgentCheckpoint, Failure, ProducedResult, Reply } from './evaluation.ts';
import type { AcceptedInput, AgentEvent, CommandReceipt, ControlRecord, ExecutionSnapshot, FinishAuthorization, FinishIntent } from './execution.ts';
import type { CancellationPolicyInstallation, FinishCandidateContent, SettlementRequest, SettlementResult } from './finishing.ts';
import { type Access, type AgentExecutionId, type AgentOperationId, type Authority, type ConsumptionId, type DurableEvidence } from './identity.ts';
import type { AgentJournal, ExecutionHandoff, JournalCommit, OriginalInputAcceptance } from './journal.ts';
import type { HandoffOutcome, HandoffReference, HandoffResolution, Passage, PendingHandoff } from './passages.ts';
import type { TestHostRecord } from './testing-cancellation.ts';
export interface AgentJournalCoreOpened<P> {
    readonly journal: AgentJournal<P>;
    readonly access: Access<P>;
    readonly execution: AgentExecutionId;
    readonly receipt: CommandReceipt;
    readonly authority: Authority;
    readonly checkpoint: AgentCheckpoint;
    readonly acceptInput: (name: string) => Promise<AcceptedInput>;
    readonly produceResult?: (name: string) => Promise<Readonly<{
        result: ProducedResult;
        consumption: ConsumptionId;
        transfer: Parameters<AgentJournal<P>['recordResult']>[0]['transfer'];
    }>>;
    readonly faultNext?: (method: 'recordControl' | 'submit' | 'recordHandoff' | 'commit', outcome: 'applied' | 'dropped' | 'pending') => void;
    readonly takeover?: (name: string) => Promise<Authority>;
    readonly installation?: CancellationPolicyInstallation | null;
    readonly hostRecord?: (record: TestHostRecord) => Promise<DurableEvidence>;
    readonly seedLegacyCandidate?: (name: string) => Promise<Readonly<{
        candidate: AgentOperationId;
    }>>;
    readonly qualify?: (held: readonly SettlementQualification[]) => void;
}
export type SettlementQualification = 'settle' | 'migrate-cancellation' | 'reconcile';
export type AgentJournalCoreOpenOptions = Readonly<{
    cancellationPolicy?: 'installed' | 'absent';
}>;
export interface AgentJournalCoreFixture<P> {
    open(name: string, options?: AgentJournalCoreOpenOptions): Promise<AgentJournalCoreOpened<P>>;
}
export declare function identity<T>(decoded: Outcome<T, unknown>, what: string): T;
export declare const operation: (name: string) => AgentOperationId;
export declare const evidence: (record: string) => DurableEvidence;
export declare const PROVIDER: {
    owner: string;
    name: string;
    revision: string;
    digest: string;
};
export declare function message(text: string, suffix: string, role?: 'user' | 'assistant'): Message;
export declare function input(id: string, text?: string): AcceptedInput;
export declare function ok<T>(reply: Reply<T>, what: string): Promise<T>;
export declare function refused<T>(reply: Reply<T>, kind: Failure['kind'], what: string): Promise<Failure>;
export declare function notSuccessful<T>(reply: Reply<T>, what: string): Promise<void>;
export declare function load<P>(opened: AgentJournalCoreOpened<P>): Promise<ExecutionSnapshot>;
export declare function revision<P>(opened: AgentJournalCoreOpened<P>): Promise<number>;
export declare function events<P>(opened: AgentJournalCoreOpened<P>): Promise<readonly AgentEvent[]>;
export declare function query<P>(opened: AgentJournalCoreOpened<P>, id: AgentOperationId): Promise<Readonly<{
    kind: 'committed';
    receipt: CommandReceipt;
}> | Readonly<{
    kind: 'rejected';
    failure: Extract<Failure, {
        kind: 'conflict';
    }>;
    audit: DurableEvidence;
    revision: import("./identity.ts").ExecutionRevision;
}> | Readonly<{
    kind: 'excluded';
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'unknown';
}>>;
export declare function commitAt<P>(opened: AgentJournalCoreOpened<P>, snapshot: ExecutionSnapshot, name: string, authority?: Authority, overrides?: Partial<JournalCommit<P>>): JournalCommit<P>;
export declare function submitAcceptance<P>(opened: AgentJournalCoreOpened<P>, name: string, value: AcceptedInput, decision?: HandoffOutcome['decision']): OriginalInputAcceptance;
export declare function newSubmit<P>(opened: AgentJournalCoreOpened<P>, name: string, value: AcceptedInput): {
    principal: P;
    tenant: import("@omne-harness/legal-identity").TenantId;
    execution: AgentExecutionId;
    operation: AgentOperationId;
    value: Readonly<{
        id: import("./identity.ts").InputId;
        content: Message;
        source: DurableEvidence | null;
        priority: 'ordinary' | 'urgent';
    }>;
    lineage: {
        kind: 'new-input';
        original: Readonly<{
            entry: import("./passages.ts").InputEntry;
            handoff: Extract<HandoffReference, {
                kind: 'input';
            }>;
            outcome: HandoffOutcome;
        }>;
    };
};
export declare function recognizingSubmit<P>(opened: AgentJournalCoreOpened<P>, name: string, value: AcceptedInput, original: OriginalInputAcceptance): {
    principal: P;
    tenant: import("@omne-harness/legal-identity").TenantId;
    execution: AgentExecutionId;
    operation: AgentOperationId;
    value: Readonly<{
        id: import("./identity.ts").InputId;
        content: Message;
        source: DurableEvidence | null;
        priority: 'ordinary' | 'urgent';
    }>;
    lineage: {
        kind: 'recognize-input';
        original: Readonly<{
            entry: import("./passages.ts").InputEntry;
            handoff: Extract<HandoffReference, {
                kind: 'input';
            }>;
            outcome: HandoffOutcome;
        }>;
    };
};
export declare function pendingHandoff<P>(opened: AgentJournalCoreOpened<P>, snapshot: ExecutionSnapshot, name: string, predecessorHandoff?: PendingHandoff['predecessorHandoff']): PendingHandoff;
export declare function outcomeOf(request: PendingHandoff, decision: HandoffOutcome['decision']): HandoffOutcome;
export declare function prepared(request: PendingHandoff): HandoffOutcome;
export declare function excluded(request: PendingHandoff): Extract<HandoffResolution, {
    kind: 'excluded';
}>;
export declare function prepareCommit<P>(opened: AgentJournalCoreOpened<P>, snapshot: ExecutionSnapshot, name: string, request: PendingHandoff): JournalCommit<P>;
export declare function resolveCommit<P>(opened: AgentJournalCoreOpened<P>, snapshot: ExecutionSnapshot, name: string, outcome: HandoffOutcome, overrides?: Partial<JournalCommit<P>>): JournalCommit<P>;
export declare function handoffOf(snapshot: ExecutionSnapshot, reference: HandoffReference): ExecutionHandoff;
export declare function takeInputs<P>(opened: AgentJournalCoreOpened<P>, name?: string): Promise<void>;
export declare function cancelControl<P>(opened: AgentJournalCoreOpened<P>, name?: string): {
    principal: P;
    tenant: import("@omne-harness/legal-identity").TenantId;
    execution: AgentExecutionId;
    operation: AgentOperationId;
    command: {
        kind: 'cancel';
        reason: Readonly<{
            owner: string;
            record: string;
            revision: string;
            digest: string;
        }>;
    };
};
export declare function stage<P>(opened: AgentJournalCoreOpened<P>, name: string, target: AgentOperationId, which: 'intent-established' | 'qualification-revoked' | 'producer-confirmed' | 'physically-stopped' | 'duty-released', state?: 'reached' | 'unresolved', source?: Readonly<{
    owner: string;
    record: string;
    revision: string;
    digest: string;
}>): {
    principal: P;
    tenant: import("@omne-harness/legal-identity").TenantId;
    execution: AgentExecutionId;
    operation: AgentOperationId;
    target: AgentOperationId;
    stage: "duty-released" | "intent-established" | "physically-stopped" | "producer-confirmed" | "qualification-revoked";
    state: "reached" | "unresolved";
    source: Readonly<{
        owner: string;
        record: string;
        revision: string;
        digest: string;
    }>;
};
export declare function controlEvents(all: readonly AgentEvent[]): (readonly [
    AgentOperationId,
    import("./execution.ts").ControlStage,
    "reached" | "unresolved"
])[];
export declare function afterTerminalPassage(name: string): Passage;
export declare function advances<P>(opened: AgentJournalCoreOpened<P>, write: () => Promise<unknown>): Promise<readonly [
    number,
    number
]>;
export declare function candidateContent(snapshot: ExecutionSnapshot, name: string, overrides?: Partial<FinishCandidateContent>): FinishCandidateContent;
export declare function f1Commit<P>(opened: AgentJournalCoreOpened<P>, snapshot: ExecutionSnapshot, name: string, authority?: Authority, finish?: FinishCandidateContent): JournalCommit<P>;
export declare function f2Commit<P>(opened: AgentJournalCoreOpened<P>, snapshot: ExecutionSnapshot, name: string, authority?: Authority): JournalCommit<P>;
export declare function intentOf(snapshot: ExecutionSnapshot): FinishIntent;
export declare function candidateOf(snapshot: ExecutionSnapshot): AgentOperationId;
export declare function advancement(authority: Authority): FinishAuthorization;
export declare function cancelAuthorization(snapshot: ExecutionSnapshot, control: AgentOperationId): Extract<FinishAuthorization, {
    kind: 'cancel';
}>;
export declare function controlOf(snapshot: ExecutionSnapshot, control: AgentOperationId): ControlRecord;
export declare function prepareInput<P>(opened: AgentJournalCoreOpened<P>, snapshot: ExecutionSnapshot, name: string, authorization?: FinishAuthorization, candidate?: AgentOperationId): {
    principal: P;
    tenant: import("@omne-harness/legal-identity").TenantId;
    execution: AgentExecutionId;
    operation: AgentOperationId;
    authorization: FinishAuthorization;
    expected: import("./identity.ts").ExecutionRevision;
    candidate: AgentOperationId;
};
export declare function finishInput<P>(opened: AgentJournalCoreOpened<P>, snapshot: ExecutionSnapshot, name: string, authorization?: FinishAuthorization, intent?: FinishIntent): {
    principal: P;
    tenant: import("@omne-harness/legal-identity").TenantId;
    execution: AgentExecutionId;
    operation: AgentOperationId;
    authorization: FinishAuthorization;
    expected: import("./identity.ts").ExecutionRevision;
    intent: Readonly<{
        candidate: AgentOperationId;
        conclusion: import("./evaluation.ts").AgentConclusion;
        inputWatermark: DurableEvidence;
        obligations: DurableEvidence | null;
        beforeTerminal: DurableEvidence | null;
        failure: import("./evaluation.ts").FailureCandidate | null;
    }>;
};
export declare function failedContent(name: string): Partial<FinishCandidateContent>;
export declare function prepareOrdinaryEnd<P>(opened: AgentJournalCoreOpened<P>, name: string, authority?: Authority, content?: Partial<FinishCandidateContent>): Promise<ExecutionSnapshot>;
export declare function end<P>(opened: AgentJournalCoreOpened<P>, name?: string, authority?: Authority, content?: Partial<FinishCandidateContent>): Promise<CommandReceipt>;
export declare function settlement<P, K extends SettlementRequest<P>['kind']>(opened: AgentJournalCoreOpened<P>, name: string, body: Omit<Extract<SettlementRequest<P>, {
    kind: K;
}>, keyof Access<P> | 'execution' | 'operation'>): Extract<SettlementRequest<P>, {
    kind: K;
}>;
export declare function installationOf<P>(opened: AgentJournalCoreOpened<P>): CancellationPolicyInstallation;
export declare function requireInstallation<P>(opened: AgentJournalCoreOpened<P>): Promise<boolean>;
export declare function effectiveCancel<P>(opened: AgentJournalCoreOpened<P>, name?: string): Promise<AgentOperationId>;
export declare function establish<P>(opened: AgentJournalCoreOpened<P>, control: AgentOperationId, name?: string): Promise<Extract<SettlementResult, {
    kind: 'establish-cancellation';
}>>;
export declare function judge<P>(opened: AgentJournalCoreOpened<P>, control: AgentOperationId, name?: string): Promise<Extract<SettlementResult, {
    kind: 'judge-cancellation';
}>>;
export declare function endCancelled<P>(opened: AgentJournalCoreOpened<P>, control: AgentOperationId, name?: string, options?: Readonly<{
    establish?: boolean;
}>): Promise<CommandReceipt>;
```

## 声明文件 `testing-journal-samples.d.ts`

```ts
import type { TenantId } from '@omne-harness/legal-identity';
import type { ReceivedEntry, StartFenceEntry } from './receiving.ts';
export declare function sampleStartFence(name: string): StartFenceEntry;
export declare function sampleReceivedModelResult(tenant: TenantId, name: string, dispatchRevision?: string): ReceivedEntry;
export declare function sampleReceivedModelAccount(tenant: TenantId, name: string, revision?: string): ReceivedEntry;
export declare function sampleReceivedToolAccount(tenant: TenantId, name: string, lexeme?: string): ReceivedEntry;
```

## 声明文件 `testing-received-conformance.d.ts`

```ts
import type { ContentBlock } from '@omne-harness/content-block';
import type { AgentJournalEntriesFixture } from './testing-journal-entries.ts';
import type { RequiredReceivedCommits } from './testing-received-fixture.ts';
import { type ConformanceCase } from './testing-case.ts';
export declare function receivedCommitConformance<P, B extends ContentBlock>(fixture: AgentJournalEntriesFixture<P>, profile: RequiredReceivedCommits<P, B>): readonly ConformanceCase[];
```

## 声明文件 `testing-received-fixture.d.ts`

```ts
import type { ContentBlock } from '@omne-harness/content-block';
import type { Access, AgentExecutionId, DurableEvidence } from './identity.ts';
import type { ExecutionMutation } from './execution.ts';
import type { AgentJournal } from './journal.ts';
import type { AgentMaterials, Material } from './passages.ts';
import type { AgentJournalEntries, AgentReceivedCommits, ReceivedCommitInput } from './receiving.ts';
export interface ReceivedCommitFixture<P, B extends ContentBlock> {
    readonly entries: AgentJournalEntries<P>;
    readonly received: AgentReceivedCommits<P, B>;
    readonly materials: AgentMaterials<P, B>;
    readonly journal: Pick<AgentJournal<P>, 'query'>;
    bind(input: ReceivedCommitInput<P, B>): Promise<void>;
    material(name: string): Material<B>;
    inspect(access: Access<P>, execution: AgentExecutionId): Promise<Readonly<{
        revision: number;
        materials: number;
        entries: number;
    }>>;
    pause(input: ExecutionMutation<P>): Readonly<{
        reached: Promise<DurableEvidence>;
        release(): void;
    }>;
    fault(input: ExecutionMutation<P>, point: 'before-publish' | 'after-publish'): void;
    exclude(input: ReceivedCommitInput<P, B>, evidence: DurableEvidence): Promise<void>;
    qualify(access: Access<P>, execution: AgentExecutionId, status: 'allowed' | 'denied' | 'unavailable'): void;
    retainSaved(input: ExecutionMutation<P>, saved: DurableEvidence): void;
    loseMaterial(source: DurableEvidence): void;
}
export type RequiredReceivedCommits<P, B extends ContentBlock> = Readonly<{
    received: 'required';
    joint: ReceivedCommitFixture<P, B>;
}>;
```

## 声明文件 `testing-received-material.d.ts`

```ts
import { z } from 'zod';
export declare const materialShape: z.ZodType<unknown>;
```

## 声明文件 `testing-received-memory.d.ts`

```ts
import type { ContentBlock } from '@omne-harness/content-block';
import { type Access } from './identity.ts';
import type { AgentJournalEntriesFixture } from './testing-journal-entries.ts';
import type { ReceivedCommitFixture } from './testing-received-fixture.ts';
export declare function memoryReceivedCommitFixture<P, B extends ContentBlock = ContentBlock>(access: Access<P>, otherAccess: Access<P>): AgentJournalEntriesFixture<P> & Readonly<{
    durability: 'none';
    joint: ReceivedCommitFixture<P, B>;
}>;
```

## 声明文件 `testing-received-state.d.ts`

```ts
import type { ContentBlock } from '@omne-harness/content-block';
import type { Outcome } from '@omne-harness/operation-result';
import type { Failure } from './evaluation.ts';
import type { AgentEvent, CommandReceipt, ExecutionMutation } from './execution.ts';
import { type Authority, type AgentExecutionId, type DurableEvidence } from './identity.ts';
import type { Material } from './passages.ts';
import type { AgentJournalEntry, ReceivedCommitInput, ReceivedCommitValue, ReceivedEntry } from './receiving.ts';
import type { RecordFault } from './testing-journal-entries.ts';
export type KeptOperation = {
    kind: 'record';
    text: string;
    receipt: CommandReceipt;
    entry: AgentJournalEntry;
} | {
    kind: 'received';
    text: string;
    value: ReceivedCommitValue;
} | {
    kind: 'excluded';
    text: string;
    evidence: DurableEvidence;
};
export type KeptDelivery = {
    entry: ReceivedEntry;
    receipt: CommandReceipt;
    saved: DurableEvidence | null;
};
export type MemoryExecution = {
    authority: Authority;
    detached: boolean;
    ended: boolean;
    revision: number;
    entries: AgentJournalEntry[];
    events: AgentEvent[];
    operations: Map<string, KeptOperation>;
    qualifications: Map<unknown, 'allowed' | 'denied' | 'unavailable'>;
    recordFaults: RecordFault[];
};
export type KeptMaterial<B extends ContentBlock> = {
    tenant: string;
    execution: AgentExecutionId;
    value: Material<B>;
};
export declare const executionKey: <P>(input: Pick<ExecutionMutation<P>, 'tenant' | 'execution'>) => string;
export declare const operationKey: <P>(input: ExecutionMutation<P>) => string;
export declare const deliveryKey: (entry: Omit<ReceivedEntry, 'material'>) => string;
export declare const semanticText: <P, B extends ContentBlock>(input: ReceivedCommitInput<P, B>) => string;
export declare const recordText: (entry: AgentJournalEntry, authority: Authority | null) => string;
export declare const conflict: <P>(input: ExecutionMutation<P>) => Failure;
export declare const unavailable: (diagnostic: string) => Failure;
export declare const denied: () => Failure;
export declare function identity<T>(result: Outcome<T, unknown>): T;
export declare function receiptOf<P>(state: MemoryExecution, input: ExecutionMutation<P>): CommandReceipt;
export declare function sourceOf<P, B extends ContentBlock>(input: ReceivedCommitInput<P, B>): DurableEvidence;
export declare function mutationFailure<P>(input: ExecutionMutation<P>): Failure | null;
export declare function receivedFailure<P, B extends ContentBlock>(input: ReceivedCommitInput<P, B>): Failure | null;
```

## 声明文件 `testing.d.ts`

```ts
export type { ConformanceCase } from './testing-case.ts';
export { agentJournalEntriesConformance, createMemoryAgentJournalEntries, memoryAgentJournalEntriesFixture, sampleReceivedModelAccount, sampleReceivedModelResult, sampleReceivedToolAccount, sampleStartFence, type AgentJournalEntriesFixture, type MemoryAgentJournalEntries, type RecordFault, } from './testing-journal-entries.ts';
export { agentAccountOutletConformance, createMemoryAgentAccountOutlet, memoryAgentAccountOutletFixture, sampleAccountHandoff, type AgentAccountOutletFixture, type MemoryAgentAccountOutlet, } from './testing-account-outlet.ts';
export { agentJournalCoreConformance, type AgentJournalCoreFixture, type AgentJournalCoreOpenOptions, type AgentJournalCoreOpened, type SettlementQualification, } from './testing-journal-core.ts';
export { createTestCancellationPolicy, TEST_CANCELLATION_IMPLEMENTATION, TEST_CANCELLATION_INPUT_SCHEMA, TEST_CANCELLATION_POLICY, testCancellationPolicyInstallation, type TestHostRecord, } from './testing-cancellation.ts';
export { memoryReceivedCommitFixture } from './testing-received-memory.ts';
export type { ReceivedCommitFixture, RequiredReceivedCommits } from './testing-received-fixture.ts';
```
