# @omne-harness/agent-contract 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `AGENT_IDENTITY_MAX_LENGTH` · `identity.d.ts`
- `ATTRIBUTE_ITEMS` · `definition.d.ts`
- `AcceptedInput` · `execution.d.ts`
- `Access` · `identity.d.ts`
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
- `Adoption` · `identity.d.ts`
- `AdvancementFact` · `evaluation.d.ts`
- `AgentAccessCheck` · `execution.d.ts`
- `AgentAccessDecision` · `execution.d.ts`
- `AgentAccessOperation` · `execution.d.ts`
- `AgentAccessTarget` · `execution.d.ts`
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
- `AgentJournalFinishing` · `journal.d.ts`
- `AgentJournalObservation` · `journal.d.ts`
- `AgentJournalReading` · `journal.d.ts`
- `AgentJournalRecording` · `journal.d.ts`
- `AgentMaterials` · `passages.d.ts`
- `AgentObservation` · `execution.d.ts`
- `AgentOperationId` · `identity.d.ts`
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
- `CapabilityRef` · `definition.d.ts`
- `CapturedRead` · `passages.d.ts`
- `CardAnswer` · `passages.d.ts`
- `CardOption` · `extensions.d.ts`
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
- `ConsumerRef` · `identity.d.ts`
- `ConsumptionId` · `identity.d.ts`
- `ContextContent` · `request.d.ts`
- `Continuation` · `identity.d.ts`
- `ControlRecord` · `execution.d.ts`
- `ControlStage` · `execution.d.ts`
- `ControlStageFact` · `execution.d.ts`
- `CurrentConditions` · `request.d.ts`
- `DecisionCardDraft` · `extensions.d.ts`
- `DecisionCards` · `passages.d.ts`
- `Dimension` · `extensions.d.ts`
- `EffectIntent` · `journal.d.ts`
- `ErrorPolicy` · `extensions.d.ts`
- `EventPage` · `execution.d.ts`
- `Evidence` · `identity.d.ts`
- `ExecutionAttachmentId` · `identity.d.ts`
- `ExecutionControl` · `execution.d.ts`
- `ExecutionMutation` · `execution.d.ts`
- `ExecutionRevision` · `identity.d.ts`
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
- `FinishIntent` · `execution.d.ts`
- `FinishResult` · `execution.d.ts`
- `GuardFact` · `evaluation.d.ts`
- `GuardLevel` · `evaluation.d.ts`
- `HandoffResult` · `passages.d.ts`
- `IdentityFailure` · `identity.d.ts`
- `InputBatch` · `evaluation.d.ts`
- `InputBatchId` · `identity.d.ts`
- `InputId` · `identity.d.ts`
- `JournalCapabilities` · `journal.d.ts`
- `JournalCommit` · `journal.d.ts`
- `Judgment` · `judgment.d.ts`
- `LoopExtensionDeclaration` · `extensions.d.ts`
- `LoopExtensionImplementation` · `extensions.d.ts`
- `LoopFacts` · `evaluation.d.ts`
- `Material` · `passages.d.ts`
- `MessageHandoff` · `passages.d.ts`
- `MessageSource` · `passages.d.ts`
- `ModelContextRead` · `request.d.ts`
- `ModelContextReader` · `request.d.ts`
- `ModelPurpose` · `evaluation.d.ts`
- `ModelRecipient` · `request.d.ts`
- `ModelReplyAdmission` · `evaluation.d.ts`
- `ModelSelection` · `request.d.ts`
- `Next` · `evaluation.d.ts`
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
- `RefusalReason` · `judgment.d.ts`
- `RegisteredReads` · `passages.d.ts`
- `Registration` · `execution.d.ts`
- `RegistrationState` · `execution.d.ts`
- `Reply` · `evaluation.d.ts`
- `ReplyAdmissionPage` · `evaluation.d.ts`
- `ReplyAdmissionProjection` · `evaluation.d.ts`
- `RequestPreparation` · `request.d.ts`
- `ResultResponsibility` · `execution.d.ts`
- `RuntimeConditions` · `evaluation.d.ts`
- `SelectedModel` · `request.d.ts`
- `StepId` · `identity.d.ts`
- `StructureFailure` · `identity.d.ts`
- `Subject` · `passages.d.ts`
- `TerminalObservation` · `execution.d.ts`
- `UnavailabilityPolicy` · `extensions.d.ts`
- `VersionChoice` · `definition.d.ts`
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
- `judgeLoopExtensions` · `judge-extensions.d.ts`

## 声明文件 `body-contract.d.ts`

```ts
import { type BodyContract } from '@omne-harness/assets';
export declare function agentBodyContract(): BodyContract;
```

## 声明文件 `check.d.ts`

```ts
import { type JsonLimits } from '@omne-harness/json-text';
import { type SchemaIssue, type SchemaProvider } from '@omne-harness/schema-provider';
import type { z } from 'zod';
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
export type VersionChoice = {
    readonly kind: 'pinned';
    readonly version: string;
} | {
    readonly kind: 'then-legal-winner';
};
export type AgentDefinition = {
    readonly category: 'AgentDefinition';
    readonly name: string;
    readonly version: VersionChoice;
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
import type { Adoption, ActionBatchId, ActionId, AgentInstant, AgentOperationId, CardRoundId, ConsumerRef, ConsumptionId, Continuation, Evidence, InputBatchId, InputId, PassageId, StepId } from './identity.ts';
import type { MessageSource, Passage } from './passages.ts';
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
    source: Evidence;
}>;
export type InputBatch = Readonly<{
    id: InputBatchId;
    watermark: Evidence;
    ordered: readonly InputId[];
}>;
export type ProgressionDirective = Readonly<{
    kind: 'evaluate-completion';
    basis: Evidence;
}> | Readonly<{
    kind: 'continue';
    basis: Evidence;
}>;
export type Waiting = Readonly<{
    kind: 'producer';
    pending: PendingCall;
}> | Readonly<{
    kind: 'human';
    passage: PassageId;
    cards: readonly Evidence[];
}> | Readonly<{
    kind: 'dependency';
    owner: string;
    position: string;
}>;
export type AgentConclusion = Readonly<{
    kind: 'complete';
}> | Readonly<{
    kind: 'fail' | 'cancelled';
    cause: Evidence;
}>;
export type FailureCandidate = Readonly<{
    step: StepId | null;
    at: AgentInstant;
    source: Evidence;
}> & (Readonly<{
    kind: 'cannot-fit';
    reason: 'fixed' | 'after-compaction';
    context: Evidence;
    veto?: Evidence;
    rejection?: Evidence;
    plan?: CompactionProgress;
}> | Readonly<{
    kind: 'compaction-invalid';
    plan: Evidence;
    progress?: Readonly<{
        expected: CompactionProgress;
        returned: CompactionProgress;
    }>;
    transition?: Evidence;
}> | Readonly<{
    kind: 'request-rejected';
    failure: Extract<Failure, {
        kind: 'invalid';
    }>;
    model: Evidence;
    selection: Evidence;
}> | Readonly<{
    kind: 'no-reply';
    call: M.ModelCallId;
    result: ProducedResult;
}> | Readonly<{
    kind: 'message-rejected';
    from: MessageSource;
    evidence: Evidence;
}> | Readonly<{
    kind: 'extension-stop';
    passage: PassageId;
    reason: string;
}> | Readonly<{
    kind: 'guard';
    level: 3;
    basis: Evidence;
}>);
export type PreparedContextTransition = Readonly<{
    preparation: ActionId;
    message: Message;
    source: Evidence;
    derivation: Evidence;
    commitment: Evidence;
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
    fixed: Evidence;
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
    cards: readonly Evidence[];
}> | Readonly<{
    kind: 'denied';
    evidence: Evidence;
}> | Readonly<{
    kind: 'allowed';
    evidence: Evidence;
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
    evidence: Evidence;
    approved: readonly [
        ActionId,
        ...ActionId[]
    ];
}> | Readonly<{
    kind: 'all-denied';
    evidence: Evidence;
}>;
export type ActionSlot = Readonly<{
    action: ActionId;
    each: readonly PassageId[] | null;
    candidate: Message | null;
    handoff: Evidence | null;
}> & (Readonly<{
    kind: 'denied';
    evidence: Evidence;
}> | Readonly<{
    kind: 'dispatched';
}> | Readonly<{
    kind: 'result';
    result: ProducedResult;
    terminal: T.ToolTerminal;
    custody: Evidence;
}> | Readonly<{
    kind: 'background';
    placeholder: ProducedResult;
    confirmation: Evidence;
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
    source: Evidence;
}>;
export type ReplyAdmissionProjection = Readonly<{
    through: Evidence;
    rule: Adoption;
    lastAdmission: Evidence | null;
    consecutiveDenials: string;
    totalDenials: string;
}>;
export type ReplyAdmissionPage = Readonly<{
    kind: 'page';
    through: Evidence;
    items: readonly Readonly<{
        sequence: string;
        fact: ModelReplyAdmission;
    }>[];
    next: string | null;
    complete: boolean;
}> | Readonly<{
    kind: 'gap';
    recovery: Evidence;
}>;
export type GuardLevel = 0 | 1 | 2 | 3;
export type GuardFact = Readonly<{
    level: GuardLevel;
    policy: Adoption;
    through: Evidence;
    basis: Evidence;
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
    adoptedContext: Evidence | null;
    guard: GuardFact | null;
    completedPassages: readonly PassageId[];
    priorConditions: Evidence | null;
}>;
export type RuntimeConditions = Readonly<{
    source: Evidence;
    configuration: Adoption;
    progression: ProgressionDirective;
    model: Adoption;
    context: Evidence;
    bindings: readonly Adoption[];
}>;
export type ProducerDecisionView = Readonly<{
    kind: 'unresolved';
    pending: PendingCall;
    source: Evidence;
}> | Readonly<{
    kind: 'model-active';
    pending: Extract<PendingCall, {
        kind: 'model';
    }>;
    source: Evidence;
}> | Readonly<{
    kind: 'model-settled';
    pending: Extract<PendingCall, {
        kind: 'model';
    }>;
    result: ProducedResult;
    source: Evidence;
}> | Readonly<{
    kind: 'tool-active';
    pending: Extract<PendingCall, {
        kind: 'tool';
        association: 'associated';
    }>;
    source: Evidence;
    waiting: 'none' | 'external' | 'human';
    supportedControls: readonly ('interrupt' | 'background')[];
}> | Readonly<{
    kind: 'tool-result';
    pending: Extract<PendingCall, {
        kind: 'tool';
        association: 'associated';
    }>;
    result: ProducedResult;
    source: Evidence;
}> | Readonly<{
    kind: 'tool-background';
    pending: Extract<PendingCall, {
        kind: 'tool';
        association: 'associated';
    }>;
    placeholder: ProducedResult;
    confirmation: Evidence;
    source: Evidence;
}>;
export type AdvancementFact = Readonly<{
    kind: 'current' | 'stopping' | 'ended' | 'superseded';
    source: Evidence;
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
        consumed: Evidence;
    }> | null;
}> | Readonly<{
    kind: 'commit-transition';
    value: PreparedContextTransition;
}> | Readonly<{
    kind: 'resume-request';
    original: Extract<Preparation, {
        kind: 'needs-compaction';
    }>;
    transition: Evidence;
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
import type { JsonValue } from '@omne-harness/json-text';
import type { Message } from '@omne-harness/message';
import type * as M from '@omne-harness/model-contract';
import type { Outcome } from '@omne-harness/operation-result';
import type * as T from '@omne-harness/tool-contract';
import type { AgentDefinition } from './definition.ts';
import type { AgentCheckpoint, AgentConclusion, AgentEvaluator, Failure, FailureCandidate, InputBatch, ProducedResult, Reply, ReplyAdmissionProjection, Waiting } from './evaluation.ts';
import type { LoopExtensionDeclaration } from './extensions.ts';
import type { Access, Adoption, AgentExecutionId, AgentInstanceId, AgentInstant, AgentOperationId, AgentRegistrationId, Authority, ConsumptionId, Continuation, Evidence, ExecutionAttachmentId, ExecutionRevision, InputId, PassageId } from './identity.ts';
import type { EffectIntent } from './journal.ts';
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
    handoff: Evidence;
}> | Readonly<{
    kind: 'ended';
    conclusion: AgentConclusion;
    disposition: Evidence;
}>;
export type ExecutionSnapshot = Readonly<{
    execution: AgentExecutionId;
    revision: ExecutionRevision;
    state: ExecutionState;
    checkpoint: AgentCheckpoint;
    inputWatermark: Evidence;
    history: Evidence;
    replyAdmissions: ReplyAdmissionProjection;
    executionAttachment: Authority | null;
    unresolved: readonly AgentOperationId[];
    controls: readonly ControlRecord[];
    results: readonly ResultResponsibility[];
    effects: readonly EffectIntent[];
    terminalObservations: readonly TerminalObservation[];
    output: Readonly<{
        emittedThrough: string | null;
        acknowledgedThrough: string | null;
    }>;
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
    source: Evidence | null;
    priority: 'ordinary' | 'urgent';
}>;
export type TerminalObservation = Readonly<{
    terminal: Evidence;
    passage: PassageId;
    implementation: Adoption;
    observed: Evidence | null;
}>;
export type FinishIntent = Readonly<{
    conclusion: AgentConclusion;
    inputWatermark: Evidence;
    obligations: Evidence;
    beforeTerminal: Evidence | null;
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
    source: Evidence;
}>;
export type FinishAuthorization = Readonly<{
    kind: 'advancement';
    authority: Authority;
}> | Readonly<{
    kind: 'cancel';
    control: AgentOperationId;
    source: Evidence;
}>;
export type ExecutionControl = Readonly<{
    kind: 'interrupt-model';
    call: M.ModelCallId;
    reason: Evidence;
}> | Readonly<{
    kind: 'interrupt-tool' | 'background-tool';
    call: T.ToolCallId;
    reason: Evidence;
}> | Readonly<{
    kind: 'cancel';
    reason: Evidence;
}> | Readonly<{
    kind: 'suspend';
    reason: Evidence;
}>;
export type ControlStage = 'accepted' | 'intent-established' | 'qualification-revoked' | 'producer-confirmed' | 'physically-stopped' | 'duty-released';
export type ControlStageFact = Readonly<{
    state: 'reached' | 'unresolved';
    source: Evidence;
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
    custody: Evidence | null;
    completion: Evidence | null;
    release: Readonly<{
        kind: 'pending';
    }> | Readonly<{
        kind: 'confirmed';
        receipt: Evidence;
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
    evidence: Evidence;
    state: 'accepted' | 'applied' | 'unresolved';
}>;
export type AgentEventBody = Readonly<{
    kind: 'input-taken';
    batch: InputBatch;
}> | Readonly<{
    kind: 'message';
    message: Message;
    source: Evidence;
}> | Readonly<{
    kind: 'producer';
    result: ProducedResult;
    consumption: ConsumptionId;
}> | Readonly<{
    kind: 'stream';
    producer: ProducedResult['producer'];
    cursor: string;
    source: Evidence;
    schema: Adoption;
    value: JsonValue;
}> | Readonly<{
    kind: 'waiting';
    waits: readonly Waiting[];
}> | Readonly<{
    kind: 'control';
    operation: AgentOperationId;
    stage: ControlStage;
    state: 'reached' | 'unresolved';
    source: Evidence;
}> | Readonly<{
    kind: 'ended';
    conclusion: AgentConclusion;
    disposition: Evidence;
}>;
export type AgentEvent = Readonly<{
    execution: AgentExecutionId;
    sequence: string;
    executionAttachment: ExecutionAttachmentId;
    schema: Adoption;
    cause: Evidence;
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
    recovery: Evidence;
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
        receipt: Evidence | null;
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
        grant: Evidence | null;
    }>): Reply<AgentExecutionHandle<P>>;
    resume(input: ExecutionMutation<P> & Readonly<{
        recovery: Evidence;
        grant: Evidence | null;
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
        kind: 'excluded';
        evidence: Evidence;
    }> | Readonly<{
        kind: 'unknown';
    }>>;
    load(input: Access<P> & Readonly<{
        execution: AgentExecutionId;
    }>): Reply<ExecutionSnapshot>;
    reconcile(input: ExecutionMutation<P>): Reply<Readonly<{
        remaining: readonly ConsumptionId[];
        evidence: Evidence;
    }>>;
    detach(input: ExecutionMutation<P> & Readonly<{
        authority: Authority;
        reason: Evidence;
    }>): Reply<Evidence>;
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
        evidence: Evidence;
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
        reason: Evidence;
    }>): Reply<Registration | null>;
}
export interface AgentInstanceHost<P> {
    reserve(input: Access<P> & Readonly<{
        operation: AgentOperationId;
        scope: Evidence;
        definition: Adoption;
    }>): Reply<Readonly<{
        instance: AgentInstanceId;
        registration: AgentRegistrationHandle<P>;
    }>>;
    publish(input: Access<P> & Readonly<{
        operation: AgentOperationId;
        instance: AgentInstanceId;
        scope: Evidence;
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
    evidence: Evidence;
}>;
export interface AgentRuntimeControl<P> {
    quiesce(input: Access<P> & Readonly<{
        operation: AgentOperationId;
        reason: Evidence;
    }>): Reply<QuiesceResult>;
}
export type AgentAccessOperation = 'invoke' | 'resume' | 'submit' | 'control' | 'read' | 'events' | 'acknowledge' | 'takeover' | 'observe' | 'resolve' | 'connect' | 'reserve' | 'publish' | 'withdraw' | 'quiesce' | 'query' | 'load' | 'reconcile' | 'detach' | 'record-terminal-observation';
export type AgentAccessTarget = Readonly<{
    kind: 'scope';
    scope: Evidence;
    definition: Adoption;
}> | Readonly<{
    kind: 'instance';
    instance: AgentInstanceId;
}> | Readonly<{
    kind: 'execution';
    instance: AgentInstanceId;
    execution: AgentExecutionId;
}>;
export type AgentAccessDecision = Readonly<{
    kind: 'allowed';
    evidence: Evidence;
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
import type { ActionId, Adoption, AgentExecutionId, AgentInstant, CardRoundId, Evidence, PassageId } from './identity.ts';
import type { CardAnswer, Subject } from './passages.ts';
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
export type LoopExtensionDeclaration = Readonly<{
    name: string;
    position: Position;
    dimension?: Dimension;
    power: Power;
    needs?: readonly [
        string,
        ...string[]
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
        notBefore: AgentInstant | null;
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
            card: Evidence;
            response: Readonly<{
                evidence: Evidence;
                answer: CardAnswer;
            }> | null;
        }>[];
    }>[];
    control: 'valid' | 'replayInconsistent' | 'unavailable';
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
}>;
export interface LoopExtensionImplementation {
    readonly implementation: Adoption;
    invoke(input: ExtensionInput, signal: AbortSignal, mode: ExtensionInvocationMode): Promise<ExtensionInvocationResult>;
}
```

## 声明文件 `identity.d.ts`

```ts
import { type TenantId } from '@omne-harness/legal-identity';
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
export type Adoption = Readonly<{
    owner: string;
    name: string;
    revision: string;
    digest: string;
}>;
export type Evidence = Readonly<{
    owner: string;
    record: string;
    revision: string;
    digest: string;
}>;
export type Access<P> = Readonly<{
    principal: P;
    tenant: TenantId;
}>;
export type ConsumerRef = Readonly<{
    owner: string;
    work: string;
    position: string;
    purpose: string;
}>;
export type Authority = Readonly<{
    execution: AgentExecutionId;
    executionAttachment: ExecutionAttachmentId;
    instance: AgentInstanceId;
    generation: string;
    source: Evidence;
}>;
export type Continuation = Readonly<{
    position: string;
    definition: Adoption;
    schema: Adoption;
    value: JsonValue;
}>;
export type AgentInstant = string;
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
export declare function judgeEvidence(value: unknown): Outcome<Evidence, StructureFailure>;
export declare function judgeAccess<P>(value: unknown, judgePrincipal: (value: unknown) => Outcome<P, StructureFailure>): Outcome<Access<P>, StructureFailure>;
export declare function judgeAuthority(value: unknown): Outcome<Authority, StructureFailure>;
export {};
```

## 声明文件 `index.d.ts`

```ts
export { agentBodyContract } from './body-contract.ts';
export { ATTRIBUTE_ITEMS } from './definition.ts';
export { POSITIONS, POWERS } from './extensions.ts';
export { judgeAgentDefinition } from './judge-definition.ts';
export { judgeLoopExtensions } from './judge-extensions.ts';
export { judgeExtensionOutput, POSITION_OUTPUTS } from './judge-output.ts';
export type { ExtensionOutputJudgeInput, PositionOutputKey, PositionOutputs, } from './judge-output.ts';
export type { AgentDefinition, AssetReference, AttributeDeclaration, AttributeItem, CapabilityRef, VersionChoice, } from './definition.ts';
export { AGENT_IDENTITY_MAX_LENGTH, decodeActionBatchId, decodeActionId, decodeAgentExecutionId, decodeAgentInstanceId, decodeAgentOperationId, decodeAgentRegistrationId, decodeCardRoundId, decodeConsumptionId, decodeExecutionAttachmentId, decodeExecutionRevision, decodeInputBatchId, decodeInputId, decodePassageId, decodeStepId, judgeAccess, judgeAdoption, judgeAuthority, judgeEvidence, } from './identity.ts';
export type * from './evaluation.ts';
export type * from './execution.ts';
export type * from './extensions.ts';
export type * from './identity.ts';
export type * from './journal.ts';
export type * from './passages.ts';
export type * from './request.ts';
export type { BatchJudgment, Judgment, OutputRefusalReason, RefusalReason } from './judgment.ts';
```

## 声明文件 `journal.d.ts`

```ts
import type { ToolOperationRef } from '@omne-harness/tool-contract';
import type { Message } from '@omne-harness/message';
import type { AgentCheckpoint, InputBatch, ModelReplyAdmission, PendingCall, PreparedContextTransition, ProducedResult, Reply, ReplyAdmissionPage } from './evaluation.ts';
import type { AcceptedInput, AgentEventBody, AgentExecutionControl, AgentExecutionEvents, AgentExecutionInput, AgentExecutionRecovery, CommandReceipt, ControlStage, ExecutionMutation, ExecutionSnapshot, ExecutionState, FinishAuthorization, FinishIntent, FinishResult } from './execution.ts';
import type { Access, ActionId, Adoption, AgentExecutionId, AgentInstanceId, AgentOperationId, Authority, ConsumptionId, Evidence, ExecutionRevision, PassageId } from './identity.ts';
export type CallerCommit = Readonly<{
    kind: 'none';
}> | Readonly<{
    kind: 'message';
    message: Message;
    source: Evidence;
    admission: Evidence;
}> | Readonly<{
    kind: 'context-transition';
    value: PreparedContextTransition;
    admission: Evidence;
}> | Readonly<{
    kind: 'custody';
    result: ProducedResult;
    consumption: ConsumptionId;
    retained: Evidence;
}> | Readonly<{
    kind: 'processed';
    result: ProducedResult;
    consumption: ConsumptionId;
    completion: Evidence;
}>;
export type EffectIntent = Readonly<{
    action: ActionId;
    pending: PendingCall;
    authority: Authority;
}>;
export type JournalCommit<P> = ExecutionMutation<P> & Readonly<{
    authority: Authority;
    expected: ExecutionRevision;
    checkpoint: AgentCheckpoint;
    state: Exclude<ExecutionState, {
        kind: 'ended';
    }>;
    events: readonly Exclude<AgentEventBody, {
        kind: 'ended';
    }>[];
    effects: readonly EffectIntent[];
    caller: CallerCommit;
    replyAdmission: ModelReplyAdmission | null;
}>;
export interface AgentJournalAttachment<P> {
    open(input: ExecutionMutation<P> & Readonly<{
        instance: AgentInstanceId;
        grant: Evidence | null;
        initial: AcceptedInput;
        checkpoint: AgentCheckpoint;
    }>): Reply<Readonly<{
        receipt: CommandReceipt;
        authority: Authority;
    }>>;
    attach(input: ExecutionMutation<P> & Readonly<{
        instance: AgentInstanceId;
        grant: Evidence | null;
        recovery: Evidence;
        takeover: Evidence | null;
    }>): Reply<Readonly<{
        receipt: CommandReceipt;
        authority: Authority;
    }>>;
    detach(input: Parameters<AgentExecutionRecovery<P>['detach']>[0]): Reply<Evidence>;
}
export interface AgentJournalRecording<P> {
    commit(input: JournalCommit<P>): Reply<CommandReceipt>;
    submit(input: Parameters<AgentExecutionInput<P>['submit']>[0]): Reply<CommandReceipt>;
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
            receipt: Evidence;
        }>;
    }>): Reply<CommandReceipt>;
    recordControl(input: ExecutionMutation<P> & Readonly<{
        target: AgentOperationId;
        toolOperation?: ToolOperationRef;
        stage: Exclude<ControlStage, 'accepted'>;
        state: 'reached' | 'unresolved';
        source: Evidence;
    }>): Reply<CommandReceipt>;
}
export interface AgentJournalFinishing<P> {
    tryFinish(input: ExecutionMutation<P> & Readonly<{
        authorization: FinishAuthorization;
        expected: ExecutionRevision;
        intent: FinishIntent;
    }>): Reply<FinishResult>;
}
export interface AgentJournalObservation<P> {
    recordTerminalObservation(input: ExecutionMutation<P> & Readonly<{
        terminal: Evidence;
        passage: PassageId;
        implementation: Adoption;
        observed: Evidence;
    }>): Reply<CommandReceipt>;
}
export interface AgentJournalReading<P> {
    load(input: Access<P> & Readonly<{
        execution: AgentExecutionId;
    }>): Reply<ExecutionSnapshot>;
    inputs(input: Access<P> & Readonly<{
        execution: AgentExecutionId;
        watermark: Evidence;
    }>): Reply<Readonly<{
        batch: InputBatch;
        messages: readonly Message[];
    }>>;
    readReplyAdmissions(input: Access<P> & Readonly<{
        execution: AgentExecutionId;
        through: Evidence;
        after: string | null;
        limit: number;
    }>): Reply<ReplyAdmissionPage>;
    query(input: ExecutionMutation<P>): ReturnType<AgentExecutionRecovery<P>['query']>;
    readonly output: Pick<AgentExecutionEvents<P>, 'read' | 'events'>;
}
export type JournalCapabilities = Readonly<{
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
import type { Action, AgentConclusion, GuardFact, PendingCall, ProducedResult, Reply, PreparedContextTransition } from './evaluation.ts';
import type { Conclusion, DecisionCardDraft, Dimension, ExtensionInvocationMode, ExtensionOutput, LoopExtensionDeclaration, LoopExtensionImplementation, Position } from './extensions.ts';
import type { Access, Adoption, ActionBatchId, ActionId, AgentExecutionId, AgentOperationId, Authority, CardRoundId, ConsumerRef, Evidence, InputId, PassageId, StepId } from './identity.ts';
import type { CompactionProgress, Preparation } from './request.ts';
export type CapturedRead = Readonly<{
    schema: Adoption;
    value: JsonValue;
    source: Evidence;
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
    evidence: Evidence;
}> | Readonly<{
    kind: 'declined';
    evidence: Evidence;
}>;
export type CardReply = CardAnswer | Readonly<{
    kind: 'pending';
}> | Readonly<{
    kind: 'invalidated';
    evidence: Evidence;
}>;
export type PassageCard = Readonly<{
    identity: string;
    card: Evidence;
    response: Exclude<CardReply, {
        kind: 'pending';
    }> | null;
    processed: Evidence | null;
}>;
export type PassageOperationProgress<R> = Readonly<{
    kind: 'requested';
}> | Readonly<{
    kind: 'resolved';
    result: R;
}> | Readonly<{
    kind: 'applied';
    result: R;
    transition: Evidence;
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
    conclusion: Evidence;
}> | Readonly<{
    kind: 'present-failed';
    failure: Evidence;
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
    input: Evidence;
}> & (Readonly<{
    kind: 'producer';
    pending: Extract<PendingCall, {
        kind: 'model';
    }>;
    progress: PassageOperationProgress<Readonly<{
        result: ProducedResult;
        consumed: Evidence;
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
    transition: Evidence;
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
    input: Evidence;
    effective: Evidence;
    operations: readonly PassageOperation[];
    progress: PassageProgress;
}>;
export type Subject = Readonly<{
    execution: AgentExecutionId;
    conditions: Evidence;
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
        evidence: Evidence;
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
    basis: Evidence;
}> | Readonly<{
    terminal: AgentConclusion;
    disposition: Evidence;
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
        original: Evidence;
        requests: readonly CardRequest[];
    }>): Reply<readonly Evidence[]>;
    lookup(input: Access<P> & Readonly<{
        passage: PassageId;
        round: CardRoundId;
        original: Evidence;
        requests: readonly string[];
    }>): Reply<Readonly<{
        kind: 'presented';
        cards: readonly Evidence[];
    }> | Readonly<{
        kind: 'not-presented';
        exclusion: Evidence;
    }> | Readonly<{
        kind: 'unknown';
    }>>;
    read(input: Access<P> & Readonly<{
        card: Evidence;
    }>): Reply<CardReply>;
    invalidate(input: Access<P> & Readonly<{
        operation: AgentOperationId;
        passage: PassageId;
        round: CardRoundId;
        cards: readonly Evidence[];
        reason: Evidence;
    }>): Reply<readonly Readonly<{
        card: Evidence;
        reply: Exclude<CardReply, {
            kind: 'pending';
        }>;
    }>[]>;
}
export type AdmissionDecision = Readonly<{
    kind: 'allow';
    evidence: Evidence;
}> | Readonly<{
    kind: 'deny';
    reason: string;
    evidence: Evidence;
}> | Readonly<{
    kind: 'need-decision';
    card: DecisionCardDraft;
    evidence: Evidence;
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
        permissions: CapturedRead | null;
        decision: Readonly<{
            card: Evidence;
            answer: CardAnswer;
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
    evidence: Evidence;
}> | Readonly<{
    kind: 'reminder';
    passage: PassageId;
}> | Readonly<{
    kind: 'context-transition';
    transition: PreparedContextTransition;
}>;
export type HandoffResult = Readonly<{
    kind: 'accepted';
    admission: Evidence;
}> | Readonly<{
    kind: 'rejected';
    reason: string;
    evidence: Evidence;
}>;
export interface MessageHandoff<P> {
    accept(input: Access<P> & Readonly<{
        execution: AgentExecutionId;
        operation: AgentOperationId;
        advance: Authority | null;
        source: MessageSource;
        candidate: Message;
    }>): Reply<HandoffResult>;
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
    }>): Reply<Evidence>;
    read(input: Access<P> & Readonly<{
        source: Evidence;
    }>): Reply<Material<B>>;
}
export interface RegisteredReads<P> {
    read(input: Access<P> & Readonly<{
        action: ActionId;
        passage: PassageId;
        original: Evidence;
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
        original: Evidence;
    }>): Reply<Readonly<{
        kind: 'captured';
        value: CapturedRead;
    }> | Readonly<{
        kind: 'excluded';
        evidence: Evidence;
    }> | Readonly<{
        kind: 'unknown';
    }>>;
}
```

## 声明文件 `request.d.ts`

```ts
import type { JsonValue } from '@omne-harness/json-text';
import type * as M from '@omne-harness/model-contract';
import type { ModelPurpose, PreparedContextTransition, ProducedResult, InputBatch, RuntimeConditions, Reply } from './evaluation.ts';
import type { Access, Adoption, ActionId, Authority, ConsumerRef, Evidence, PassageId } from './identity.ts';
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
    tools: Evidence;
    evidence: Evidence;
}>;
export interface ModelSelection<P> {
    select(input: Access<P> & Readonly<{
        advance: Authority;
        scope: Evidence;
        purpose: ModelPurpose;
        position: ConsumerRef;
        history: Evidence;
        conditions: RuntimeConditions;
        alterations: readonly Evidence[];
    }>): Reply<SelectedModel>;
}
export type ContextContent = 'full' | 'incremental';
export type ModelContextRead = Readonly<{
    recipient: ModelRecipient;
    content: ContextContent;
    source: Evidence;
    coverage: Evidence;
}>;
export interface ModelContextReader<P> {
    read(input: Access<P> & Readonly<{
        advance: Authority;
        position: ConsumerRef;
        recipient: ModelRecipient;
        history: Evidence;
        adopted: Evidence | null;
        transition: Evidence | null;
    }>): Reply<ModelContextRead>;
}
export type CompactionProgress = Readonly<{
    plan: Evidence;
    bound: string;
    completed: string;
}>;
export type Preparation = Readonly<{
    id: ActionId;
    purpose: ModelPurpose;
    position: ConsumerRef;
    source: Evidence;
    state: JsonValue;
    schema: Adoption;
}> & (Readonly<{
    kind: 'assembled';
    input: M.AssembledModelInput;
    budget: Evidence;
    recipient: ModelRecipient;
    coverage: Evidence;
}> | Readonly<{
    kind: 'ready';
    request: M.FixedModelRequest;
    capacity: M.ResultCapacity;
    budget: Evidence;
    recipient: ModelRecipient;
    coverage: Evidence;
}> | Readonly<{
    kind: 'needs-compaction';
    original: Readonly<{
        input: Evidence;
        alterations: readonly Evidence[];
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
    coverage: Evidence;
    alterations: readonly Evidence[];
}>;
export interface RequestPreparation<P> {
    prepare(input: Access<P> & Readonly<{
        advance: Authority;
        action: ActionId;
        purpose: Exclude<ModelPurpose, 'compaction'>;
        position: ConsumerRef;
        history: Evidence;
        inputs: InputBatch;
        conditions: RuntimeConditions;
        selection: SelectedModel;
        context: ModelContextRead;
        previous: Preparation | null;
        alterations: readonly Evidence[];
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
            consumed: Evidence;
        }> | null;
    }>): Reply<CompactionAdvance>;
    resume(input: Access<P> & Readonly<{
        advance: Authority;
        original: Extract<Preparation, {
            kind: 'needs-compaction';
        }>;
        transition: Evidence;
        selection: SelectedModel;
        context: ModelContextRead;
    }>): Reply<Preparation>;
}
export interface CurrentConditions<P> {
    read(input: Access<P> & Readonly<{
        advance: Authority;
        previous: Evidence | null;
    }>): Reply<RuntimeConditions>;
}
```
