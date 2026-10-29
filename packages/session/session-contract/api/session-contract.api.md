# @omne-harness/session-contract 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `AdmittedMessage` · `faces.d.ts`
- `Adoption` · 包 `@omne-harness/exchange-refs`
- `AdvanceClaim` · `judgments.d.ts`
- `AdvanceJudgment` · `judgments.d.ts`
- `AdvanceRef` · `identity.d.ts`
- `AgentDrivePort` · `ports.d.ts`
- `AgentInstanceRef` · `identity.d.ts`
- `AttemptId` · `identity.d.ts`
- `AutoArchivePolicy` · `values.d.ts`
- `BatchId` · `identity.d.ts`
- `BoundedClose` · `values.d.ts`
- `CallBinding` · `values.d.ts`
- `ClockSample` · `values.d.ts`
- `CommitReceipt` · `faces.d.ts`
- `CommittedBatch` · `judgments.d.ts`
- `Completion` · `faces.d.ts`
- `CompletionJudgment` · `judgments.d.ts`
- `ConsumerRef` · 包 `@omne-harness/exchange-refs`
- `Consumption` · `values.d.ts`
- `ConsumptionId` · `identity.d.ts`
- `ContextMaterial` · `values.d.ts`
- `ContextScopeBinding` · `values.d.ts`
- `Control` · `values.d.ts`
- `ControlIntent` · `values.d.ts`
- `ControlProgress` · `values.d.ts`
- `ControlScope` · `judgments.d.ts`
- `ControlTarget` · `values.d.ts`
- `DecideReads` · `judgments.d.ts`
- `Decision` · `judgments.d.ts`
- `DeclarationChange` · `values.d.ts`
- `DerivedMessage` · `values.d.ts`
- `DriveFailure` · `ports.d.ts`
- `DriveOperationElements` · `operations.d.ts`
- `DriveReceipt` · `ports.d.ts`
- `DriveReply` · `ports.d.ts`
- `DriveTarget` · `ports.d.ts`
- `DurableEvidence` · 包 `@omne-harness/exchange-refs`
- `EncodedEntry` · `judgments.d.ts`
- `EntryClass` · `faces.d.ts`
- `EntryId` · `identity.d.ts`
- `ExecutionHistoryBoundary` · `history-values.d.ts`
- `ExecutionRef` · `values.d.ts`
- `ExecutionStatus` · `ports.d.ts`
- `ExternalCompletion` · `faces.d.ts`
- `FreezeVerdict` · `values.d.ts`
- `GuardCommand` · `ports.d.ts`
- `HistoryEntry` · `faces.d.ts`
- `HistoryPage` · `faces.d.ts`
- `INITIALIZATION_PROTOCOL` · `initialization-schema.d.ts`
- `IdleCoverage` · `values.d.ts`
- `IdleJudgment` · `judgments.d.ts`
- `IdleObservation` · `values.d.ts`
- `InitialAdoption` · `values.d.ts`
- `InitializationAdoption` · `values.d.ts`
- `InitializationConsequence` · `values.d.ts`
- `InitializationFactReference` · `values.d.ts`
- `InitializationGuardFacts` · `values.d.ts`
- `InitializationGuardResult` · `values.d.ts`
- `InitializationPlanItem` · `values.d.ts`
- `InitializationRegistration` · `values.d.ts`
- `InitializationRequirement` · `values.d.ts`
- `InitializationResult` · `values.d.ts`
- `InitializationSource` · `values.d.ts`
- `InitializationSources` · `values.d.ts`
- `InitializationState` · `values.d.ts`
- `InputAdmissionBoundary` · `history-values.d.ts`
- `InputAdmissionMember` · `history-values.d.ts`
- `InputAdmissionPage` · `history-values.d.ts`
- `InputBatch` · `values.d.ts`
- `InputId` · `identity.d.ts`
- `ModelViewBasis` · `faces.d.ts`
- `ModelViewRead` · `faces.d.ts`
- `ModelViewRow` · `faces.d.ts`
- `Modes` · `values.d.ts`
- `Mutation` · `identity.d.ts`
- `MutationName` · `ports.d.ts`
- `OpenWork` · `judgments.d.ts`
- `OperationJudgment` · `judgments.d.ts`
- `OperationRecord` · `judgments.d.ts`
- `OperationResolution` · `faces.d.ts`
- `Participation` · `values.d.ts`
- `PendingReason` · `faces.d.ts`
- `ProducedResult` · `values.d.ts`
- `ProducerFact` · `faces.d.ts`
- `ProducerRef` · `values.d.ts`
- `RecoveryTask` · `values.d.ts`
- `ReduceResult` · `judgments.d.ts`
- `Relation` · `values.d.ts`
- `ReleasedScope` · `faces.d.ts`
- `Reply` · `faces.d.ts`
- `ResidentAdoption` · `values.d.ts`
- `ResidentKey` · `identity.d.ts`
- `ResidentReference` · `faces.d.ts`
- `ResidentTool` · `values.d.ts`
- `ResultConsumption` · `values.d.ts`
- `RouteJudgment` · `judgments.d.ts`
- `RoutedInput` · `values.d.ts`
- `RunExecution` · `values.d.ts`
- `RunId` · `identity.d.ts`
- `RunStartJudgment` · `judgments.d.ts`
- `RunState` · `values.d.ts`
- `RunTerminal` · `values.d.ts`
- `ScopeReleaseDisposition` · `values.d.ts`
- `ScopeReleasePort` · `ports.d.ts`
- `ScopeReleaseReadback` · `ports.d.ts`
- `SessionAccess` · `identity.d.ts`
- `SessionAttemptRecord` · `history-values.d.ts`
- `SessionBatchRecord` · `history-values.d.ts`
- `SessionBlockDeclaration` · `ports.d.ts`
- `SessionCallEntryReferences` · `work-entry-values.d.ts`
- `SessionCallRecord` · `call-values.d.ts`
- `SessionCallRegistration` · `call-values.d.ts`
- `SessionCallWait` · `call-values.d.ts`
- `SessionCallerClass` · `identity.d.ts`
- `SessionClock` · `ports.d.ts`
- `SessionCommand` · `ports.d.ts`
- `SessionContextInput` · `ports.d.ts`
- `SessionControlEntryReferences` · `work-entry-values.d.ts`
- `SessionCreation` · `values.d.ts`
- `SessionEvidenceBridge` · `ports.d.ts`
- `SessionExecutionPrefix` · `history-values.d.ts`
- `SessionFaces` · `faces.d.ts`
- `SessionFactBoundary` · `history-values.d.ts`
- `SessionFailure` · `faces.d.ts`
- `SessionFrozen` · `values.d.ts`
- `SessionHistory` · `faces.d.ts`
- `SessionHistoryIndex` · `history-values.d.ts`
- `SessionHistoryReads` · `history-values.d.ts`
- `SessionId` · `identity.d.ts`
- `SessionIdentity` · `identity.d.ts`
- `SessionIdentityBridge` · `ports.d.ts`
- `SessionIdleInput` · `ports.d.ts`
- `SessionInputAdmission` · `history-values.d.ts`
- `SessionInputScope` · `history-values.d.ts`
- `SessionInternalPrincipals` · `ports.d.ts`
- `SessionLogConsequence` · `projection.d.ts`
- `SessionLogObservation` · `projection.d.ts`
- `SessionLogRoot` · `history-values.d.ts`
- `SessionManagement` · `faces.d.ts`
- `SessionNotifier` · `ports.d.ts`
- `SessionOperationElements` · `operations.d.ts`
- `SessionOperationId` · `identity.d.ts`
- `SessionPrefixFact` · `history-values.d.ts`
- `SessionReconciliation` · `faces.d.ts`
- `SessionRevision` · `identity.d.ts`
- `SessionTakenRecord` · `history-values.d.ts`
- `SessionTransactionPort` · `ports.d.ts`
- `SessionWork` · `faces.d.ts`
- `SessionWorkEntryIndex` · `work-entry-values.d.ts`
- `StartedRun` · `faces.d.ts`
- `Waiting` · `values.d.ts`
- `WorkSnapshot` · `values.d.ts`
- `WorkspaceAttachment` · `values.d.ts`
- `commandDigest` · `decide.d.ts`
- `decide` · `decide.d.ts`
- `deriveDriveOperation` · `operations.d.ts`
- `deriveSessionOperation` · `operations.d.ts`
- `initializationRegistrationCommit` · `initialization-plan.d.ts`
- `judgeAdvance` · `judgments.d.ts`
- `judgeCompletion` · `judgments.d.ts`
- `judgeIdle` · `judgments.d.ts`
- `judgeRunStart` · `judgments.d.ts`
- `openWork` · `judgments.d.ts`
- `projectSessionLog` · `projection.d.ts`
- `reduce` · `reduce.d.ts`
- `resolveCascade` · `judgments.d.ts`
- `resolveControlScope` · `judgments.d.ts`
- `resolveOperation` · `judgments.d.ts`
- `routeInput` · `judgments.d.ts`
- `sessionModesBlock` · `block.d.ts`

## 入口 `./testing` · `testing.d.ts`

- `CaseVerdict` · `testing-case.d.ts`
- `ConformanceCase` · `testing-case.d.ts`
- `IdentityScript` · `testing-ports.d.ts`
- `MemoryAgentDrive` · `testing-providers.d.ts`
- `MemoryInitializationSource` · `testing-initialization-source.d.ts`
- `MemoryInitializationTransactions` · `testing-transactions.d.ts`
- `MemoryScopeRelease` · `testing-providers.d.ts`
- `MemorySessionClock` · `testing-ports.d.ts`
- `MemorySessionContextInput` · `testing-ports.d.ts`
- `MemorySessionEvidenceBridge` · `testing-ports.d.ts`
- `MemorySessionHistorySource` · `testing-history-source.d.ts`
- `MemorySessionIdleInput` · `testing-providers.d.ts`
- `MemorySessionLogTransactions` · `testing-transactions.d.ts`
- `MemorySessionNotifier` · `testing-providers.d.ts`
- `MemorySessionTransactionOptions` · `testing-transactions.d.ts`
- `MemorySessionTransactions` · `testing-transactions.d.ts`
- `NotApplicable` · `testing-case.d.ts`
- `ScriptedSessionIdentityBridge` · `testing-ports.d.ts`
- `SessionTransactionsFixture` · `testing-transactions.d.ts`
- `TESTING_OWNER` · `testing-values.d.ts`
- `adoptedInitializationFixture` · `testing-initialization.d.ts`
- `adoption` · `testing-values.d.ts`
- `agentDriveConformance` · `testing-provider-conformance.d.ts`
- `assertIndistinguishable` · `testing-case.d.ts`
- `assistantMessage` · `testing-values.d.ts`
- `conformanceCase` · `testing-case.d.ts`
- `createMemoryAgentDrive` · `testing-providers.d.ts`
- `createMemoryInitializationSource` · `testing-initialization-source.d.ts`
- `createMemoryScopeRelease` · `testing-providers.d.ts`
- `createMemorySessionClock` · `testing-ports.d.ts`
- `createMemorySessionContextInput` · `testing-ports.d.ts`
- `createMemorySessionEvidenceBridge` · `testing-ports.d.ts`
- `createMemorySessionHistorySource` · `testing-history-source.d.ts`
- `createMemorySessionIdleInput` · `testing-providers.d.ts`
- `createMemorySessionNotifier` · `testing-providers.d.ts`
- `createMemorySessionTransactions` · `testing-transactions.d.ts`
- `createScriptedSessionIdentityBridge` · `testing-ports.d.ts`
- `creation` · `testing-values.d.ts`
- `evidence` · `testing-values.d.ts`
- `expectKind` · `testing-case.d.ts`
- `guard` · `testing-values.d.ts`
- `handle` · `testing-case.d.ts`
- `initializationFixtureFacts` · `testing-initialization.d.ts`
- `initializationFixtureGuard` · `testing-initialization.d.ts`
- `inputId` · `testing-values.d.ts`
- `isNotApplicable` · `testing-case.d.ts`
- `memoryAccess` · `testing-values.d.ts`
- `memoryOtherAccess` · `testing-values.d.ts`
- `memorySessionTransactionsFixture` · `testing-transactions.d.ts`
- `mintEvidence` · `testing-values.d.ts`
- `operationId` · `testing-values.d.ts`
- `ordinaryInput` · `testing-values.d.ts`
- `pendingReasonsOf` · `testing-transactions.d.ts`
- `refused` · `testing-case.d.ts`
- `runConformanceCase` · `testing-case.d.ts`
- `scopeReleaseConformance` · `testing-provider-conformance.d.ts`
- `sessionClockConformance` · `testing-provider-conformance.d.ts`
- `sessionContextInputConformance` · `testing-provider-conformance.d.ts`
- `sessionEvidenceBridgeConformance` · `testing-provider-conformance.d.ts`
- `sessionId` · `testing-values.d.ts`
- `sessionIdentityBridgeConformance` · `testing-provider-conformance.d.ts`
- `sessionIdleInputConformance` · `testing-provider-conformance.d.ts`
- `sessionNotifierConformance` · `testing-provider-conformance.d.ts`
- `sessionTransactionsConformance` · `testing-transactions.d.ts`
- `shapeOf` · `testing-case.d.ts`
- `succeeded` · `testing-case.d.ts`
- `testingTenant` · `testing-values.d.ts`
- `testingWorkspace` · `testing-values.d.ts`
- `userMessage` · `testing-values.d.ts`

## 声明文件 `block.d.ts`

```ts
import type { SessionBlockDeclaration } from './ports.ts';
export declare const sessionModesBlock: SessionBlockDeclaration;
```

## 声明文件 `call-state.d.ts`

```ts
import type { ConsumptionId, DurableEvidence, RunId } from './identity.ts';
import type { CallBinding, WorkSnapshot, Waiting, ProducedResult } from './values.ts';
import type { SessionCallRegistration, SessionCallWait } from './call-values.ts';
type Draft = {
    -readonly [K in keyof WorkSnapshot]: WorkSnapshot[K];
};
export declare class CallConflict extends Error {
}
export declare function validateBinding(snapshot: WorkSnapshot, binding: CallBinding, run?: RunId): void;
export declare function associated(binding: CallBinding, purpose: string): SessionCallRegistration;
export declare function validateRegistration(snapshot: WorkSnapshot, registration: SessionCallRegistration, run?: RunId): void;
export declare function legacyRegistration(snapshot: WorkSnapshot, consumption: ConsumptionId, binding: CallBinding): SessionCallRegistration;
export declare function registerCall(draft: Draft, consumption: ConsumptionId, registration: SessionCallRegistration, source: DurableEvidence, association: DurableEvidence | null): void;
export declare function registeredWaiting(draft: Draft, run: RunId, calls: readonly SessionCallWait[], other: readonly Waiting[]): void;
export declare function validateResult(binding: CallBinding, result: ProducedResult): void;
export declare const waitKey: (wait: SessionCallWait) => string;
export {};
```

## 声明文件 `call-values.d.ts`

```ts
import type { AttemptId, ConsumerRef, ConsumptionId, DurableEvidence } from './identity.ts';
import type { CallBinding, ProducerRef } from './values.ts';
export type SessionCallRegistration = Readonly<{
    kind: 'associated';
    binding: CallBinding & Readonly<{
        producer: Extract<ProducerRef, {
            kind: 'model';
        }>;
    }>;
    purpose: 'main' | 'compaction' | 'extension';
}> | Readonly<{
    kind: 'associated';
    binding: CallBinding & Readonly<{
        producer: Extract<ProducerRef, {
            kind: 'tool';
        }>;
    }>;
    purpose: 'action';
}> | Readonly<{
    kind: 'tool-intent';
    action: string;
    consumer: ConsumerRef;
    request: DurableEvidence;
    initiatingAttempt: AttemptId | null;
    purpose: 'action';
}>;
export type SessionCallRecord = Readonly<{
    consumption: ConsumptionId;
    registration: SessionCallRegistration;
    registered: DurableEvidence;
    association: DurableEvidence | null;
}>;
export type SessionCallWait = Readonly<{
    consumption: ConsumptionId;
    position: string;
}>;
```

## 声明文件 `control-state.d.ts`

```ts
import type { ControlProgress, WorkSnapshot } from './values.ts';
type Draft = {
    -readonly [K in keyof WorkSnapshot]: WorkSnapshot[K];
};
export declare function validateControlIdentity(snapshot: WorkSnapshot, progress: ControlProgress): void;
export declare function validateControlProgress(snapshot: WorkSnapshot, progress: ControlProgress): void;
export declare function requestControl(draft: Draft, progress: ControlProgress): void;
export {};
```

## 声明文件 `decide-initialization.d.ts`

```ts
import type { SessionCommand, GuardCommand } from './ports.ts';
import type { Decision, DecideReads } from './judgments.ts';
import type { WorkSnapshot } from './values.ts';
export declare function decideInitializationCreate(command: Extract<SessionCommand, {
    kind: 'create';
}>, guards: readonly GuardCommand[]): Decision;
export declare function decideInitializationComplete(snapshot: WorkSnapshot, command: Extract<SessionCommand, {
    kind: 'completeInitialization';
}>, guards: readonly GuardCommand[], reads: DecideReads): Decision;
export declare function validateInitializationRecall(previous: WorkSnapshot | null, command: Extract<SessionCommand, {
    kind: 'create' | 'completeInitialization';
}>, guards: readonly GuardCommand[]): Decision | null;
```

## 声明文件 `decide-management.d.ts`

```ts
import type { SessionCommand } from './ports.ts';
import type { ContextScopeBinding, ControlIntent, WorkSnapshot } from './values.ts';
import type { Decision, DecideReads } from './judgments.ts';
import type { SessionOperationId } from './identity.ts';
export declare function scopeBinding(snapshot: Pick<WorkSnapshot, 'tenant' | 'session' | 'contextScopes'>, operation: SessionOperationId): ContextScopeBinding;
export declare function decideControl(snapshot: WorkSnapshot, intent: ControlIntent, operation: SessionOperationId, reads: DecideReads): Decision;
export declare function decideManagement(snapshot: WorkSnapshot, command: SessionCommand, reads: DecideReads): Decision;
```

## 声明文件 `decide-receive.d.ts`

```ts
import type { SessionCommand } from './ports.ts';
import type { WorkSnapshot } from './values.ts';
import type { Decision } from './judgments.ts';
export declare function decideProducerFact(snapshot: WorkSnapshot, command: Extract<SessionCommand, {
    kind: 'receive';
}>): Decision;
```

## 声明文件 `decide-results.d.ts`

```ts
import type { ConsumptionId } from './identity.ts';
import type { WorkSnapshot, ProducedResult } from './values.ts';
import type { SessionCommand } from './ports.ts';
import { type Decision } from './judgments.ts';
export declare const consumptionIdOf: (binding: unknown) => ConsumptionId;
export declare function resultRefusal(snapshot: WorkSnapshot, consumption: ConsumptionId, result: ProducedResult, operation: SessionCommand['input']['operation']): Decision | null;
export declare function decideResults(snapshot: WorkSnapshot, command: SessionCommand): Decision;
```

## 声明文件 `decide.d.ts`

```ts
import type { AttemptId, InputId, RunId, SessionId } from './identity.ts';
import type { WorkSnapshot } from './values.ts';
import type { GuardCommand, SessionCommand } from './ports.ts';
import { type DecideReads, type Decision, type OperationRecord } from './judgments.ts';
export declare const PATH_MUTATIONS: readonly [
    "create",
    "completeInitialization",
    "accept",
    "startRun",
    "recordMessage",
    "receive",
    "finishRun"
];
export declare function runIdOf(session: SessionId, first: InputId, predecessor: RunId | null): RunId;
export declare function attemptIdOf(run: RunId, ordinal: string): AttemptId;
export declare function executionIdOf(run: RunId): string;
export declare const LOGIN_ENTRY_OWNER = "login-entry";
export declare function commandDigest(command: SessionCommand): string;
export declare function decide(previous: WorkSnapshot | null, command: SessionCommand, guards: readonly GuardCommand[], record: OperationRecord | null, reads: DecideReads): Decision;
```

## 声明文件 `decision-support.d.ts`

```ts
import type { DurableEvidence, SessionOperationId } from './identity.ts';
import type { WorkSnapshot, ResidentAdoption, RunTerminal } from './values.ts';
import type { HistoryEntry, SessionFailure } from './faces.ts';
import type { Decision, EncodedEntry } from './judgments.ts';
export declare const rejected: (failure: SessionFailure) => Decision;
export declare const invalid: (field: string, reason: string) => Decision;
export declare const entries: (values: readonly EncodedEntry[]) => Decision;
export declare const sourceOf: (operation: SessionOperationId, what: string) => DurableEvidence;
export declare const originOf: (source: DurableEvidence) => HistoryEntry['origin'];
export declare const completeEvidence: (source: DurableEvidence) => boolean;
export declare function residentEntries(snapshot: Pick<WorkSnapshot, 'residents'> | null, material: ResidentAdoption | undefined, source: DurableEvidence): Decision;
export declare function terminalEntries(snapshot: WorkSnapshot, terminal: RunTerminal, source: DurableEvidence, interpretation?: Readonly<{
    sequence: string | null;
    cause: DurableEvidence | null;
    disposition: DurableEvidence;
}>): EncodedEntry[];
```

## 声明文件 `entries.d.ts`

```ts
import type { JsonValue } from '@omne-harness/json-text';
import { type TenantId, type WorkspaceId } from '@omne-harness/legal-identity';
import type { Message } from '@omne-harness/message';
import type { Adoption, AgentInstanceRef, AttemptId, ConsumptionId, DurableEvidence, InputId, RunId, SessionId, SessionOperationId } from './identity.ts';
import type { BoundedClose, InitializationResult, Participation, RecoveryTask, RunTerminal, SessionCreation, ResidentAdoption, ResidentTool, DeclarationChange, Relation, AutoArchivePolicy, IdleObservation, ControlProgress, ContextScopeBinding, CallBinding, ProducedResult, InputBatch, Waiting, ExecutionRef } from './values.ts';
import type { EntryClass, HistoryEntry } from './faces.ts';
import type { EncodedEntry } from './judgments.ts';
import type { InitialAdoption, InitializationAdoption, InitializationGuardResult, InitializationFactReference, InitializationPlanItem, InitializationRequirement, InitializationRegistration } from './values.ts';
import type { SessionCallRegistration, SessionCallWait } from './call-values.ts';
export declare const SESSION_INTERPRETER: Adoption;
export type InitializationItem = Omit<Extract<RecoveryTask, {
    kind: 'initialization';
}>, 'kind' | 'originalOperation' | 'state' | 'diagnostic'>;
export type SessionEntry = Readonly<{
    kind: 'session.created';
    tenant: TenantId;
    session: SessionId;
    operation: SessionOperationId;
    creation: SessionCreation;
    items: readonly InitializationItem[];
    initializationProtocol: 1;
    initialAdoption: InitialAdoption;
    requirements: readonly InitializationRequirement[];
    plan: readonly InitializationPlanItem[];
    input: JsonValue;
}> | Readonly<{
    kind: 'session.initialization-item';
    result: InitializationResult;
    createOperation: SessionOperationId;
    operation: SessionOperationId;
    plan: InitializationPlanItem;
    outcome: InitializationGuardResult;
    facts: readonly InitializationFactReference[];
}> | Readonly<{
    kind: 'session.adoption';
    adopted: Adoption;
    residentKeys?: ResidentAdoption['keys'];
    initialization?: Readonly<{
        createOperation: SessionOperationId;
        item: Readonly<{
            owner: string;
            item: string;
        }> | null;
        adoption: InitializationAdoption;
    }>;
}> | Readonly<{
    kind: `message.${Message['role']}`;
    message: Message;
    source: DurableEvidence;
    admission: DurableEvidence | null;
    consumption: ConsumptionId | null;
    participation: Participation | null;
}> | Readonly<{
    kind: 'intake.routed';
    input: InputId;
    destination: 'current-run' | 'next-run';
    run: RunId | null;
    origin: DurableEvidence;
}> | Readonly<{
    kind: 'intake.handed-over';
    input: InputId;
    execution: string;
    result: Readonly<{
        kind: 'accepted';
        receipt: DurableEvidence;
    }> | Readonly<{
        kind: 'rejected';
        reason: string;
        rejection: DurableEvidence;
    }>;
}> | Readonly<{
    kind: 'run.started';
    run: RunId;
    execution: string;
    entry: EntryClass;
    first: InputId;
    predecessor: RunId | null;
    adoption: Adoption;
}> | Readonly<{
    kind: 'run.attempt-started';
    run: RunId;
    attempt: AttemptId;
    ordinal: string;
    instance: AgentInstanceRef;
    reason: 'start' | 'claim' | 'reload';
}> | Readonly<{
    kind: 'run.attempt-released';
    run: RunId;
    attempt: AttemptId;
    reason: 'ended' | 'bounded' | 'cancelled' | 'released' | 'superseded';
}> | Readonly<{
    kind: 'run.terminal';
    terminal: RunTerminal;
    sequence: string | null;
    cause: DurableEvidence | null;
    disposition: DurableEvidence | null;
    bounded: BoundedClose | null;
}> | Readonly<{
    kind: 'session.tool-resident-admitted';
    resident: ResidentTool;
}> | Readonly<{
    kind: 'session.mode-changed' | 'session.model-selected' | 'session.declaration-adopted' | 'session.context-registration-changed' | 'session.recovery-input-adopted';
    declaration: DeclarationChange;
    scope: string | null;
    initialization?: Readonly<{
        createOperation: SessionOperationId;
        plan: InitializationPlanItem;
        prepared: DurableEvidence;
        decision: InitializationRegistration;
    }>;
}> | Readonly<{
    kind: 'session.workspace-changed';
    workspace: WorkspaceId | null;
    workspaceAttachment: SessionCreation['workspaceAttachment'];
    basis: DurableEvidence;
}> | Readonly<{
    kind: 'session.declaration-adopted';
    policy: AutoArchivePolicy;
}> | Readonly<{
    kind: 'session.relation' | 'session.resident';
    relation: Relation;
}> | Readonly<{
    kind: 'session.idle-evidence';
    observation: IdleObservation | null;
}> | Readonly<{
    kind: 'session.frozen';
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'intake.released';
    inputs: readonly InputId[];
}> | Readonly<{
    kind: 'intake.routed';
    task: Extract<RecoveryTask, {
        kind: 'routed-input';
    }>;
}> | Readonly<{
    kind: 'hitl.decision';
    value: Extract<import('./values.ts').RoutedInput, {
        kind: 'card-decision';
    }>;
}> | Readonly<{
    kind: 'run.attempt-exited';
    advance: import('./identity.ts').AdvanceRef;
}> | Readonly<{
    kind: 'run.batch-taken';
    run: RunId;
    batch: InputBatch;
}> | Readonly<{
    kind: 'call.bound';
    consumption: ConsumptionId;
    registration: SessionCallRegistration;
    association: DurableEvidence | null;
}> | Readonly<{
    kind: 'call.bound';
    consumption: ConsumptionId;
    binding: CallBinding;
    reference: string;
    purpose: 'main' | 'action';
}> | Readonly<{
    kind: 'call.execution-fact' | 'account.linked';
    fact: import('./faces.ts').ProducerFact;
    consumption?: ConsumptionId;
    result?: ProducedResult | null;
}> | Readonly<{
    kind: 'call.result-preserved';
    consumption: ConsumptionId;
    result: ProducedResult;
    custody: DurableEvidence;
    participation: Participation | null;
}> | Readonly<{
    kind: 'call.result-processed';
    consumption: ConsumptionId;
    result: ProducedResult;
    completion: DurableEvidence;
    participation: Participation | null;
    position: string | null;
}> | Readonly<{
    kind: 'extension.passage';
    run: RunId;
    waiting: readonly Waiting[];
}> | Readonly<{
    kind: 'extension.passage';
    run: RunId;
    calls: readonly SessionCallWait[];
    other: readonly Exclude<Waiting, {
        kind: 'producer';
    }>[];
}> | Readonly<{
    kind: 'control.requested';
    progress: ControlProgress;
}> | Readonly<{
    kind: 'control.progress';
    progress: ControlProgress | null;
    fact: import('./faces.ts').ProducerFact | null;
}> | Readonly<{
    kind: 'session.archived';
    operation: SessionOperationId;
    scope: ContextScopeBinding;
    tasks: readonly RecoveryTask[];
}> | Readonly<{
    kind: 'session.unarchived';
    scope: ContextScopeBinding;
}> | Readonly<{
    kind: 'history.annotated';
    targets: readonly string[];
    source: DurableEvidence;
}> | Readonly<{
    kind: 'history.annotated';
    run: RunId;
    execution: ExecutionRef;
}> | Readonly<{
    kind: 'history.annotated';
    run: RunId;
    terminal: RunTerminal;
}>;
export type SessionEntryKind = SessionEntry['kind'];
export declare function toJsonValue(plain: unknown): JsonValue;
export declare function fromJsonValue(tree: JsonValue): unknown;
export declare function encodeEntry(entry: SessionEntry, origin: HistoryEntry['origin']): EncodedEntry;
export type DecodedEntry = Readonly<{
    ok: SessionEntry;
}> | Readonly<{
    unknown: string;
}> | Readonly<{
    malformed: string;
}>;
export declare function decodeEntry(entry: Pick<HistoryEntry, 'kind' | 'payload'>): DecodedEntry;
```

## 声明文件 `faces.d.ts`

```ts
import type { JsonValue } from '@omne-harness/json-text';
import type { TenantId } from '@omne-harness/legal-identity';
import type { Message } from '@omne-harness/message';
import type { Outcome } from '@omne-harness/operation-result';
import type { Adoption, AdvanceRef, AgentInstanceRef, ConsumptionId, DurableEvidence, EntryId, InputId, Mutation, ResidentKey, RunId, SessionAccess, SessionId, SessionOperationId, SessionRevision } from './identity.ts';
import type { AutoArchivePolicy, BoundedClose, CallBinding, Control, ControlProgress, DeclarationChange, DerivedMessage, FreezeVerdict, IdleObservation, InitializationResult, Participation, ProducedResult, ProducerRef, Relation, ResidentAdoption, RoutedInput, RunTerminal, ScopeReleaseDisposition, SessionCreation, WorkSnapshot } from './values.ts';
export type SessionFailure = Readonly<{
    kind: 'denied';
    action: string;
}> | Readonly<{
    kind: 'invalid';
    field: string;
    reason: string;
}> | Readonly<{
    kind: 'conflict';
    operation: SessionOperationId;
}> | Readonly<{
    kind: 'changed';
    revision: SessionRevision;
}> | Readonly<{
    kind: 'commit-unknown';
    operation: SessionOperationId;
}> | Readonly<{
    kind: 'unavailable';
    owner: string;
    diagnostic: string;
}> | Readonly<{
    kind: 'quarantined';
    diagnostic: string;
}> | Readonly<{
    kind: 'terminal';
    terminal: RunTerminal;
}> | Readonly<{
    kind: 'stale-advance';
    current: AdvanceRef | null;
}> | Readonly<{
    kind: 'frozen';
    verdict: FreezeVerdict | null;
}> | Readonly<{
    kind: 'archived' | 'no-input' | 'run-active' | 'not-ready' | 'login-required';
}>;
export type Reply<T> = Promise<Outcome<T, SessionFailure>>;
export type CommitReceipt = Readonly<{
    operation: SessionOperationId;
    revision: SessionRevision;
    first: EntryId;
    last: EntryId;
    recovered: boolean;
    source: DurableEvidence;
}>;
export type OperationResolution = Readonly<{
    kind: 'committed';
    receipt: CommitReceipt;
}> | Readonly<{
    kind: 'attempt-rejected';
    original: 'unknown';
    reason: string;
}> | Readonly<{
    kind: 'not-committed';
    exclusion: DurableEvidence;
}> | Readonly<{
    kind: 'unknown';
}>;
export type EntryClass = 'interactive' | 'dispatch';
export type StartedRun = Readonly<{
    receipt: CommitReceipt;
    advance: AdvanceRef;
    adopted: Adoption;
    first: InputId;
    execution: string;
}>;
export type Completion = Readonly<{
    consumption: ConsumptionId;
    result: ProducedResult;
    completion: DurableEvidence;
}>;
export type ExternalCompletion = Readonly<{
    consumption: ConsumptionId;
    result: ProducedResult;
    position: string;
    processing: DurableEvidence;
    message: Message | null;
}>;
export type AdmittedMessage = Readonly<{
    message: Message;
    source: DurableEvidence;
    admission: DurableEvidence;
    consumption: ConsumptionId | null;
}>;
export interface SessionWork<P> {
    accept(input: Mutation<P> & Readonly<{
        value: RoutedInput;
    }>): Reply<CommitReceipt>;
    readWork(input: SessionAccess<P>): Reply<WorkSnapshot>;
    readInput(input: SessionAccess<P> & Readonly<{
        input: InputId;
    }>): Reply<Extract<RoutedInput, {
        kind: 'ordinary';
    }>>;
    startRun(input: Mutation<P> & Readonly<{
        entry: EntryClass;
        candidate: Adoption;
        instance: AgentInstanceRef;
        residentAdoption?: ResidentAdoption;
    }>): Reply<StartedRun>;
    claim(input: Mutation<P> & Readonly<{
        run: RunId;
        instance: AgentInstanceRef;
        continuity: DurableEvidence;
    }>): Reply<Readonly<{
        receipt: CommitReceipt;
        advance: AdvanceRef;
    }>>;
    reload(input: Mutation<P> & Readonly<{
        run: RunId;
        candidate: Adoption;
        instance: AgentInstanceRef;
        expected: SessionRevision;
        handover: DurableEvidence;
        residentAdoption?: ResidentAdoption;
    }>): Reply<Readonly<{
        receipt: CommitReceipt;
        advance: AdvanceRef;
    }>>;
    recordMessage(input: Mutation<P> & Readonly<{
        participation: Participation;
        value: AdmittedMessage;
    }>): Reply<CommitReceipt>;
    preserveResult(input: Mutation<P> & Readonly<{
        participation: Participation | null;
        consumption: ConsumptionId;
        result: ProducedResult;
        custody: DurableEvidence;
    }>): Reply<DurableEvidence>;
    completeConsumption(input: Mutation<P> & Readonly<{
        participation: Participation;
        completion: Completion;
    }>): Reply<DurableEvidence>;
    completeExternalConsumption(input: Mutation<P> & Readonly<{
        expected: SessionRevision;
        qualification: DurableEvidence;
        completion: ExternalCompletion;
    }>): Reply<DurableEvidence>;
    bindExternalCall(input: Mutation<P> & Readonly<{
        expected: SessionRevision;
        qualification: DurableEvidence;
        binding: CallBinding & Readonly<{
            initiatingAttempt: null;
        }>;
    }>): Reply<Readonly<{
        receipt: CommitReceipt;
        consumption: ConsumptionId;
    }>>;
    commitDerived(input: (Mutation<P> & Readonly<{
        participation: Participation;
        value: Extract<DerivedMessage, {
            kind: 'compaction';
        }>;
        judgment: DurableEvidence;
    }>) | (Mutation<P> & Readonly<{
        expected: SessionRevision;
        value: Extract<DerivedMessage, {
            kind: 'context-reminder';
        }>;
    }>)): Reply<CommitReceipt>;
    release(input: Mutation<P> & Readonly<{
        advance: AdvanceRef;
        expected: SessionRevision;
        handover: DurableEvidence;
    }>): Reply<CommitReceipt>;
    control(input: Mutation<P> & Readonly<{
        intent: Control;
    }>): Reply<Readonly<{
        receipt: CommitReceipt;
        progress: ControlProgress;
    }>>;
    finishRun(input: Mutation<P> & Readonly<{
        run: RunId;
        expected: SessionRevision;
        bounded: BoundedClose;
    }>): Reply<Readonly<{
        receipt: CommitReceipt;
        terminal: RunTerminal;
    }>>;
    queryOperation(input: SessionAccess<P> & Readonly<{
        operation: SessionOperationId;
    }>): Reply<OperationResolution>;
    loadRecovery(input: SessionAccess<P>): Reply<WorkSnapshot>;
}
export interface SessionManagement<P> {
    inspectIdle(input: SessionAccess<P>): Reply<IdleObservation>;
    recordIdle(input: Mutation<P> & Readonly<{
        expected: SessionRevision;
        observation: IdleObservation;
    }>): Reply<CommitReceipt>;
    create(input: Mutation<P> & Readonly<{
        creation: SessionCreation;
    }>): Reply<Readonly<{
        receipt: CommitReceipt;
        state: WorkSnapshot;
    }>>;
    completeInitialization(input: Mutation<P> & Readonly<{
        result: InitializationResult;
    }>): Reply<CommitReceipt>;
    change(input: Mutation<P> & Readonly<{
        declaration: DeclarationChange;
    }>): Reply<CommitReceipt>;
    setRelation(input: Mutation<P> & Readonly<{
        relation: Relation;
    }>): Reply<CommitReceipt>;
    configureAutoArchive(input: Mutation<P> & Readonly<{
        policy: AutoArchivePolicy;
    }>): Reply<CommitReceipt>;
    considerAutoArchive(input: Mutation<P> & Readonly<{
        idleEvidence: DurableEvidence;
    }>): Reply<Readonly<{
        result: 'archived' | 'not-due' | 'exempt' | 'disabled';
        receipt: CommitReceipt | null;
    }>>;
    interrupt(input: Mutation<P> & Readonly<{
        run: RunId;
        urgent: Extract<RoutedInput, {
            kind: 'ordinary';
        }>;
        decision: DurableEvidence;
    }>): Reply<Readonly<{
        receipt: CommitReceipt;
        progress: ControlProgress;
    }>>;
    freeze(input: Mutation<P> & Readonly<{
        verdict: FreezeVerdict;
    }>): Reply<CommitReceipt>;
}
export type ProducerFact = Readonly<{
    kind: 'input-handover';
    execution: string;
    input: InputId;
    result: Readonly<{
        kind: 'accepted';
        receipt: DurableEvidence;
    }> | Readonly<{
        kind: 'rejected';
        reason: string;
        rejection: DurableEvidence;
    }>;
}> | Readonly<{
    kind: 'agent-exit';
    advance: AdvanceRef;
    source: DurableEvidence;
}> | Readonly<{
    kind: 'execution';
    producer: ProducerRef;
    source: DurableEvidence;
}> | Readonly<{
    kind: 'account';
    producer: ProducerRef;
    source: DurableEvidence;
}> | Readonly<{
    kind: 'release';
    consumption: ConsumptionId;
    result: ProducedResult;
    source: DurableEvidence;
}> | Readonly<{
    kind: 'cascade';
    child: SessionId;
    childOperation: SessionOperationId;
    source: DurableEvidence;
}> | Readonly<{
    kind: 'routed-input';
    originalOperation: SessionOperationId;
    source: DurableEvidence;
}> | Readonly<{
    kind: 'scope-release';
    archive: SessionOperationId;
    scope: string;
    dispositions: readonly ScopeReleaseDisposition[];
    source: DurableEvidence;
}>;
export type PendingReason = 'initialization' | 'unresolved' | 'controls' | 'tasks' | 'inputs' | 'run' | 'idle-armed' | 'release';
export type ResidentReference = Readonly<{
    tenant: TenantId;
    session: SessionId;
    capability: string;
    shape: JsonValue;
}>;
export type ReleasedScope = Readonly<{
    tenant: TenantId;
    session: SessionId;
    task: SessionOperationId;
    scope: string;
}>;
export interface SessionReconciliation<P> {
    receive(input: Mutation<P> & Readonly<{
        fact: ProducerFact;
    }>): Reply<CommitReceipt>;
    pending(input: Readonly<{
        principal: P;
        tenant: TenantId;
        after: string | null;
        limit: number;
        reason?: PendingReason;
    }>): Reply<Readonly<{
        sessions: readonly SessionId[];
        next: string | null;
    }>>;
    references(input: Readonly<{
        principal: P;
        scope: 'system';
        key: ResidentKey;
        after: string | null;
        limit: number;
    }>): Reply<Readonly<{
        sessions: readonly ResidentReference[];
        next: string | null;
    }>>;
    releasedScopes(input: Readonly<{
        principal: P;
        scope: 'system';
        after: string | null;
        limit: number;
    }>): Reply<Readonly<{
        scopes: readonly ReleasedScope[];
        next: string | null;
    }>>;
}
export type HistoryEntry = Readonly<{
    id: EntryId;
    revision: SessionRevision;
    kind: string;
    schema: Adoption;
    payload: JsonValue;
    origin: Readonly<{
        owner: string;
        via: string | null;
        source: DurableEvidence;
    }>;
}>;
export type HistoryPage = Readonly<{
    source: string;
    interpreter: Adoption;
    upper: SessionRevision;
    entries: readonly HistoryEntry[];
    scannedThrough: string;
    next: string | null;
    exhausted: boolean;
    annotations: readonly HistoryEntry[];
}>;
export type ModelViewBasis = Readonly<{
    epoch: string;
    upper: string;
}>;
export type ModelViewRow = Readonly<{
    seq: string;
    entry: EntryId;
    bytes: number;
    prefixDigest: string;
    message: Message;
}>;
export type ModelViewRead = Readonly<{
    kind: 'page';
    basis: ModelViewBasis;
    rows: readonly ModelViewRow[];
    next: string | null;
}> | Readonly<{
    kind: 'epoch-changed';
    current: ModelViewBasis;
}>;
export interface SessionHistory<P> {
    begin(input: SessionAccess<P> & Readonly<{
        kinds: readonly string[];
        from: EntryId | null;
        direction: 'forward' | 'backward';
        pageBytes: number;
    }>): Reply<HistoryPage>;
    next(input: SessionAccess<P> & Readonly<{
        cursor: string;
    }>): Reply<HistoryPage>;
    since(input: SessionAccess<P> & Readonly<{
        after: EntryId;
        kinds: readonly string[];
        pageBytes: number;
    }>): Reply<HistoryPage>;
    readModelView(input: SessionAccess<P> & Readonly<{
        basis: ModelViewBasis | null;
        after: string | null;
        pageBytes: number;
    }>): Reply<ModelViewRead>;
}
export type SessionFaces<P> = Readonly<{
    work: SessionWork<P>;
    management: SessionManagement<P>;
    reconciliation: SessionReconciliation<P>;
    history: SessionHistory<P>;
}>;
```

## 声明文件 `frontier-state.d.ts`

```ts
import type { SessionEntry } from './entries.ts';
import type { RunId } from './identity.ts';
import type { HistoryEntry } from './faces.ts';
import type { SessionHistoryReads } from './history-values.ts';
import type { WorkSnapshot } from './values.ts';
export declare function validateFrontierBatch(snapshot: WorkSnapshot, entries: readonly SessionEntry[], reads?: SessionHistoryReads): void;
export declare function validateInterpretationEntry(snapshot: WorkSnapshot, entry: SessionEntry, run: RunId | undefined): void;
export declare function validateReplayHistory(snapshot: WorkSnapshot, entries: readonly SessionEntry[], rows: readonly HistoryEntry[], reads?: SessionHistoryReads): ReadonlyMap<string, RunId>;
```

## 声明文件 `history-validation.d.ts`

```ts
import type { AttemptId, DurableEvidence, InputId, RunId } from './identity.ts';
import type { WorkSnapshot, InputBatch } from './values.ts';
import type { ExecutionHistoryBoundary, SessionHistoryIndex, SessionHistoryReads, SessionInputAdmission, SessionInputScope, SessionBatchRecord, SessionExecutionPrefix } from './history-values.ts';
export type HistoryContext = Readonly<{
    snapshot: WorkSnapshot;
    index: SessionHistoryIndex;
    reads: SessionHistoryReads | undefined;
}>;
export declare function historyContext(snapshot: WorkSnapshot, reads?: SessionHistoryReads): HistoryContext;
export declare function executionBoundary(context: HistoryContext, execution: string, run?: RunId): ExecutionHistoryBoundary;
export declare function originalAttempt(snapshot: WorkSnapshot, attempt: AttemptId, run?: RunId): RunId;
export declare function inputAdmissions(context: HistoryContext, input: InputId): readonly SessionInputAdmission[];
export declare function validatePrefix(context: HistoryContext, prefix: SessionExecutionPrefix): void;
export declare function requirePrepared(context: HistoryContext, scope: SessionInputScope): void;
export declare function originalBatch(context: HistoryContext, run: RunId, execution: string, sequence: string, source: DurableEvidence, batch: InputBatch): SessionBatchRecord;
```

## 声明文件 `history-values.d.ts`

```ts
import type { TenantId } from '@omne-harness/legal-identity';
import type { AttemptId, DurableEvidence, InputId, RunId, SessionId } from './identity.ts';
import type { InputBatch } from './values.ts';
import type { SessionLogConsequence } from './projection.ts';
export type SessionLogRoot = Readonly<{
    tenant: TenantId;
    session: SessionId;
    position: string;
    source: DurableEvidence;
}>;
export type InputAdmissionMember = Readonly<{
    ordinal: string;
    run: RunId;
    execution: string;
    operation: string;
    accepted: DurableEvidence;
    attempt: AttemptId;
}>;
export type InputAdmissionBoundary = Readonly<{
    input: InputId;
    directory: string;
    version: string;
    count: string;
    members: readonly InputAdmissionMember[];
    source: DurableEvidence;
}>;
export type SessionFactBoundary = Readonly<{
    sequence: string;
    source: DurableEvidence;
    kinds: readonly SessionLogConsequence['kind'][];
}>;
export type ExecutionHistoryBoundary = Readonly<{
    run: RunId;
    execution: string;
    started: DurableEvidence;
    revision: string;
    executionEvidence: DurableEvidence;
    emittedThrough: string;
    readThrough: string;
    interpreted: DurableEvidence | null;
    ended: Readonly<{
        sequence: string;
        source: DurableEvidence;
    }> | null;
    facts: readonly SessionFactBoundary[];
}>;
export type SessionBatchRecord = Readonly<{
    run: RunId;
    execution: string;
    sequence: string;
    source: DurableEvidence;
    batch: InputBatch;
}>;
export type SessionAttemptRecord = Readonly<{
    run: RunId;
    attempt: AttemptId;
    execution: string;
    ordinal: string;
    started: DurableEvidence;
}>;
export type SessionTakenRecord = SessionBatchRecord & Readonly<{
    commit: DurableEvidence;
}>;
export type SessionHistoryIndex = Readonly<{
    root: SessionLogRoot;
    inputs: readonly InputAdmissionBoundary[];
    executions: readonly ExecutionHistoryBoundary[];
    attempts: readonly SessionAttemptRecord[];
    batches: readonly SessionBatchRecord[];
    taken: readonly SessionTakenRecord[];
}>;
export type SessionInputScope = Readonly<{
    kind: 'pending' | 'selected';
    inputs: readonly InputId[];
}>;
export type SessionInputAdmission = InputAdmissionMember & Readonly<{
    runStarted: DurableEvidence;
    attemptStarted: DurableEvidence;
    attachment: string;
    grant: DurableEvidence;
}>;
export type InputAdmissionPage = Readonly<{
    input: InputId;
    directory: string;
    version: string;
    offset: string;
    next: string | null;
    records: readonly SessionInputAdmission[];
}>;
export type SessionPrefixFact = Readonly<{
    sequence: string;
    source: DurableEvidence;
    consequences: readonly SessionLogConsequence[];
}>;
export type SessionExecutionPrefix = Readonly<{
    execution: string;
    run: RunId;
    after: string;
    through: string;
    facts: readonly SessionPrefixFact[];
}>;
export type SessionHistoryReads = Readonly<{
    root: SessionLogRoot;
    scope: SessionInputScope;
    admissions: readonly InputAdmissionPage[];
    prefixes: readonly SessionExecutionPrefix[];
    attempts: readonly SessionAttemptRecord[];
    taken: readonly SessionTakenRecord[];
}>;
```

## 声明文件 `identity.d.ts`

```ts
import type { Access } from '@omne-harness/legal-identity';
export type { Adoption, ConsumerRef, DurableEvidence } from '@omne-harness/exchange-refs';
declare const sessionIdentity: unique symbol;
export type SessionIdentity<K extends string> = string & {
    readonly [sessionIdentity]: K;
};
export type SessionId = SessionIdentity<'SessionId'>;
export type RunId = SessionIdentity<'RunId'>;
export type AttemptId = SessionIdentity<'AttemptId'>;
export type InputId = SessionIdentity<'SessionInputId'>;
export type BatchId = SessionIdentity<'SessionBatchId'>;
export type SessionOperationId = SessionIdentity<'SessionOperationId'>;
export type SessionRevision = SessionIdentity<'SessionRevision'>;
export type ConsumptionId = SessionIdentity<'SessionConsumptionId'>;
export type EntryId = SessionIdentity<'SessionEntryId'>;
export type ResidentKey = SessionIdentity<'ResidentKey'>;
export type AgentInstanceRef = Readonly<{
    owner: 'agent';
    id: string;
}>;
export type SessionCallerClass = 'intake' | 'coordinator' | 'maintainer' | 'reader';
export type SessionAccess<P> = Access<P> & Readonly<{
    session: SessionId;
}>;
export type Mutation<P> = SessionAccess<P> & Readonly<{
    operation: SessionOperationId;
}>;
export type AdvanceRef = Readonly<{
    run: RunId;
    attempt: AttemptId;
    instance: AgentInstanceRef;
}>;
```

## 声明文件 `index.d.ts`

```ts
export type { Adoption, AdvanceRef, AgentInstanceRef, AttemptId, BatchId, ConsumerRef, ConsumptionId, DurableEvidence, EntryId, InputId, Mutation, ResidentKey, RunId, SessionAccess, SessionCallerClass, SessionId, SessionIdentity, SessionOperationId, SessionRevision, } from './identity.ts';
export type { AutoArchivePolicy, BoundedClose, CallBinding, ClockSample, Consumption, ContextMaterial, Control, ControlIntent, ControlProgress, ControlTarget, DeclarationChange, DerivedMessage, ExecutionRef, FreezeVerdict, IdleCoverage, IdleObservation, InitializationResult, InitializationSource, InitializationSources, InputBatch, Modes, Participation, ProducedResult, ProducerRef, RecoveryTask, Relation, ResidentTool, ResultConsumption, RoutedInput, RunState, RunTerminal, ScopeReleaseDisposition, SessionCreation, SessionFrozen, Waiting, WorkSnapshot, WorkspaceAttachment, } from './values.ts';
export type { AdmittedMessage, CommitReceipt, Completion, EntryClass, ExternalCompletion, HistoryEntry, HistoryPage, ModelViewBasis, ModelViewRead, ModelViewRow, OperationResolution, PendingReason, ProducerFact, ReleasedScope, Reply, ResidentReference, SessionFaces, SessionFailure, SessionHistory, SessionManagement, SessionReconciliation, SessionWork, StartedRun, } from './faces.ts';
export { deriveDriveOperation, deriveSessionOperation, type DriveOperationElements, type SessionOperationElements, } from './operations.ts';
export type { AgentDrivePort, DriveFailure, DriveReceipt, DriveReply, DriveTarget, ExecutionStatus, GuardCommand, MutationName, ScopeReleasePort, ScopeReleaseReadback, SessionBlockDeclaration, SessionClock, SessionCommand, SessionContextInput, SessionEvidenceBridge, SessionIdentityBridge, SessionIdleInput, SessionInternalPrincipals, SessionNotifier, SessionTransactionPort, } from './ports.ts';
export { sessionModesBlock } from './block.ts';
export { judgeAdvance, judgeCompletion, judgeIdle, judgeRunStart, openWork, resolveCascade, resolveControlScope, resolveOperation, routeInput, type AdvanceClaim, type AdvanceJudgment, type CommittedBatch, type CompletionJudgment, type ControlScope, type DecideReads, type Decision, type EncodedEntry, type IdleJudgment, type OpenWork, type OperationJudgment, type OperationRecord, type ReduceResult, type RouteJudgment, type RunStartJudgment, } from './judgments.ts';
export { decide, commandDigest } from './decide.ts';
export { reduce } from './reduce.ts';
export { projectSessionLog, type SessionLogObservation, type SessionLogConsequence, } from './projection.ts';
export type { ResidentAdoption, RunExecution, ContextScopeBinding } from './values.ts';
export { INITIALIZATION_PROTOCOL } from './initialization-schema.ts';
export type { InitialAdoption, InitializationAdoption, InitializationGuardFacts, InitializationGuardResult, InitializationConsequence, InitializationState, InitializationFactReference, } from './initialization-schema.ts';
export { initializationRegistrationCommit } from './initialization-plan.ts';
export type { InitializationPlanItem } from './initialization-plan.ts';
export type { InitializationRegistration } from './initialization-registration.ts';
export type { InitializationRequirement } from './initialization-requirements.ts';
export type { SessionLogRoot, SessionHistoryIndex, InputAdmissionBoundary, InputAdmissionMember, ExecutionHistoryBoundary, SessionFactBoundary, SessionBatchRecord, SessionAttemptRecord, SessionTakenRecord, SessionHistoryReads, SessionInputScope, InputAdmissionPage, SessionInputAdmission, SessionExecutionPrefix, SessionPrefixFact, } from './history-values.ts';
export type { SessionCallRegistration, SessionCallRecord, SessionCallWait } from './call-values.ts';
export type { SessionWorkEntryIndex, SessionCallEntryReferences, SessionControlEntryReferences, } from './work-entry-values.ts';
```

## 声明文件 `initialization-parse.d.ts`

```ts
import { type JsonValue } from '@omne-harness/json-text';
import type { Adoption, DurableEvidence } from './identity.ts';
import type { ContextMaterial, InitializationResult } from './values.ts';
export declare class InitializationInvalid extends Error {
}
export declare function object(value: unknown, keys: readonly string[]): Record<string, unknown>;
export declare function text(value: unknown): string;
export declare function list<T>(value: unknown, parse: (item: unknown) => T): readonly T[];
export declare function adoption(value: unknown): Adoption;
export declare function evidence(value: unknown): DurableEvidence;
export declare function json(value: unknown): JsonValue;
export declare function material(value: unknown): ContextMaterial;
export declare function result(value: unknown): InitializationResult;
```

## 声明文件 `initialization-plan.d.ts`

```ts
import { type TenantId } from '@omne-harness/legal-identity';
import { type JsonValue } from '@omne-harness/json-text';
import type { SessionId, SessionOperationId } from './identity.ts';
import type { SessionCreation } from './values.ts';
import type { InitializationPlanItem } from './values.ts';
export type { InitializationPlanItem } from './values.ts';
export declare function canonicalInitializationValue(value: unknown): unknown;
export declare const sameInitializationValue: (left: unknown, right: unknown) => boolean;
export declare const initializationKey: (item: Readonly<{
    owner: string;
    item: string;
}>) => string;
export declare function planItem(value: unknown): InitializationPlanItem;
export declare function tenantText(tenant: TenantId): string;
export declare function creationInput(creation: SessionCreation): JsonValue;
export declare function initializationRegistrationCommit(input: Readonly<{
    tenant: TenantId;
    session: SessionId;
    createOperation: SessionOperationId;
    owner: string;
    item: string;
}>): string;
export declare function initializationPlan(creation: SessionCreation): readonly InitializationPlanItem[];
```

## 声明文件 `initialization-registration.d.ts`

```ts
import type { JsonValue } from '@omne-harness/json-text';
import type { TenantId } from '@omne-harness/legal-identity';
import type { SessionId, SessionOperationId } from './identity.ts';
import { type InitializationPlanItem } from './initialization-plan.ts';
import type { InitializationRegistration } from './values.ts';
export type { InitializationRegistration } from './values.ts';
export declare function registration(value: unknown): InitializationRegistration;
export declare function registrationInput(value: JsonValue): Pick<InitializationRegistration, 'need' | 'binding' | 'parameters'>;
export declare function validateRegistrationBinding(decision: InitializationRegistration, plan: InitializationPlanItem, binding: Readonly<{
    tenant: TenantId;
    session: SessionId;
    createOperation: SessionOperationId;
}>): void;
```

## 声明文件 `initialization-requirements.d.ts`

```ts
import type { InitializationPlanItem } from './initialization-plan.ts';
import type { InitializationRequirement } from './values.ts';
export type { InitializationRequirement } from './values.ts';
export declare function requirements(value: unknown): readonly InitializationRequirement[];
export declare function validateRequirementPlan(values: readonly InitializationRequirement[], plan: readonly InitializationPlanItem[]): void;
```

## 声明文件 `initialization-schema.d.ts`

```ts
import type { JsonValue } from '@omne-harness/json-text';
import type { InitializationAdoption, InitialAdoption, InitializationConsequence, InitializationGuardResult, InitializationGuardFacts } from './values.ts';
import type { Adoption } from './identity.ts';
import type { GuardCommand, SessionCommand } from './ports.ts';
export declare const INITIALIZATION_PROTOCOL: Adoption;
export type { InitializationAdoption, InitialAdoption, InitializationConsequence, InitializationGuardResult, InitializationGuardFacts, InitializationFactReference, } from './values.ts';
export declare function adoptionMaterial(value: unknown, initial: true): InitialAdoption;
export declare function adoptionMaterial(value: unknown, initial: false): InitializationAdoption;
export declare function consequence(value: unknown): InitializationConsequence | null;
export declare function guardResult(value: unknown): InitializationGuardResult;
export declare function parseInitializationFacts(guard: GuardCommand): InitializationGuardFacts;
export declare function initializationCommandInput(command: Extract<SessionCommand, {
    kind: 'create' | 'completeInitialization';
}>): JsonValue;
export type { InitializationResultRecord, InitializationState } from './values.ts';
```

## 声明文件 `initialization-validation.d.ts`

```ts
import type { GuardCommand, SessionCommand } from './ports.ts';
import type { WorkSnapshot } from './values.ts';
import { type InitializationPlanItem } from './initialization-plan.ts';
import { type InitialAdoption, type InitializationAdoption, type InitializationGuardFacts, type InitializationGuardResult } from './initialization-schema.ts';
export declare function validateAdoption(value: InitializationAdoption, original: Pick<InitialAdoption, 'definitionName' | 'adopted'>): void;
export declare function initializationGuard(previous: WorkSnapshot | null, command: Extract<SessionCommand, {
    kind: 'create' | 'completeInitialization';
}>, guards: readonly GuardCommand[]): InitializationGuardFacts;
export declare function validateResult(value: InitializationGuardResult, plan: InitializationPlanItem): void;
```

## 声明文件 `judgments.d.ts`

```ts
import type { CompactionContext } from '@omne-harness/message';
import type { AdvanceRef, InputId, RunId, SessionId, SessionOperationId, SessionRevision } from './identity.ts';
import type { AutoArchivePolicy, BoundedClose, ControlIntent, IdleCoverage, IdleObservation, Participation, ProducerRef, RecoveryTask, RoutedInput, RunTerminal, Waiting, WorkSnapshot } from './values.ts';
import type { CommitReceipt, EntryClass, HistoryEntry, SessionFailure } from './faces.ts';
import type { GuardCommand, SessionCommand } from './ports.ts';
import type { ConsumptionId, DurableEvidence } from './identity.ts';
import type { SessionHistoryReads } from './history-values.ts';
import type { SessionCallWait } from './call-values.ts';
export type AdvanceJudgment = Readonly<{
    kind: 'ok';
}> | Readonly<{
    kind: 'stale-advance';
    current: AdvanceRef | null;
}> | Readonly<{
    kind: 'changed';
    revision: SessionRevision;
}> | Readonly<{
    kind: 'terminal';
    terminal: RunTerminal;
}> | Readonly<{
    kind: 'archived';
}>;
export type AdvanceClaim = Readonly<{
    kind: 'attempt';
    advance: AdvanceRef;
    expected: SessionRevision;
}> | Readonly<{
    kind: 'bounded';
    run: RunId;
    expected: SessionRevision;
    basis: BoundedClose;
}> | Readonly<{
    kind: 'participation';
    execution: string;
    joint: Participation['joint'];
}>;
export type RouteJudgment = Readonly<{
    kind: 'queue';
    destination: 'current-run' | 'next-run';
}> | Readonly<{
    kind: 'card';
    destination: DurableEvidence;
}> | Readonly<{
    kind: 'business';
    owner: string;
}> | Readonly<{
    kind: 'rejected';
    reason: 'archived' | 'frozen' | 'invalid';
}>;
export type RunStartJudgment = Readonly<{
    kind: 'eligible';
    first: InputId;
}> | Readonly<{
    kind: 'not-ready' | 'archived' | 'frozen' | 'run-active' | 'no-input' | 'login-required';
}>;
export type OpenWork = Readonly<{
    unassociatedWaiting?: readonly SessionCallWait[];
    unsettledControls?: readonly SessionOperationId[];
    pending: readonly InputId[];
    handed: readonly InputId[];
    taken: readonly InputId[];
    waiting: readonly Waiting[];
    backgroundPlaceholders: readonly ConsumptionId[];
    unresolved: readonly SessionOperationId[];
    unreadEvents: readonly Readonly<{
        execution: string;
        after: string;
    }>[];
}>;
export type CompletionJudgment = Readonly<{
    kind: 'allowed';
}> | Readonly<{
    kind: 'blocked';
    pendingInputs: readonly InputId[];
}> | Readonly<{
    kind: 'cancelled';
    terminal: RunTerminal;
}> | Readonly<{
    kind: 'terminal';
    terminal: RunTerminal;
}>;
export type ControlScope = Readonly<{
    kind: 'scope';
    unassociatedWaiting?: readonly SessionCallWait[];
    producers: readonly ProducerRef[];
    revokes: readonly ('advance' | 'pending' | 'delivery')[];
    cancelsRun: RunId | null;
    cascade: readonly RecoveryTask[];
    scopeRelease: boolean;
}> | Readonly<{
    kind: 'terminal';
    terminal: RunTerminal;
}> | Readonly<{
    kind: 'invalid';
    reason: string;
}>;
export type IdleJudgment = Readonly<{
    kind: 'due' | 'not-due' | 'exempt' | 'disabled';
}> | Readonly<{
    kind: 'unavailable';
    reason: string;
}>;
export type OperationJudgment = Readonly<{
    kind: 'new';
}> | Readonly<{
    kind: 'recovered';
    receipt: CommitReceipt;
}> | Readonly<{
    kind: 'conflict';
    operation: SessionOperationId;
}>;
export type OperationRecord = Readonly<{
    operation: SessionOperationId;
    digest: string;
    receipt: CommitReceipt;
}>;
export type CommittedBatch = Readonly<{
    revision: SessionRevision;
    entries: readonly HistoryEntry[];
}>;
export type ReduceResult = Readonly<{
    kind: 'reduced';
    snapshot: WorkSnapshot;
}> | Readonly<{
    kind: 'quarantined';
    diagnostic: string;
}>;
export type EncodedEntry = Omit<HistoryEntry, 'id' | 'revision'>;
export type Decision = Readonly<{
    kind: 'entries';
    entries: readonly EncodedEntry[];
}> | Readonly<{
    kind: 'recovered';
    receipt: CommitReceipt;
}> | Readonly<{
    kind: 'rejected';
    failure: SessionFailure;
}>;
export type DecideReads = Readonly<{
    history?: SessionHistoryReads;
    compaction: CompactionContext | null;
    children?: readonly SessionId[];
    idleObservation?: IdleObservation;
    idleCoverage?: IdleCoverage;
    frozenReceipt?: CommitReceipt;
    initializationReceipts?: readonly CommitReceipt[];
}>;
export declare const OFF_PATH_DIAGNOSTIC = "not on the M2 first tenant path; the judgment lands with #756 (S-1b)";
export declare const OFF_PATH_FAILURE: Extract<SessionFailure, {
    kind: 'unavailable';
}>;
export declare function judgeAdvance(snapshot: WorkSnapshot, claim: AdvanceClaim): AdvanceJudgment;
export declare function routeInput(snapshot: WorkSnapshot, input: RoutedInput): RouteJudgment;
export declare function judgeRunStart(snapshot: WorkSnapshot, _entry: EntryClass): RunStartJudgment;
export declare function openWork(snapshot: WorkSnapshot): OpenWork;
export declare function judgeCompletion(snapshot: WorkSnapshot, execution: string): CompletionJudgment;
export declare function resolveControlScope(snapshot: WorkSnapshot, intent: ControlIntent): ControlScope;
export declare function resolveCascade(snapshot: WorkSnapshot, children: readonly SessionId[]): readonly RecoveryTask[];
export declare function judgeIdle(snapshot: WorkSnapshot, input: Readonly<{
    observation: IdleObservation;
    policy: AutoArchivePolicy;
    coverage: IdleCoverage;
}>): IdleJudgment;
export declare function resolveOperation(record: OperationRecord | null, operation: SessionOperationId, digest: string): OperationJudgment;
export type { GuardCommand, SessionCommand };
```

## 声明文件 `model-view.d.ts`

```ts
import { type CompactionContext } from '@omne-harness/message';
import type { HistoryEntry, ModelViewRow } from './faces.ts';
import type { WorkSnapshot } from './values.ts';
export type MaterializedModelView = Readonly<{
    epoch: string;
    rows: readonly ModelViewRow[];
}>;
export declare function materializeModelView(previous: MaterializedModelView, committed: readonly HistoryEntry[], history: readonly HistoryEntry[]): MaterializedModelView;
export declare function compactionReads(entries: readonly HistoryEntry[], snapshot: WorkSnapshot, through: string): CompactionContext | null;
```

## 声明文件 `observation-validation.d.ts`

```ts
import type { WorkSnapshot } from './values.ts';
import type { SessionLogObservation } from './projection.ts';
import type { SessionHistoryReads } from './history-values.ts';
export declare function validateObservation(snapshot: WorkSnapshot, observation: SessionLogObservation, reads?: SessionHistoryReads): {
    context: Readonly<{
        snapshot: WorkSnapshot;
        index: import("./history-values.ts").SessionHistoryIndex;
        reads: SessionHistoryReads | undefined;
    }>;
    boundary: Readonly<{
        run: import("./identity.ts").RunId;
        execution: string;
        started: import("@omne-harness/exchange-refs").DurableEvidence;
        revision: string;
        executionEvidence: import("@omne-harness/exchange-refs").DurableEvidence;
        emittedThrough: string;
        readThrough: string;
        interpreted: import("@omne-harness/exchange-refs").DurableEvidence | null;
        ended: Readonly<{
            sequence: string;
            source: import("@omne-harness/exchange-refs").DurableEvidence;
        }> | null;
        facts: readonly import("./history-values.ts").SessionFactBoundary[];
    }>;
    head: Readonly<{
        owner: string;
        record: string;
        revision: string;
        digest: string;
    }>;
    repeated: boolean;
};
```

## 声明文件 `operations.d.ts`

```ts
import type { Adoption, AdvanceRef, AgentInstanceRef, ConsumptionId, DurableEvidence, InputId, RunId, SessionId, SessionOperationId } from './identity.ts';
import type { BoundedClose, CallBinding, Participation } from './values.ts';
import type { ProducerFact } from './faces.ts';
export type SessionOperationElements = Readonly<{
    kind: 'startRun';
    session: SessionId;
    first: InputId;
    predecessor: RunId | null;
}> | Readonly<{
    kind: 'participation';
    execution: string;
    operation: string;
    joint: Participation['joint'];
}> | Readonly<{
    kind: 'claim';
    run: RunId;
    instance: AgentInstanceRef;
    continuity: DurableEvidence;
}> | Readonly<{
    kind: 'reload';
    run: RunId;
    candidate: Adoption;
    handover: DurableEvidence;
}> | Readonly<{
    kind: 'release';
    advance: AdvanceRef;
    handover: DurableEvidence;
}> | Readonly<{
    kind: 'bounded-close';
    run: RunId;
    basis: BoundedClose;
}> | Readonly<{
    kind: 'result';
    command: 'preserveResult' | 'completeExternalConsumption';
    consumption: ConsumptionId;
    version: string;
}> | Readonly<{
    kind: 'external-call';
    binding: CallBinding;
}> | Readonly<{
    kind: 'context-reminder';
    session: SessionId;
    source: DurableEvidence;
}> | Readonly<{
    kind: 'idle';
    session: SessionId;
    observation: DurableEvidence;
}> | Readonly<{
    kind: 'auto-archive';
    session: SessionId;
    idleEvidence: DurableEvidence;
}> | Readonly<{
    kind: 'freeze';
    session: SessionId;
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'fact';
    fact: ProducerFact;
}>;
export type DriveOperationElements = Readonly<{
    kind: 'invoke';
    execution: string;
    first: InputId;
    started: DurableEvidence;
}> | Readonly<{
    kind: 'submit';
    execution: string;
    input: InputId;
}> | Readonly<{
    kind: 'resume';
    execution: string;
    grant: DurableEvidence;
}> | Readonly<{
    kind: 'detach';
    execution: string;
    advance: AdvanceRef;
}> | Readonly<{
    kind: 'control';
    execution: string;
    control: SessionOperationId;
}> | Readonly<{
    kind: 'recordResult';
    execution: string;
    consumption: ConsumptionId;
    version: string;
    transfer: 'custody' | 'processed' | 'none';
}>;
export declare function canonicalText(value: unknown): string;
export declare function digestOf(value: unknown): string;
export declare function deriveSessionOperation(elements: SessionOperationElements): SessionOperationId;
export declare function deriveDriveOperation(elements: DriveOperationElements): string;
```

## 声明文件 `ports.d.ts`

```ts
import type { JsonValue } from '@omne-harness/json-text';
import type { TenantId } from '@omne-harness/legal-identity';
import type { Outcome } from '@omne-harness/operation-result';
import type { Adoption, AdvanceRef, ConsumptionId, DurableEvidence, InputId, ResidentKey, SessionAccess, SessionId, SessionOperationId, SessionRevision } from './identity.ts';
import type { ClockSample, Control, IdleObservation, ProducedResult, RoutedInput, ScopeReleaseDisposition, WorkSnapshot } from './values.ts';
import type { OperationResolution, PendingReason, ReleasedScope, Reply, ResidentReference, SessionHistory, SessionManagement, SessionReconciliation, SessionWork } from './faces.ts';
export type DriveFailure = Readonly<{
    kind: 'denied' | 'busy' | 'terminal' | 'changed' | 'stale-advance' | 'unsupported' | 'conflict';
}> | Readonly<{
    kind: 'invalid';
    reason: string;
    rejection: DurableEvidence;
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}> | Readonly<{
    kind: 'commit-unknown';
    operation: string;
}>;
export type DriveReply<T> = Promise<Outcome<T, DriveFailure>>;
export type DriveTarget = Readonly<{
    tenant: TenantId;
    session: SessionId;
    execution: string;
    operation: string;
}>;
export type DriveReceipt = Readonly<{
    revision: string;
    evidence: DurableEvidence;
}>;
export type ExecutionStatus = Readonly<{
    revision: string | null;
    state: 'missing' | 'open' | 'suspended' | 'ended';
    attachment: 'active' | 'detached' | 'superseded' | null;
    conclusion: Readonly<{
        outcome: 'complete' | 'fail' | 'cancelled';
        cause: DurableEvidence | null;
        disposition: DurableEvidence;
    }> | null;
    evidence: DurableEvidence;
}>;
export interface AgentDrivePort {
    invoke(input: DriveTarget & Readonly<{
        first: InputId;
        source: DurableEvidence;
        grant: DurableEvidence;
    }>): DriveReply<DriveReceipt>;
    submit(input: DriveTarget & Readonly<{
        input: InputId;
        source: DurableEvidence;
    }>): DriveReply<DriveReceipt>;
    resume(input: DriveTarget & Readonly<{
        recovery: DurableEvidence;
        grant: DurableEvidence;
    }>): DriveReply<DriveReceipt>;
    control(input: DriveTarget & Readonly<{
        control: SessionOperationId;
        intent: Control;
    }>): DriveReply<DriveReceipt>;
    detach(input: DriveTarget & Readonly<{
        advance: AdvanceRef;
    }>): DriveReply<DurableEvidence>;
    recordResult(input: DriveTarget & Readonly<{
        consumption: ConsumptionId;
        result: ProducedResult;
        transfer: Readonly<{
            kind: 'custody';
            retained: DurableEvidence;
        }> | Readonly<{
            kind: 'processed';
            completion: DurableEvidence;
        }> | Readonly<{
            kind: 'none';
        }>;
        release: Readonly<{
            kind: 'pending';
        }> | Readonly<{
            kind: 'confirmed';
            receipt: DurableEvidence;
        }>;
    }>): DriveReply<DriveReceipt>;
    query(input: DriveTarget): DriveReply<'committed' | 'excluded' | 'unknown'>;
    inspect(input: Omit<DriveTarget, 'operation'>): DriveReply<ExecutionStatus>;
    prewarm(input: Readonly<{
        tenant: TenantId;
        session: SessionId;
        adoption: Adoption;
        counters: DurableEvidence;
    }>): DriveReply<'requested'>;
}
export type ScopeReleaseReadback = Readonly<{
    dispositions: readonly ScopeReleaseDisposition[];
    source: DurableEvidence;
}>;
export interface ScopeReleasePort {
    release(input: Readonly<{
        tenant: TenantId;
        session: SessionId;
        task: SessionOperationId;
        scope: string;
    }>): Promise<ScopeReleaseReadback>;
}
export type SessionBlockDeclaration = Readonly<{
    name: 'session.modes';
    kind: 'supplied';
    recovery: 'persisted';
    volatility: 'stable';
    consumers: readonly ('model' | 'coordinator')[];
    schema: Adoption;
}>;
export type MutationName = 'accept' | 'startRun' | 'claim' | 'reload' | 'recordMessage' | 'preserveResult' | 'completeConsumption' | 'completeExternalConsumption' | 'bindExternalCall' | 'commitDerived' | 'release' | 'control' | 'finishRun' | 'create' | 'completeInitialization' | 'change' | 'setRelation' | 'configureAutoArchive' | 'considerAutoArchive' | 'recordIdle' | 'interrupt' | 'freeze' | 'receive';
export type Mutations = Pick<SessionWork<never> & SessionManagement<never> & SessionReconciliation<never>, MutationName>;
export type SessionCommand = {
    readonly [K in MutationName]: Readonly<{
        kind: K;
        input: Omit<Parameters<Mutations[K]>[0], 'principal'> & (K extends 'commitDerived' ? Readonly<{
            participation?: import('./values.ts').Participation;
            judgment?: DurableEvidence;
            expected?: SessionRevision;
        }> : unknown);
    }>;
}[MutationName];
export type GuardCommand = Readonly<{
    owner: string;
    participant: string;
    protocol: Adoption;
    facts: JsonValue;
}>;
export interface SessionIdentityBridge<P> {
    prepare(input: SessionAccess<P>, command: SessionCommand): Reply<GuardCommand>;
}
export interface SessionEvidenceBridge {
    prepare(command: SessionCommand): Reply<readonly GuardCommand[]>;
}
export interface SessionClock {
    sample(): Reply<ClockSample>;
    waitUntil(instant: string, signal: AbortSignal): Promise<'elapsed' | 'cancelled'>;
}
export interface SessionIdleInput<P> {
    inspect(input: SessionAccess<P> & Readonly<{
        time: ClockSample;
    }>): Reply<IdleObservation>;
    prepare(input: SessionAccess<P>, command: Extract<SessionCommand, {
        kind: 'recordIdle' | 'considerAutoArchive';
    }>): Reply<readonly GuardCommand[]>;
}
export interface SessionContextInput<P> {
    prepare(input: SessionAccess<P>, command: Extract<SessionCommand, {
        kind: 'create' | 'change' | 'startRun' | 'reload';
    }>): Reply<readonly GuardCommand[]>;
}
export interface SessionTransactionPort<P> {
    commit<K extends MutationName>(input: Readonly<{
        command: Extract<SessionCommand, {
            kind: K;
        }>;
        guards: readonly GuardCommand[];
    }>): ReturnType<Mutations[K]>;
    readWork(input: SessionAccess<P>): Reply<WorkSnapshot>;
    readInput(input: SessionAccess<P> & Readonly<{
        input: InputId;
    }>): Reply<Extract<RoutedInput, {
        kind: 'ordinary';
    }>>;
    queryOperation(input: SessionAccess<P> & Readonly<{
        operation: SessionOperationId;
    }>): Reply<OperationResolution>;
    readonly history: SessionHistory<P>;
    pending(input: Readonly<{
        principal: P;
        tenant: TenantId;
        after: string | null;
        limit: number;
        reason?: PendingReason;
    }>): Reply<Readonly<{
        sessions: readonly SessionId[];
        next: string | null;
    }>>;
    references(input: Readonly<{
        principal: P;
        scope: 'system';
        key: ResidentKey;
        after: string | null;
        limit: number;
    }>): Reply<Readonly<{
        sessions: readonly ResidentReference[];
        next: string | null;
    }>>;
    releasedScopes(input: Readonly<{
        principal: P;
        scope: 'system';
        after: string | null;
        limit: number;
    }>): Reply<Readonly<{
        scopes: readonly ReleasedScope[];
        next: string | null;
    }>>;
}
export type SessionInternalPrincipals<P> = Readonly<{
    coordinator: P;
    maintainer: P;
}>;
export interface SessionNotifier {
    committed(input: Readonly<{
        tenant: TenantId;
        session: SessionId;
        revision: SessionRevision;
        source: DurableEvidence;
        kinds: readonly string[];
    }>): Promise<void>;
}
```

## 声明文件 `projection.d.ts`

```ts
import type { SessionCallRegistration, SessionCallWait } from './call-values.ts';
import type { SessionHistoryReads } from './history-values.ts';
import type { DurableEvidence, RunId, SessionAccess, ConsumptionId, SessionOperationId } from './identity.ts';
import type { CallBinding, ControlProgress, InputBatch, RunTerminal, Waiting, WorkSnapshot, ProducedResult } from './values.ts';
import type { Decision } from './judgments.ts';
export type SessionLogConsequence = Readonly<{
    kind: 'call-registration';
    consumption: ConsumptionId;
    registration: SessionCallRegistration;
}> | Readonly<{
    kind: 'call-association';
    consumption: ConsumptionId;
    binding: CallBinding;
    source: DurableEvidence;
}> | Readonly<{
    kind: 'registered-waiting';
    calls: readonly SessionCallWait[];
    other: readonly Exclude<Waiting, {
        kind: 'producer';
    }>[];
}> | Readonly<{
    kind: 'input-taken';
    batch: InputBatch;
}> | Readonly<{
    kind: 'call';
    consumption: ConsumptionId;
    binding: CallBinding;
}> | Readonly<{
    kind: 'producer';
    consumption: ConsumptionId;
    binding: CallBinding;
    result: ProducedResult | null;
}> | Readonly<{
    kind: 'waiting';
    waiting: readonly Waiting[];
}> | Readonly<{
    kind: 'control';
    progress: ControlProgress;
}> | Readonly<{
    kind: 'ended';
    outcome: RunTerminal['outcome'];
    cause: DurableEvidence | null;
    disposition: DurableEvidence;
}> | Readonly<{
    kind: 'observed';
}>;
export type SessionLogObservation = Omit<SessionAccess<never>, 'principal'> & Readonly<{
    run: RunId;
    execution: string;
    sequence: string | null;
    revision: string;
    executionEvidence?: DurableEvidence;
    operation?: SessionOperationId;
    source: DurableEvidence;
    consequences: readonly SessionLogConsequence[];
}>;
export declare function projectSessionLog(snapshot: WorkSnapshot, observation: SessionLogObservation, reads?: SessionHistoryReads): Decision;
```

## 声明文件 `reduce-extended.d.ts`

```ts
import type { SessionEntry } from './entries.ts';
import type { WorkSnapshot } from './values.ts';
import type { DurableEvidence } from './identity.ts';
type Draft = {
    -readonly [K in keyof WorkSnapshot]: WorkSnapshot[K];
};
export declare function applyExtended(draft: Draft, entry: SessionEntry, source: DurableEvidence): string | null;
export {};
```

## 声明文件 `reduce-initialization.d.ts`

```ts
import type { CommittedBatch } from './judgments.ts';
import type { HistoryEntry } from './faces.ts';
import type { WorkSnapshot } from './values.ts';
import type { SessionEntry } from './entries.ts';
export declare function validateInitializationBatch(previous: WorkSnapshot | null, batch: CommittedBatch, decoded: readonly SessionEntry[]): string | null;
export declare function initializationProjection(snapshot: WorkSnapshot, entry: SessionEntry, row: HistoryEntry, batch: CommittedBatch): WorkSnapshot['initialization'];
```

## 声明文件 `reduce-results.d.ts`

```ts
import type { SessionEntry } from './entries.ts';
import type { WorkSnapshot } from './values.ts';
type Draft = {
    -readonly [K in keyof WorkSnapshot]: WorkSnapshot[K];
};
type ResultEntry = Extract<SessionEntry, {
    kind: 'call.result-preserved' | 'call.result-processed';
}>;
export declare function applyResult(draft: Draft, entry: ResultEntry): string | null;
export declare function applyProducerFact(draft: Draft, entry: Extract<SessionEntry, {
    kind: 'call.execution-fact' | 'account.linked';
}>): string | null;
export {};
```

## 声明文件 `reduce.d.ts`

```ts
import type { SessionHistoryReads } from './history-values.ts';
import type { DurableEvidence } from './identity.ts';
import type { WorkSnapshot } from './values.ts';
import type { CommittedBatch, ReduceResult } from './judgments.ts';
export declare function batchEvidence(batch: CommittedBatch, session: string): DurableEvidence;
export declare function reduce(previous: WorkSnapshot | null, batch: CommittedBatch, reads?: SessionHistoryReads): ReduceResult;
```

## 声明文件 `release-digests.d.ts`

```ts
export declare const INITIALIZATION_RELEASE_DIGEST = "sha256:e242e15fea1e6f61df85be70730f6f742a652de0baa49817af8a7453edad80b7";
export declare const SESSION_RELEASE_DIGEST = "sha256:e242e15fea1e6f61df85be70730f6f742a652de0baa49817af8a7453edad80b7";
```

## 声明文件 `replay-validation.d.ts`

```ts
import type { SessionLogObservation } from './projection.ts';
import type { WorkSnapshot } from './values.ts';
export declare function validateReplayedConsequences(snapshot: WorkSnapshot, observation: SessionLogObservation): void;
```

## 声明文件 `result-state.d.ts`

```ts
import type { RunId } from './identity.ts';
import type { CallBinding, Participation, WorkSnapshot } from './values.ts';
type Draft = {
    -readonly [K in keyof WorkSnapshot]: WorkSnapshot[K];
};
export declare function bindingRun(snapshot: WorkSnapshot, binding: CallBinding): RunId | null;
export declare function resultParticipationError(snapshot: WorkSnapshot, binding: CallBinding, participation: Participation): string | null;
export declare function applyParticipation(draft: Draft, participation: Participation): string | null;
export {};
```

## 声明文件 `session-validation.d.ts`

```ts
import type { SessionFailure } from './faces.ts';
export declare class SessionValidationFailure extends Error {
    readonly failure: SessionFailure;
    constructor(failure: SessionFailure);
}
export declare function invalidAt(field: string, reason: string): never;
export declare function unavailableAt(field: string): never;
export declare function inconsistent(field: string): never;
export declare function nonempty(value: unknown, field: string): asserts value is string;
export declare function decimal(value: unknown, field: string): bigint;
export declare function evidenceFields(value: unknown, field: string): void;
export declare const equalValue: (left: unknown, right: unknown) => boolean;
export declare function unique<T>(items: readonly T[], key: (item: T) => string, field: string): void;
```

## 声明文件 `testing-case.d.ts`

```ts
import type { Outcome } from '@omne-harness/operation-result';
import type { SessionFailure } from './faces.ts';
export type ConformanceCase<F> = Readonly<{
    name: string;
    clause: string;
    run(fixture: F): Promise<void>;
}>;
export declare class NotApplicable extends Error {
    readonly handle: string;
    constructor(handle: string);
}
export declare function isNotApplicable(error: unknown): error is NotApplicable;
export type CaseVerdict = Readonly<{
    kind: 'passed';
}> | Readonly<{
    kind: 'not-applicable';
    handle: string;
}>;
export declare function runConformanceCase<F>(conformance: ConformanceCase<F>, fixture: F): Promise<CaseVerdict>;
export declare function conformanceCase<F>(clause: string, name: string, run: (fixture: F) => Promise<void>): ConformanceCase<F>;
export declare function handle<T>(offered: T | undefined, name: string): T;
export declare function succeeded<T>(outcome: Outcome<T, SessionFailure>, what: string): T;
export declare function refused(outcome: Outcome<unknown, SessionFailure>, what: string): SessionFailure;
export declare function expectKind<T extends {
    kind: string;
}, K extends T['kind']>(value: T, kind: K, what: string): Extract<T, {
    kind: K;
}>;
export declare function shapeOf(answer: Outcome<unknown, SessionFailure>): string;
export declare function assertIndistinguishable(answers: Readonly<{
    real: Outcome<unknown, SessionFailure>;
    ghost: Outcome<unknown, SessionFailure>;
}>, what: string): void;
```

## 声明文件 `testing-history-source.d.ts`

```ts
import type { HistoryEntry } from './faces.ts';
import type { SessionHistoryIndex, SessionHistoryReads, SessionInputAdmission, SessionInputScope } from './history-values.ts';
import type { InputId, SessionAccess } from './identity.ts';
import type { SessionLogObservation } from './projection.ts';
import type { WorkSnapshot } from './values.ts';
export interface MemorySessionHistorySource {
    observe(observation: SessionLogObservation): void;
    admit(scope: Pick<SessionAccess<never>, 'tenant' | 'session'>, input: InputId, admission: SessionInputAdmission): void;
    read(snapshot: WorkSnapshot, entries: readonly HistoryEntry[], scope: SessionInputScope): Readonly<{
        index: SessionHistoryIndex;
        reads: SessionHistoryReads;
    }>;
}
export declare function createMemorySessionHistorySource(): MemorySessionHistorySource;
```

## 声明文件 `testing-initialization-source.d.ts`

```ts
import type { SessionFailure, Reply } from './faces.ts';
import type { GuardCommand, SessionCommand } from './ports.ts';
export type InitializationCommand = Extract<SessionCommand, {
    kind: 'create' | 'completeInitialization';
}>;
export interface MemoryInitializationSource {
    readonly durability: 'none';
    prepare(command: InitializationCommand): Reply<readonly GuardCommand[]>;
    verify(command: InitializationCommand, guards: readonly GuardCommand[]): SessionFailure | null;
    readonly controls: Readonly<{
        register(command: InitializationCommand, guard: GuardCommand): void;
        eligible(value: boolean): void;
        available(value: boolean): void;
    }>;
}
export declare function createMemoryInitializationSource(): MemoryInitializationSource;
```

## 声明文件 `testing-initialization.d.ts`

```ts
import type { WorkSnapshot } from './values.ts';
import type { GuardCommand } from './ports.ts';
import type { InitializationCommand } from './testing-initialization-source.ts';
import { type InitialAdoption, type InitializationGuardFacts, type InitializationGuardResult } from './initialization-schema.ts';
export declare function adoptedInitializationFixture(command: Extract<InitializationCommand, {
    kind: 'create';
}>): InitialAdoption;
export declare function initializationFixtureFacts(command: InitializationCommand, snapshot: WorkSnapshot | null, initialAdoption: InitialAdoption | null, results?: readonly InitializationGuardResult[]): InitializationGuardFacts;
export declare function initializationFixtureGuard(facts: InitializationGuardFacts): GuardCommand;
```

## 声明文件 `testing-ports.d.ts`

```ts
import type { SessionClock, SessionContextInput, SessionEvidenceBridge, SessionIdentityBridge, SessionCommand } from './ports.ts';
import type { MemoryInitializationSource } from './testing-initialization-source.ts';
export type IdentityScript = 'allow' | 'deny' | 'unavailable';
export interface ScriptedSessionIdentityBridge<P> extends SessionIdentityBridge<P> {
    readonly durability: 'none';
    readonly controls: Readonly<{
        script(next: IdentityScript): void;
        asked(): readonly SessionCommand[];
    }>;
}
export declare function createScriptedSessionIdentityBridge<P>(initial?: IdentityScript): ScriptedSessionIdentityBridge<P>;
export interface MemorySessionEvidenceBridge extends SessionEvidenceBridge {
    readonly durability: 'none';
    readonly controls: Readonly<{
        unavailable(down: boolean): void;
        loginEntry(included: boolean): void;
    }>;
}
export declare function createMemorySessionEvidenceBridge(options?: Readonly<{
    loginEntry?: boolean;
    initialization?: MemoryInitializationSource;
}>): MemorySessionEvidenceBridge;
export interface MemorySessionContextInput<P> extends SessionContextInput<P> {
    readonly durability: 'none';
    readonly controls: Readonly<{
        unavailable(down: boolean): void;
    }>;
}
export declare function createMemorySessionContextInput<P>(): MemorySessionContextInput<P>;
export interface MemorySessionClock extends SessionClock {
    readonly durability: 'none';
    readonly controls: Readonly<{
        advance(milliseconds: number): void;
        instantAfter(milliseconds: number): string;
        unavailable(down: boolean): void;
    }>;
}
export declare function createMemorySessionClock(): MemorySessionClock;
```

## 声明文件 `testing-provider-conformance.d.ts`

```ts
import { type ConformanceCase } from './testing-case.ts';
import type { MemoryAgentDrive, MemoryScopeRelease, MemorySessionIdleInput, MemorySessionNotifier } from './testing-providers.ts';
import type { MemorySessionClock, MemorySessionContextInput, MemorySessionEvidenceBridge, ScriptedSessionIdentityBridge } from './testing-ports.ts';
export declare function sessionIdentityBridgeConformance(): readonly ConformanceCase<ScriptedSessionIdentityBridge<string>>[];
export declare function sessionEvidenceBridgeConformance(): readonly ConformanceCase<MemorySessionEvidenceBridge>[];
export declare function sessionContextInputConformance(): readonly ConformanceCase<MemorySessionContextInput<string>>[];
export declare function sessionClockConformance(): readonly ConformanceCase<MemorySessionClock>[];
export declare function sessionIdleInputConformance(): readonly ConformanceCase<MemorySessionIdleInput<string>>[];
export declare function sessionNotifierConformance(): readonly ConformanceCase<MemorySessionNotifier>[];
export declare function scopeReleaseConformance(): readonly ConformanceCase<MemoryScopeRelease>[];
export declare function agentDriveConformance(): readonly ConformanceCase<MemoryAgentDrive>[];
```

## 声明文件 `testing-providers.d.ts`

```ts
import type { IdleObservation, ScopeReleaseDisposition } from './values.ts';
import type { AgentDrivePort, DriveTarget, ExecutionStatus, ScopeReleasePort, SessionIdleInput, SessionNotifier } from './ports.ts';
export interface MemorySessionIdleInput<P> extends SessionIdleInput<P> {
    readonly durability: 'none';
    readonly controls: Readonly<{
        observation(value: IdleObservation): void;
        unavailable(value: boolean): void;
    }>;
}
export declare function createMemorySessionIdleInput<P>(initial: IdleObservation): MemorySessionIdleInput<P>;
export interface MemorySessionNotifier extends SessionNotifier {
    readonly durability: 'none';
    readonly controls: Readonly<{
        drop(value: boolean): void;
        notifications(): readonly Parameters<SessionNotifier['committed']>[0][];
    }>;
}
export declare function createMemorySessionNotifier(): MemorySessionNotifier;
export interface MemoryScopeRelease extends ScopeReleasePort {
    readonly durability: 'none';
    readonly controls: Readonly<{
        dispositions(values: readonly ScopeReleaseDisposition[]): void;
        requests(): readonly Parameters<ScopeReleasePort['release']>[0][];
    }>;
}
export declare function createMemoryScopeRelease(): MemoryScopeRelease;
export interface MemoryAgentDrive extends AgentDrivePort {
    readonly durability: 'none';
    readonly controls: Readonly<{
        denied(value: boolean): void;
        unavailable(value: boolean): void;
        status(input: Omit<DriveTarget, 'operation'>, value: ExecutionStatus): void;
    }>;
}
export declare function createMemoryAgentDrive(): MemoryAgentDrive;
```

## 声明文件 `testing-transactions.d.ts`

```ts
import { type MemorySessionHistorySource } from './testing-history-source.ts';
import { type Outcome } from '@omne-harness/operation-result';
import { type TenantId } from '@omne-harness/legal-identity';
import type { DurableEvidence, InputId, SessionAccess, SessionId, SessionOperationId } from './identity.ts';
import type { SessionCreation, WorkSnapshot, Participation } from './values.ts';
import type { CommitReceipt, AdmittedMessage, HistoryEntry, PendingReason, SessionFailure } from './faces.ts';
import type { GuardCommand, SessionCommand, SessionTransactionPort } from './ports.ts';
import { type SessionLogObservation } from './projection.ts';
import { type MemoryInitializationSource } from './testing-initialization-source.ts';
import { type ConformanceCase } from './testing-case.ts';
export interface MemorySessionTransactions<P> extends SessionTransactionPort<P> {
    readonly durability: 'none';
    readonly controls: Readonly<{
        entriesOf(tenant: TenantId, session: SessionId): readonly HistoryEntry[];
    }>;
}
export interface MemorySessionLogTransactions<P> extends MemorySessionTransactions<P> {
    readonly controls: MemorySessionTransactions<P>['controls'] & Readonly<{
        project(observation: SessionLogObservation, operation: SessionOperationId): Promise<Outcome<CommitReceipt, SessionFailure>>;
        directoryAvailable(available: boolean): void;
    }>;
}
export interface MemoryInitializationTransactions<P> extends MemorySessionLogTransactions<P> {
    readonly controls: MemorySessionLogTransactions<P>['controls'] & Readonly<{
        failNextInitializationCommit(): void;
        loseNextInitializationReply(): void;
    }>;
}
export declare function pendingReasonsOf(snapshot: WorkSnapshot): readonly PendingReason[];
export type MemorySessionTransactionOptions<P> = Readonly<{
    initialization?: MemoryInitializationSource;
    history?: MemorySessionHistorySource;
    authorize?: (input: SessionAccess<P> | Readonly<{
        principal: P;
        tenant?: TenantId;
        scope?: 'system';
    }>, action: string) => boolean;
}>;
export declare function createMemorySessionTransactions<P>(options?: MemorySessionTransactionOptions<P>): MemoryInitializationTransactions<P>;
export interface SessionTransactionsFixture<P> {
    readonly port: SessionTransactionPort<P>;
    readonly access: SessionAccess<P>;
    readonly otherAccess?: SessionAccess<P>;
    readonly creation: SessionCreation;
    operation(name: string): SessionOperationId;
    prepareInputAdmission?(input: Readonly<{
        execution: string;
        input: InputId;
        operation: SessionOperationId;
        receipt: DurableEvidence;
    }>): Promise<void>;
    publishMessageParticipation?(input: Readonly<{
        execution: string;
        operation: string;
        value: AdmittedMessage;
    }>): Promise<Participation>;
    initializationGuards?(command: Extract<SessionCommand, {
        kind: 'create';
    }>): Promise<readonly GuardCommand[]>;
}
export declare function sessionTransactionsConformance<P>(): readonly ConformanceCase<SessionTransactionsFixture<P>>[];
export declare function memorySessionTransactionsFixture(): SessionTransactionsFixture<string>;
```

## 声明文件 `testing-values.d.ts`

```ts
import { type TenantId, type WorkspaceId } from '@omne-harness/legal-identity';
import type { Message } from '@omne-harness/message';
import type { Adoption, DurableEvidence, InputId, SessionAccess, SessionId, SessionOperationId } from './identity.ts';
import type { RoutedInput, SessionCreation } from './values.ts';
import type { GuardCommand } from './ports.ts';
export declare const TESTING_OWNER = "@omne-harness/session-contract/testing";
export declare function adoption(name: string): Adoption;
export declare function evidence(record: string): DurableEvidence;
export declare function mintEvidence(record: string, content: unknown): DurableEvidence;
export declare function testingTenant(organization: string, account: string): TenantId;
export declare function testingWorkspace(text: string): WorkspaceId;
export declare const sessionId: (text: string) => SessionId;
export declare const inputId: (text: string) => InputId;
export declare const operationId: (text: string) => SessionOperationId;
export declare function memoryAccess<P>(principal: P, session?: string): SessionAccess<P>;
export declare function memoryOtherAccess<P>(principal: P, session?: string): SessionAccess<P>;
export declare function userMessage(text: string, id?: string): Message;
export declare function assistantMessage(text: string, id?: string): Message;
export declare function ordinaryInput(input: string, text?: string): Extract<RoutedInput, {
    kind: 'ordinary';
}>;
export declare function creation(overrides?: Partial<SessionCreation>): SessionCreation;
export declare function guard(participant: string, owner: string, facts: unknown): GuardCommand;
```

## 声明文件 `testing.d.ts`

```ts
export { NotApplicable, assertIndistinguishable, conformanceCase, expectKind, handle, isNotApplicable, refused, runConformanceCase, shapeOf, succeeded, type CaseVerdict, type ConformanceCase, } from './testing-case.ts';
export { createMemorySessionTransactions, memorySessionTransactionsFixture, pendingReasonsOf, sessionTransactionsConformance, type MemorySessionTransactions, type MemorySessionLogTransactions, type MemoryInitializationTransactions, type SessionTransactionsFixture, } from './testing-transactions.ts';
export { createMemorySessionClock, createMemorySessionContextInput, createMemorySessionEvidenceBridge, createScriptedSessionIdentityBridge, type IdentityScript, type MemorySessionClock, type MemorySessionContextInput, type MemorySessionEvidenceBridge, type ScriptedSessionIdentityBridge, } from './testing-ports.ts';
export { TESTING_OWNER, adoption, assistantMessage, creation, evidence, guard, inputId, memoryAccess, memoryOtherAccess, mintEvidence, operationId, ordinaryInput, sessionId, testingTenant, testingWorkspace, userMessage, } from './testing-values.ts';
export * from './testing-providers.ts';
export { createMemoryInitializationSource, type MemoryInitializationSource, } from './testing-initialization-source.ts';
export { adoptedInitializationFixture, initializationFixtureFacts, initializationFixtureGuard, } from './testing-initialization.ts';
export type { MemorySessionTransactionOptions } from './testing-transactions.ts';
export { sessionIdentityBridgeConformance, sessionEvidenceBridgeConformance, sessionContextInputConformance, sessionClockConformance, sessionIdleInputConformance, sessionNotifierConformance, scopeReleaseConformance, agentDriveConformance, } from './testing-provider-conformance.ts';
export { createMemorySessionHistorySource, type MemorySessionHistorySource, } from './testing-history-source.ts';
```

## 声明文件 `values.d.ts`

```ts
import type { SessionWorkEntryIndex } from './work-entry-values.ts';
import type { JsonValue } from '@omne-harness/json-text';
import type { CompactionMessage, Message } from '@omne-harness/message';
import type { TenantId, WorkspaceId } from '@omne-harness/legal-identity';
import type { SessionHistoryIndex } from './history-values.ts';
import type { SessionCallRecord, SessionCallWait } from './call-values.ts';
import type { Adoption, AdvanceRef, AttemptId, ConsumerRef, ConsumptionId, DurableEvidence, InputId, ResidentKey, BatchId, RunId, SessionId, SessionOperationId, SessionRevision } from './identity.ts';
export type ResidentTool = Readonly<{
    capability: string;
    version: string;
    shape: JsonValue;
    admitted: DurableEvidence;
}>;
export type SessionFrozen = Readonly<{
    cause: 'tool-shape-lost';
    evidence: DurableEvidence;
    commit: DurableEvidence;
}>;
export type ExecutionRef = Readonly<{
    execution: string;
    revision: string | null;
    evidence: DurableEvidence | null;
    readThrough: string;
}>;
export type Participation = Readonly<{
    execution: string;
    operation: string;
    joint: 'message' | 'context-transition' | 'custody' | 'processed';
    written: string;
    handover: DurableEvidence;
}>;
export type ProducerRef = Readonly<{
    kind: 'model';
    call: string;
}> | Readonly<{
    kind: 'tool';
    call: string;
}>;
export type CallBinding = Readonly<{
    producer: ProducerRef;
    action: string;
    consumer: ConsumerRef;
    request: DurableEvidence;
    initiatingAttempt: AttemptId | null;
}>;
export type ProducedResult = Readonly<{
    producer: ProducerRef;
    version: string;
    delivery: string | null;
    source: DurableEvidence;
}>;
export type ResultConsumption = Readonly<{
    result: ProducedResult;
    custody: DurableEvidence | null;
    completion: DurableEvidence | null;
    release: 'pending' | 'confirmed';
}>;
export type Consumption = Readonly<{
    id: ConsumptionId;
    binding: CallBinding;
    results: readonly ResultConsumption[];
}>;
export type InputBatch = Readonly<{
    id: BatchId;
    watermark: DurableEvidence;
    ordered: readonly InputId[];
}>;
export type RunTerminal = Readonly<{
    run: RunId;
    outcome: 'completed' | 'failed' | 'cancelled';
    evidence: DurableEvidence;
}>;
export type RunState = Readonly<{
    kind: 'none';
}> | Readonly<{
    kind: 'active';
    run: RunId;
    adoption: Adoption;
    first: InputId;
    advance: AdvanceRef | null;
    ordinal: string;
    execution: ExecutionRef;
}> | Readonly<{
    kind: 'terminal';
    terminal: RunTerminal;
}>;
export type Waiting = Readonly<{
    kind: 'producer';
    binding: CallBinding;
    position: string;
}> | Readonly<{
    kind: 'extension-batch';
    passage: string;
    position: string;
    members: readonly Readonly<{
        action: string;
        card: DurableEvidence;
        decision: DurableEvidence | null;
    }>[];
}> | Readonly<{
    kind: 'extension-passage';
    passage: string;
    position: string;
    members: readonly Readonly<{
        card: DurableEvidence;
        decision: DurableEvidence | null;
    }>[];
}> | Readonly<{
    kind: 'dependency';
    owner: string;
    position: string;
}>;
export type ControlTarget = Readonly<{
    kind: 'run';
    run: RunId;
}> | Readonly<{
    kind: 'producer';
    producer: ProducerRef;
}> | Readonly<{
    kind: 'session';
}>;
export type RoutedInput = Readonly<{
    kind: 'ordinary';
    input: InputId;
    message: Message;
    origin: DurableEvidence;
}> | Readonly<{
    kind: 'card-decision';
    card: DurableEvidence;
    decision: DurableEvidence;
    destination: DurableEvidence;
}> | Readonly<{
    kind: 'business';
    owner: string;
    input: DurableEvidence;
    destination: DurableEvidence;
}>;
export type Control = Readonly<{
    kind: 'cancel-run';
    run: RunId;
    urgency: 'graceful' | 'force';
}> | Readonly<{
    kind: 'stop-call';
    producer: ProducerRef;
}> | Readonly<{
    kind: 'background-tool';
    producer: Extract<ProducerRef, {
        kind: 'tool';
    }>;
}> | Readonly<{
    kind: 'archive';
}> | Readonly<{
    kind: 'unarchive';
}>;
export type ControlIntent = Readonly<{
    kind: 'control';
    value: Control;
}> | Readonly<{
    kind: 'interrupt';
    run: RunId;
    urgent: Extract<RoutedInput, {
        kind: 'ordinary';
    }>;
    decision: DurableEvidence;
}> | Readonly<{
    kind: 'auto-archive';
    idleEvidence: DurableEvidence;
}>;
export type ControlProgress = Readonly<{
    operation: SessionOperationId;
    target: ControlTarget;
    intent: ControlIntent;
    state: 'committed' | 'propagating' | 'reconciled';
    pending: readonly ProducerRef[];
    pendingUnassociatedWaiting?: readonly SessionCallWait[];
}>;
export type ScopeReleaseDisposition = 'released' | 'pending' | 'unsupported' | 'unavailable' | 'not-authorized';
export type RecoveryTask = Readonly<{
    kind: 'initialization';
    item: string;
    owner: string;
    protocol: Adoption;
    input: JsonValue;
    originalOperation: SessionOperationId;
    state: 'pending' | 'unknown' | 'failed';
    diagnostic: string | null;
}> | Readonly<{
    kind: 'cascade';
    child: SessionId;
    parentControl: SessionOperationId;
    childOperation: SessionOperationId;
    intent: Extract<Control, {
        kind: 'archive';
    }>;
    basis: DurableEvidence;
    state: 'pending' | 'unknown' | 'denied';
}> | Readonly<{
    kind: 'routed-input';
    originalOperation: SessionOperationId;
    value: Exclude<RoutedInput, {
        kind: 'ordinary';
    }>;
    state: 'pending' | 'unknown';
}> | Readonly<{
    kind: 'scope-release';
    archive: SessionOperationId;
    scope: string;
    state: 'pending' | 'unknown';
    last: readonly ScopeReleaseDisposition[];
}>;
export type BoundedClose = Readonly<{
    kind: 'uninterpretable';
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'admission-rejected';
    input: InputId;
    rejection: DurableEvidence;
}>;
export type DerivedMessage = Readonly<{
    kind: 'compaction';
    message: CompactionMessage;
}> | Readonly<{
    kind: 'context-reminder';
    message: Message;
    source: DurableEvidence;
}>;
export type Modes = Readonly<{
    permission: 'never' | 'auto_permission' | 'bypass-permissions';
    environment: Adoption;
    collaboration: 'co-work' | 'auto-drive';
}>;
export type WorkspaceAttachment = Readonly<{
    instance: string;
    basis: string;
}>;
export type SessionCreation = Readonly<{
    definition: Readonly<{
        name: string;
        candidate: Adoption;
    }>;
    execution: Adoption;
    requiredIdentities: readonly Readonly<{
        capability: string;
        name: string;
    }>[];
    purpose: string;
    workspace: WorkspaceId | null;
    workspaceAttachment: WorkspaceAttachment | null;
    modes: Readonly<{
        kind: 'explicit';
        value: Modes;
    }> | Readonly<{
        kind: 'tenant-default';
        source: Adoption;
    }>;
    initial: Extract<RoutedInput, {
        kind: 'ordinary';
    }> | null;
    entryContract: Adoption;
    residentAdoption?: ResidentAdoption;
    initialization?: InitializationSources;
}>;
export type InitializationSource = Readonly<{
    item: string;
    owner: string;
    protocol: Adoption;
}> & (Readonly<{
    kind: 'context-registration';
    input: Omit<Extract<DeclarationChange, {
        kind: 'context-registration';
    }>, 'kind' | 'registration'>;
}> | Readonly<{
    kind: 'workspace-load';
}> | Readonly<{
    kind: 'execution-adoption';
}>);
export type InitializationSources = Readonly<{
    sources: readonly InitializationSource[];
    results: readonly InitializationResult[];
}>;
export type InitializationResult = Readonly<{
    item: string;
    owner: string;
    result: Readonly<{
        kind: 'ready';
        evidence: DurableEvidence;
    }> | Readonly<{
        kind: 'failed';
        diagnostic: string;
        recovery: DurableEvidence;
    }>;
}>;
export type ContextMaterial = Readonly<{
    schema: Adoption;
    value: JsonValue;
}>;
export type DeclarationChange = Readonly<{
    kind: 'permission-mode';
    value: Modes['permission'];
    authorization: DurableEvidence;
}> | Readonly<{
    kind: 'collaboration-mode';
    value: Modes['collaboration'];
    authorization: DurableEvidence;
}> | Readonly<{
    kind: 'environment-mode';
    value: Adoption;
    authorization: DurableEvidence;
    setting: DurableEvidence;
}> | Readonly<{
    kind: 'workspace';
    value: WorkspaceId | null;
    workspaceAttachment: WorkspaceAttachment | null;
    basis: DurableEvidence;
}> | Readonly<{
    kind: 'model';
    name: string;
    basis: DurableEvidence;
}> | Readonly<{
    kind: 'declaration';
    item: string;
    value: JsonValue | null;
    basis: DurableEvidence;
}> | Readonly<{
    kind: 'context-registration';
    registration: DurableEvidence;
    need: ContextMaterial;
    binding: ContextMaterial;
    parameters: ContextMaterial;
}> | Readonly<{
    kind: 'context-step-commit';
    basis: DurableEvidence;
    updates: readonly Readonly<{
        block: string;
        value: ContextMaterial;
    }>[];
}> | Readonly<{
    kind: 'recovery-input';
    item: string;
    value: DurableEvidence;
    basis: DurableEvidence;
}>;
export type Relation = Readonly<{
    kind: 'main';
    resident: boolean;
}> | Readonly<{
    kind: 'child';
    parent: SessionId;
    basis: DurableEvidence;
}> | Readonly<{
    kind: 'handoff';
    origin: SessionId;
    basis: DurableEvidence;
}>;
export type ClockSample = Readonly<{
    at: string;
    protocol: Adoption;
    source: DurableEvidence;
}>;
export type IdleCoverage = Readonly<{
    own: DurableEvidence;
    relations: DurableEvidence;
    children: readonly Readonly<{
        session: SessionId;
        work: DurableEvidence;
    }>[];
    calls: readonly Readonly<{
        producer: ProducerRef;
        state: DurableEvidence;
    }>[];
    completeScope: DurableEvidence;
}>;
export type IdleObservation = Readonly<{
    kind: 'interval';
    started: string;
    through: ClockSample;
    elapsedMs: string;
    coverage: IdleCoverage;
    source: DurableEvidence;
}> | Readonly<{
    kind: 'interrupted';
    at: ClockSample;
    cause: DurableEvidence;
    source: DurableEvidence;
}> | Readonly<{
    kind: 'unknown';
    at: ClockSample;
    scope: DurableEvidence;
    source: DurableEvidence;
}>;
export type AutoArchivePolicy = Readonly<{
    kind: 'disabled';
}> | Readonly<{
    kind: 'enabled';
    idleMs: string;
}>;
export type FreezeVerdict = Readonly<{
    cause: 'tool-shape-lost';
    evidence: DurableEvidence;
}>;
export type WorkSnapshot = Readonly<{
    workEntryIndex?: SessionWorkEntryIndex;
    session: SessionId;
    tenant: TenantId;
    revision: SessionRevision;
    interpreter: Adoption;
    source: DurableEvidence;
    lifecycle: 'initializing' | 'dormant' | 'active' | 'frozen' | 'archived';
    frozen: SessionFrozen | null;
    residents: readonly ResidentTool[];
    definition: Readonly<{
        name: string;
        adopted: Adoption;
    }>;
    execution: Adoption;
    declarations: DurableEvidence;
    revisions: Readonly<{
        workspace: string;
        declarations: string;
    }>;
    run: RunState;
    pending: readonly InputId[];
    handed: readonly InputId[];
    waiting: readonly Waiting[];
    consumptions: readonly Consumption[];
    controls: readonly ControlProgress[];
    unresolved: readonly SessionOperationId[];
    creation: SessionCreation;
    tasks: readonly RecoveryTask[];
    idle: Readonly<{
        observation: IdleObservation;
        commit: DurableEvidence;
    }> | null;
    executions?: readonly RunExecution[];
    residentKeys?: ResidentAdoption['keys'];
    relation?: Relation;
    children?: readonly SessionId[];
    autoArchive?: AutoArchivePolicy;
    taken?: readonly InputId[];
    backgroundPlaceholders?: readonly ConsumptionId[];
    releasedScopes?: readonly Readonly<{
        task: SessionOperationId;
        scope: string;
    }>[];
    contextScopes?: readonly ContextScopeBinding[];
    contextRecords?: readonly Readonly<{
        scope: string;
        declaration: DeclarationChange;
    }>[];
    changes?: readonly DeclarationChange[];
    initialization?: InitializationState;
    historyIndex?: SessionHistoryIndex;
    callRegistrations?: readonly SessionCallRecord[];
    callWaits?: readonly SessionCallWait[];
}>;
export type ResidentAdoption = Readonly<{
    residents: readonly ResidentTool[];
    keys: readonly Readonly<{
        capability: string;
        key: ResidentKey;
    }>[];
}>;
export type RunExecution = Readonly<{
    run: RunId;
    execution: ExecutionRef;
    terminal: RunTerminal | null;
}>;
export type ContextScopeBinding = Readonly<{
    generation: string;
    scope: string;
    operation: SessionOperationId;
    ended: DurableEvidence | null;
}>;
export type InitializationPlanItem = Readonly<{
    kind: 'identity' | InitializationSource['kind'];
    owner: string;
    item: string;
    protocol: Adoption;
    originalInput: JsonValue;
}>;
export type InitializationRegistration = Readonly<{
    scope: string;
    tenant: string;
    key: string;
    commit: string;
    basedOn: number;
    revision: number;
    creating: true;
    required: true;
    need: ContextMaterial;
    binding: ContextMaterial;
    parameters: ContextMaterial;
}>;
export type InitializationRequirement = Readonly<{
    kind: 'entry-contract' | 'identity' | 'context-registration' | 'workspace-load' | 'execution-preparation';
    key: string;
    requirement: DurableEvidence;
    resolution: Readonly<{
        kind: 'satisfied';
        evidence: DurableEvidence;
    }> | Readonly<{
        kind: 'planned';
        owner: string;
        item: string;
    }>;
}>;
export type InitializationAdoption = Readonly<{
    definitionName: string;
    adopted: Adoption;
    source: DurableEvidence;
    boundary: DurableEvidence;
    inputSnapshot: ContextMaterial;
    capabilities: ContextMaterial;
    residentBindings: ResidentAdoption['keys'];
    newResidents: ResidentAdoption['residents'];
}>;
export type InitialAdoption = InitializationAdoption & Readonly<{
    candidate: Adoption;
}>;
export type InitializationConsequence = Readonly<{
    kind: 'identity';
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'workspace-load';
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'context-registration';
    prepared: DurableEvidence;
    decision: InitializationRegistration;
}> | Readonly<{
    kind: 'execution-ready';
    evidence: DurableEvidence;
    adoption: InitializationAdoption | null;
}>;
export type InitializationGuardResult = Readonly<{
    owner: string;
    item: string;
    result: InitializationResult;
    consequence: InitializationConsequence | null;
}>;
export type InitializationGuardFacts = Readonly<{
    version: 1;
    command: 'create' | 'completeInitialization';
    binding: Readonly<{
        tenant: string;
        session: string;
        operation: string;
        createOperation: string;
    }>;
    input: JsonValue;
    initialAdoption: InitialAdoption | null;
    requirements: readonly InitializationRequirement[] | null;
    plan: readonly InitializationPlanItem[];
    results: readonly InitializationGuardResult[];
}>;
export type InitializationFactReference = Readonly<{
    kind: 'batch';
    ordinal: number;
}> | Readonly<{
    kind: 'committed';
    entry: DurableEvidence;
}>;
export type InitializationResultRecord = Readonly<{
    operation: SessionOperationId;
    outcome: InitializationGuardResult;
    facts: readonly InitializationFactReference[];
    entry: DurableEvidence;
    revision: string;
    range: Readonly<{
        first: import('./identity.ts').EntryId;
        last: import('./identity.ts').EntryId;
    }>;
}>;
export type InitializationState = Readonly<{
    protocol: 1;
    createOperation: SessionOperationId;
    initialAdoption: InitialAdoption;
    input: JsonValue;
    requirements: readonly InitializationRequirement[];
    plan: readonly InitializationPlanItem[];
    results: readonly InitializationResultRecord[];
    registrations: readonly Readonly<{
        plan: InitializationPlanItem;
        prepared: DurableEvidence;
        decision: InitializationRegistration;
        entry: DurableEvidence;
    }>[];
}>;
```

## 声明文件 `work-entry-state.d.ts`

```ts
import type { SessionEntry } from './entries.ts';
import type { HistoryEntry } from './faces.ts';
import type { EntryId } from './identity.ts';
import type { ControlProgress, WorkSnapshot } from './values.ts';
import type { SessionWorkEntryIndex } from './work-entry-values.ts';
export declare function unsettled(control: ControlProgress): boolean;
export declare function requiredWorkEntries(snapshot: WorkSnapshot): readonly EntryId[];
export declare function projectWorkEntries(before: WorkSnapshot, after: WorkSnapshot, entry: SessionEntry, row: HistoryEntry): SessionWorkEntryIndex | undefined;
```

## 声明文件 `work-entry-values.d.ts`

```ts
import type { ConsumptionId, EntryId, SessionOperationId } from './identity.ts';
export type SessionCallEntryReferences = Readonly<{
    consumption: ConsumptionId;
    registered: EntryId;
    association: EntryId | null;
    waits: readonly Readonly<{
        position: string;
        entry: EntryId;
    }>[];
}>;
export type SessionControlEntryReferences = Readonly<{
    operation: SessionOperationId;
    intent: EntryId;
    progress: EntryId | null;
    selected: readonly Readonly<{
        consumption: ConsumptionId;
        position: string;
        registered: EntryId;
        waiting: EntryId;
        association: EntryId | null;
    }>[];
}>;
export type SessionWorkEntryIndex = Readonly<{
    calls: readonly SessionCallEntryReferences[];
    controls: readonly SessionControlEntryReferences[];
}>;
```
