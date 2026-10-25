# @omne-harness/tool-contract 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `Access` · 包 `@omne-harness/legal-identity`
- `ActiveRelation` · `results.d.ts`
- `Adoption` · 包 `@omne-harness/exchange-refs`
- `Attachment` · `results.d.ts`
- `BackgroundSource` · `operations.d.ts`
- `ClockSegment` · `records.d.ts`
- `ConsumerRef` · 包 `@omne-harness/exchange-refs`
- `ContentPage` · `custody.d.ts`
- `ControlProgress` · `records.d.ts`
- `ControlReceipt` · `operations.d.ts`
- `ControlRecord` · `records.d.ts`
- `DecisionValue` · `ports.d.ts`
- `DeliveryState` · `results.d.ts`
- `DiagnosticPage` · `custody.d.ts`
- `DurableEvidence` · 包 `@omne-harness/exchange-refs`
- `Effect` · `results.d.ts`
- `ExternalResponse` · `records.d.ts`
- `FixedToolRequest` · `definitions.d.ts`
- `ForegroundReturn` · `operations.d.ts`
- `Handoff` · `operations.d.ts`
- `InterruptionCause` · `results.d.ts`
- `InvocationAccess` · `operations.d.ts`
- `OperationResolution` · `results.d.ts`
- `ParameterContract` · `definitions.d.ts`
- `PhysicalExecution` · `records.d.ts`
- `ProcessBlock` · `operations.d.ts`
- `ProcessSnapshot` · `custody.d.ts`
- `ProtocolIdentity` · `records.d.ts`
- `QueuePosition` · `records.d.ts`
- `RawOutput` · `custody.d.ts`
- `ReleasedDelivery` · `results.d.ts`
- `Reply` · `results.d.ts`
- `ResourceScope` · `definitions.d.ts`
- `ResponseProgress` · `records.d.ts`
- `ResponseRecord` · `records.d.ts`
- `ResultPage` · `results.d.ts`
- `SourceLayer` · `definitions.d.ts`
- `ToolArguments` · `definitions.d.ts`
- `ToolAvailability` · `definitions.d.ts`
- `ToolCallId` · `identity.d.ts`
- `ToolCatalog` · `authoring.d.ts`
- `ToolCommandDeclaration` · `definitions.d.ts`
- `ToolCommandOutcome` · `operations.d.ts`
- `ToolConsumerProfile` · `authoring.d.ts`
- `ToolControl` · `operations.d.ts`
- `ToolCursor` · `identity.d.ts`
- `ToolDecision` · `author-context.d.ts`
- `ToolDeclarations` · `authoring.d.ts`
- `ToolDefiniteFailure` · `operations.d.ts`
- `ToolDefinition` · `definitions.d.ts`
- `ToolDelivery` · `result-delivery.d.ts`
- `ToolDeliveryFailure` · `result-delivery.d.ts`
- `ToolDeliveryId` · `identity.d.ts`
- `ToolDeliveryKey` · `result-delivery.d.ts`
- `ToolDeliveryRejection` · `result-delivery.d.ts`
- `ToolExecutionRef` · `execution.d.ts`
- `ToolFailure` · `results.d.ts`
- `ToolIdentity` · `identity.d.ts`
- `ToolIdentityRejection` · `identity.d.ts`
- `ToolImplementationShape` · `definitions.d.ts`
- `ToolInspection` · `authoring.d.ts`
- `ToolInstanceId` · `identity.d.ts`
- `ToolInvocation` · `definitions.d.ts`
- `ToolInvocationCommands` · `operations.d.ts`
- `ToolInvocationContentReader` · `operations.d.ts`
- `ToolInvocationParts` · `reference.d.ts`
- `ToolInvocationQueries` · `operations.d.ts`
- `ToolInvocationRef` · `reference.d.ts`
- `ToolInvokeOutcome` · `operations.d.ts`
- `ToolInvokeRequest` · `operations.d.ts`
- `ToolLookup` · `results.d.ts`
- `ToolOperationId` · `identity.d.ts`
- `ToolOperationParts` · `reference.d.ts`
- `ToolOperationRef` · `reference.d.ts`
- `ToolProgramDeclaration` · `definitions.d.ts`
- `ToolReferenceFailure` · `reference.d.ts`
- `ToolReferenceRejection` · `reference.d.ts`
- `ToolRelation` · `results.d.ts`
- `ToolReleaseDeliveryOutcome` · `operations.d.ts`
- `ToolResult` · `results.d.ts`
- `ToolResultData` · `results.d.ts`
- `ToolResultReceiver` · `result-delivery.d.ts`
- `ToolResultVersion` · `identity.d.ts`
- `ToolReturnDeclaration` · `definitions.d.ts`
- `ToolRevision` · `identity.d.ts`
- `ToolRuntime` · `operations.d.ts`
- `ToolSavedReceipt` · `result-delivery.d.ts`
- `ToolSchemaIdentity` · `definitions.d.ts`
- `ToolSettingsDeclaration` · `authoring.d.ts`
- `ToolStartRecord` · `ports.d.ts`
- `ToolState` · `results.d.ts`
- `ToolStreamDelta` · `operations.d.ts`
- `ToolStreamEnd` · `operations.d.ts`
- `ToolStreamObservation` · `operations.d.ts`
- `ToolStreamReferences` · `operations.d.ts`
- `ToolStreamSelection` · `operations.d.ts`
- `ToolStreamSnapshot` · `operations.d.ts`
- `ToolTerminal` · `results.d.ts`
- `ToolTiming` · `records.d.ts`
- `ToolUsage` · `authoring.d.ts`
- `ToolWaitId` · `identity.d.ts`
- `ToolWaitSchemaSnapshot` · `author-context.d.ts`
- `WaitIntent` · `records.d.ts`
- `WaitRecord` · `records.d.ts`
- `WaitState` · `results.d.ts`
- `WorkspaceId` · `definitions.d.ts`
- `decodeToolCallId` · `identity.d.ts`
- `decodeToolOperationId` · `identity.d.ts`
- `encodeToolInvocationRef` · `reference.d.ts`
- `encodeToolOperationRef` · `reference.d.ts`
- `judgeToolDelivery` · `result-delivery.d.ts`
- `readToolOperationRef` · `reference.d.ts`
- `resolveToolInvocationRef` · `reference.d.ts`
- `resolveToolOperationRef` · `reference.d.ts`

## 入口 `./binding` · `binding.d.ts`

- `OwnSlot` · `binding.d.ts`
- `ToolOperationSlot` · `registration.d.ts`
- `ToolRegistrationSlot` · `registration.d.ts`
- `readOwnSlot` = `slot` · `shape.d.ts`
- `readToolOperation` · `registration.d.ts`
- `readToolRegistration` · `registration.d.ts`

## 入口 `./provider` · `provider.d.ts`

- `AccountScope` · `custody.d.ts`
- `AdoptionFacts` · `dynamics.d.ts`
- `AdoptionPlan` · `dynamics.d.ts`
- `AdoptionRules` · `adoption.d.ts`
- `AvailabilityFacts` · `authoring.d.ts`
- `CallAccess` · `identity.d.ts`
- `Checkpoint` · `records.d.ts`
- `ChildPosition` · `program.d.ts`
- `ChildReservation` · `program.d.ts`
- `ChildState` · `program.d.ts`
- `ControlDispatch` · `records.d.ts`
- `DrainState` · `records.d.ts`
- `ExternalOperationResolution` · `records.d.ts`
- `FactBatch` · `records.d.ts`
- `FactProgress` · `records.d.ts`
- `FactReceipt` · `records.d.ts`
- `FreezeVerdict` · `dynamics.d.ts`
- `IndependentToolScopeInput` · `author-context.d.ts`
- `Mutation` · `identity.d.ts`
- `OutputCodec` · `authoring.d.ts`
- `ParameterCodec` · `authoring.d.ts`
- `ParsedToolArguments` · `parameter-codec.d.ts`
- `PreparationProgress` · `records.d.ts`
- `PreparationRecord` · `records.d.ts`
- `PreparedEnvironment` · `ports.d.ts`
- `ProgramClosure` · `program.d.ts`
- `ProgramEnd` · `program.d.ts`
- `ProgramScheduling` · `records.d.ts`
- `ProgramToolResult` · `program.d.ts`
- `ProgramTools` · `program.d.ts`
- `RefreshFacts` · `dynamics.d.ts`
- `RefreshOutcome` · `dynamics.d.ts`
- `ReleaseProgress` · `records.d.ts`
- `ReleaseRecord` · `records.d.ts`
- `ResidentFoldFailure` · `dynamics.d.ts`
- `ResidentTool` · `dynamics.d.ts`
- `ResultPolicy` · `execution.d.ts`
- `StartGuard` · `records.d.ts`
- `StartPermit` · `records.d.ts`
- `StartProgress` · `records.d.ts`
- `SuspensionProgress` · `records.d.ts`
- `SuspensionRecord` · `records.d.ts`
- `TOOL_IDENTITY_MAX_LENGTH` · `identity.d.ts`
- `TOOL_REFERENCE_MAX_LENGTH` · `reference.d.ts`
- `TaskResolution` · `records.d.ts`
- `TextRenderer` · `execution.d.ts`
- `TextResultFactory` · `authoring.d.ts`
- `ToolAccounts` · `custody.d.ts`
- `ToolArgumentsRejection` · `parameter-codec.d.ts`
- `ToolAskRequest` · `author-context.d.ts`
- `ToolAssetVersion` · `definitions.d.ts`
- `ToolAuthor` · `authoring.d.ts`
- `ToolAuthorLimits` · `author-context.d.ts`
- `ToolAuthority` · `authoring.d.ts`
- `ToolBindingDrain` · `authoring.d.ts`
- `ToolBindingEntry` · `authoring.d.ts`
- `ToolBindingKey` · `authoring.d.ts`
- `ToolBindingKeyFailure` · `authoring.d.ts`
- `ToolBindingRegistry` · `authoring.d.ts`
- `ToolBindingScope` · `authoring.d.ts`
- `ToolBindings` · `ports.d.ts`
- `ToolChildren` · `program.d.ts`
- `ToolClock` · `ports.d.ts`
- `ToolCommands` · `execution.d.ts`
- `ToolContentReader` · `custody.d.ts`
- `ToolContribution` · `authoring.d.ts`
- `ToolContributionFailure` · `authoring.d.ts`
- `ToolDecisionBridge` · `ports.d.ts`
- `ToolDirectory` · `operations.d.ts`
- `ToolDriver` · `ports.d.ts`
- `ToolEmitReceipt` · `author-context.d.ts`
- `ToolEnvironment` · `ports.d.ts`
- `ToolExecutionContext` · `author-context.d.ts`
- `ToolExecutionFact` · `ports.d.ts`
- `ToolExecutionScope` · `author-context.d.ts`
- `ToolExecutor` · `execution.d.ts`
- `ToolExecutorBinding` · `ports.d.ts`
- `ToolGovernance` · `definitions.d.ts`
- `ToolHandle` · `operations.d.ts`
- `ToolImplementation` · `authoring.d.ts`
- `ToolImplementationDeclaration` · `authoring.d.ts`
- `ToolImplementationFacts` · `definitions.d.ts`
- `ToolImplementationModule` · `authoring.d.ts`
- `ToolInstanceHost` · `ports.d.ts`
- `ToolInstanceIdentities` · `ports.d.ts`
- `ToolInvocationSourceIssuer` · `ports.d.ts`
- `ToolInvocationSourceOutcome` · `ports.d.ts`
- `ToolLiveExecution` · `ports.d.ts`
- `ToolLoadedRegistration` · `authoring.d.ts`
- `ToolLoader` · `authoring.d.ts`
- `ToolMessageContentBlock` · `results.d.ts`
- `ToolOffloader` · `custody.d.ts`
- `ToolOperation` · `authoring.d.ts`
- `ToolOperationIdentities` · `ports.d.ts`
- `ToolOperationParameters` · `authoring.d.ts`
- `ToolOperationSpec` · `authoring.d.ts`
- `ToolOutputCustody` · `custody.d.ts`
- `ToolPermitConsumption` · `records.d.ts`
- `ToolPermitRef` · `records.d.ts`
- `ToolPresentation` · `authoring.d.ts`
- `ToolPrimitiveFailure` · `author-context.d.ts`
- `ToolProcessEmitter` · `author-context.d.ts`
- `ToolProcessReceiver` · `author-context.d.ts`
- `ToolProcessUpdate` · `author-context.d.ts`
- `ToolProgramContract` · `authoring.d.ts`
- `ToolProgramOutput` · `authoring.d.ts`
- `ToolProvider` · `ports.d.ts`
- `ToolReads` · `custody.d.ts`
- `ToolRecovery` · `execution.d.ts`
- `ToolRecoveryBinding` · `records.d.ts`
- `ToolReloadResult` · `dynamics.d.ts`
- `ToolResourceReply` · `author-context.d.ts`
- `ToolResourceResponses` · `records.d.ts`
- `ToolResourceWaitRequest` · `author-context.d.ts`
- `ToolResponseCandidate` · `author-context.d.ts`
- `ToolReturnValidator` · `authoring.d.ts`
- `ToolShape` · `authoring.d.ts`
- `ToolShapeParameters` · `authoring.d.ts`
- `ToolStartAcceptance` · `records.d.ts`
- `ToolStartAuthority` · `records.d.ts`
- `ToolStartFence` · `records.d.ts`
- `ToolStartLookup` · `ports.d.ts`
- `ToolTask` · `records.d.ts`
- `ToolValueSchema` · `definitions.d.ts`
- `ToolWaitContract` · `author-context.d.ts`
- `ToolWaitProtocolDefinition` · `author-context.d.ts`
- `ToolWaitResponseValidator` · `author-context.d.ts`
- `ToolWaitValidation` · `author-context.d.ts`
- `ToolWaiter` · `author-context.d.ts`
- `WriteContext` · `execution.d.ts`
- `createDefaultParameterCodec` · `parameter-codec.d.ts`
- `decodeToolCursor` · `identity.d.ts`
- `decodeToolDeliveryId` · `identity.d.ts`
- `decodeToolInstanceId` · `identity.d.ts`
- `decodeToolInvocationRef` · `reference.d.ts`
- `decodeToolOperationRef` · `reference.d.ts`
- `decodeToolResultVersion` · `identity.d.ts`
- `decodeToolRevision` · `identity.d.ts`
- `decodeToolWaitId` · `identity.d.ts`
- `defaultResultPolicy` · `result-policy.d.ts`
- `defaultResultPolicyAdoption` · `result-policy.d.ts`
- `defaultResultPolicyRules` · `result-policy.d.ts`
- `defineCommandTool` · `registration.d.ts`
- `defineFunctionTool` · `registration.d.ts`
- `defineToolOperation` · `registration.d.ts`
- `defineToolWaitContract` · `wait-contract.d.ts`
- `deriveDefinition` · `dynamics.d.ts`
- `describedAdoption` · `adoption.d.ts`
- `evaluateToolAvailability` · `catalog.d.ts`
- `foldResident` · `dynamics.d.ts`
- `judgeConsumerRef` · `judge-release.d.ts`
- `judgeFixedToolRequest` · `judge-request.d.ts`
- `judgeHandoff` · `judge-release.d.ts`
- `judgeImplementationFacts` · `judge-definition.d.ts`
- `judgeToolArguments` · `parameter-codec.d.ts`
- `judgeToolDefinition` · `judge-definition.d.ts`
- `judgeToolInvokeRequest` · `judge-request.d.ts`
- `judgeToolState` · `judge-state.d.ts`
- `planAdoption` · `dynamics.d.ts`
- `presentTool` · `catalog.d.ts`
- `projectToolResult` · `result-projection.d.ts`
- `readToolInvocationRef` · `reference.d.ts`
- `refreshAvailability` · `dynamics.d.ts`
- `renderToolResult` · `result-rendering.d.ts`
- `sameBindingKey` · `dynamics.d.ts`
- `sameShape` · `dynamics.d.ts`
- `sameSourceLayer` · `dynamics.d.ts`
- `shapeOf` · `dynamics.d.ts`
- `toolBodyContract` · `contract.d.ts`
- `toolStreamCallCodec` · `reference.d.ts`

## 入口 `./testing` · `testing.d.ts`

- `AnswerModel` · `testing-case.d.ts`
- `AnswerRow` · `testing-case.d.ts`
- `CaseVerdict` · `testing-case.d.ts`
- `Completion` · `testing-case.d.ts`
- `ConformanceCase` · `testing-case.d.ts`
- `CrossTenantAnswers` · `testing-case.d.ts`
- `MemoryAuthorizedToolStartAuthority` · `testing-start-authority.d.ts`
- `MemoryEnvironment` · `testing-environment.d.ts`
- `MemoryToolClock` · `testing-clock.d.ts`
- `MemoryToolDecisionBridge` · `testing-decision-bridge.d.ts`
- `MemoryToolEnvironment` · `testing-environment.d.ts`
- `MemoryToolExecutorBinding` · `testing-executor-binding.d.ts`
- `MemoryToolOutputCustody` · `testing-output-custody.d.ts`
- `MemoryToolResourceResponses` · `testing-resource-responses.d.ts`
- `MemoryToolResultReceiver` · `testing-result-receiver.d.ts`
- `MemoryToolStartAuthority` · `testing-start-authority.d.ts`
- `NotApplicable` · `testing-case.d.ts`
- `ToolClockFixture` · `testing-clock.d.ts`
- `ToolDecisionBridgeFixture` · `testing-decision-bridge.d.ts`
- `ToolEnvironmentFixture` · `testing-environment.d.ts`
- `ToolExecutorBindingFixture` · `testing-executor-binding.d.ts`
- `ToolOutputCustodyFixture` · `testing-output-custody.d.ts`
- `ToolPermitReading` · `testing-start-authority.d.ts`
- `ToolResourceResponsesFixture` · `testing-resource-responses.d.ts`
- `ToolResultReceiverFixture` · `testing-result-receiver.d.ts`
- `ToolStartAuthorityFixture` · `testing-start-authority.d.ts`
- `ToolStartAuthorizationFixture` · `testing-start-authorization.d.ts`
- `ToolStartAuthorizationHandles` · `testing-start-authority.d.ts`
- `ToolStartFenceFixture` · `testing-start-fence.d.ts`
- `clockAnswers` · `testing-clock.d.ts`
- `completedFinal` · `testing-executor-binding.d.ts`
- `completionOf` · `testing-case.d.ts`
- `createMemoryAuthorizedToolStartAuthority` · `testing-start-authority.d.ts`
- `createMemoryToolClock` · `testing-clock.d.ts`
- `createMemoryToolDecisionBridge` · `testing-decision-bridge.d.ts`
- `createMemoryToolEnvironment` · `testing-environment.d.ts`
- `createMemoryToolExecutorBinding` · `testing-executor-binding.d.ts`
- `createMemoryToolOutputCustody` · `testing-output-custody.d.ts`
- `createMemoryToolResourceResponses` · `testing-resource-responses.d.ts`
- `createMemoryToolResultReceiver` · `testing-result-receiver.d.ts`
- `createMemoryToolStartAuthority` · `testing-start-authority.d.ts`
- `crossTenantAnswers` · `testing-case.d.ts`
- `decisionBridgeAnswers` · `testing-decision-bridge.d.ts`
- `environmentAnswers` · `testing-environment.d.ts`
- `executorBindingAnswers` · `testing-executor-binding.d.ts`
- `finalAnswer` · `testing-case.d.ts`
- `isNotApplicable` · `testing-case.d.ts`
- `isProgress` · `testing-case.d.ts`
- `memoryToolClockFixture` · `testing-clock.d.ts`
- `memoryToolDecisionBridgeFixture` · `testing-decision-bridge.d.ts`
- `memoryToolEnvironmentFixture` · `testing-environment.d.ts`
- `memoryToolExecutorBindingFixture` · `testing-executor-binding.d.ts`
- `memoryToolOutputCustodyFixture` · `testing-output-custody.d.ts`
- `memoryToolResourceResponsesFixture` · `testing-resource-responses.d.ts`
- `memoryToolResultReceiverFixture` · `testing-result-receiver.d.ts`
- `memoryToolStartAuthorityFixture` · `testing-start-authority.d.ts`
- `memoryToolStartAuthorizationFixture` · `testing-start-authorization.d.ts`
- `memoryToolStartFenceFixture` · `testing-start-fence.d.ts`
- `outputCustodyAnswers` · `testing-output-custody.d.ts`
- `resendRecalls` · `testing-case.d.ts`
- `resourceResponsesAnswers` · `testing-resource-responses.d.ts`
- `runConformanceCase` · `testing-case.d.ts`
- `startAuthorityAnswers` · `testing-start-authority.d.ts`
- `testingTenant` · `testing-values.d.ts`
- `toolClockConformance` · `testing-clock.d.ts`
- `toolDecisionBridgeConformance` · `testing-decision-bridge.d.ts`
- `toolEnvironmentConformance` · `testing-environment.d.ts`
- `toolExecutorBindingConformance` · `testing-executor-binding.d.ts`
- `toolOutputCustodyConformance` · `testing-output-custody.d.ts`
- `toolResourceResponsesConformance` · `testing-resource-responses.d.ts`
- `toolResultReceiverConformance` · `testing-result-receiver.d.ts`
- `toolStartAuthorityConformance` · `testing-start-authority.d.ts`
- `toolStartAuthorizationConformance` · `testing-start-authorization.d.ts`
- `toolStartFenceConformance` · `testing-start-fence.d.ts`

## 声明文件 `adoption.d.ts`

```ts
import type { Adoption } from './identity.ts';
export type AdoptionRules = Readonly<{
    owner: string;
    name: string;
    revision: string;
}> & Readonly<Record<string, unknown>>;
export declare function describedAdoption(rules: AdoptionRules): Adoption;
```

## 声明文件 `author-context.d.ts`

```ts
import type { ContentBlock } from '@omne-harness/content-block';
import type { JsonValue } from '@omne-harness/json-text';
import type { Outcome } from '@omne-harness/operation-result';
import type { SchemaIssue } from '@omne-harness/schema-provider';
import type { ToolSchemaIdentity, ToolValueSchema } from './definitions.ts';
import type { Adoption, CallAccess, DurableEvidence, ToolOperationId, ToolWaitId } from './identity.ts';
import type { Reply } from './results.ts';
export type ToolProcessUpdate = Readonly<{
    kind: 'append-text';
    index: string;
    text: string;
    close: boolean;
}> | Readonly<{
    kind: 'replace';
    index: string;
    content: ContentBlock;
    close: boolean;
}>;
export type ToolEmitReceipt = Readonly<{
    sequence: string;
}> & (Readonly<{
    kind: 'local';
}> | Readonly<{
    kind: 'retained';
    evidence: DurableEvidence;
}>);
export type ToolPrimitiveFailure = Readonly<{
    reason: string;
}> & (Readonly<{
    kind: 'invalid' | 'unsupported' | 'capacity' | 'too-large' | 'busy' | 'conflict' | 'closed' | 'cancelled';
}> | Readonly<{
    kind: 'unavailable' | 'unknown';
    operation: string;
}>);
declare const toolWaitContract: unique symbol;
export type ToolWaitProtocolDefinition<A, K extends 'ask' | 'resource'> = Readonly<{
    kind: K;
    adoption: Adoption;
    request: ToolValueSchema<unknown>;
    response: ToolValueSchema<A>;
    expiry: K extends 'ask' ? 'forbidden' : 'forbidden' | 'supported';
}>;
export type ToolWaitContract<A, K extends 'ask' | 'resource'> = ToolWaitProtocolDefinition<A, K> & Readonly<{
    [toolWaitContract]: true;
}>;
export type ToolDecision<A> = Readonly<{
    kind: 'answer';
    value: A;
}> | Readonly<{
    kind: 'no-answer';
}> | Readonly<{
    kind: 'declined';
}>;
export type ToolAskRequest<A = JsonValue> = Readonly<{
    kind: 'ask';
    key: string;
    contract: ToolWaitContract<A, 'ask'>;
    request: JsonValue;
}>;
export type ToolResourceWaitRequest<A = JsonValue> = Readonly<{
    kind: 'resource';
    key: string;
    contract: ToolWaitContract<A, 'resource'>;
    request: JsonValue;
    deadline: string | null;
}>;
export type ToolResourceReply<A = JsonValue> = Readonly<{
    kind: 'response';
    value: A;
}> | Readonly<{
    kind: 'expired';
}>;
export interface ToolProcessEmitter {
    emit(update: ToolProcessUpdate): Promise<Outcome<ToolEmitReceipt, ToolPrimitiveFailure>>;
}
export interface ToolWaiter {
    wait<A>(request: ToolAskRequest<A>): Promise<Outcome<ToolDecision<A>, ToolPrimitiveFailure>>;
    wait<A>(request: ToolResourceWaitRequest<A>): Promise<Outcome<ToolResourceReply<A>, ToolPrimitiveFailure>>;
}
export interface ToolExecutionContext extends ToolProcessEmitter, ToolWaiter {
    readonly mode: 'independent' | 'managed';
    readonly signal: AbortSignal;
}
export type ToolAuthorLimits = Readonly<{
    authorBufferBytes: number;
    authorBufferItems: number;
    authorWaitHistoryBytes: number;
    authorWaitHistoryItems: number;
}>;
export interface ToolExecutionScope {
    readonly context: ToolExecutionContext;
    readonly limits: ToolAuthorLimits;
    finish(exit: 'returned' | 'failed'): Promise<Outcome<void, ToolPrimitiveFailure>>;
}
export type ToolWaitSchemaSnapshot = Readonly<{
    contract: Adoption;
    request: ToolSchemaIdentity;
    response: ToolSchemaIdentity;
    requestMaxBytes: number;
    responseMaxBytes: number;
    expiry: 'forbidden' | 'supported';
    source: DurableEvidence;
}>;
export type ToolResponseCandidate = Readonly<{
    kind: 'answer' | 'resource';
    value: JsonValue;
}> | Readonly<{
    kind: 'no-answer' | 'declined';
}>;
export type ToolWaitValidation = Readonly<{
    kind: 'valid';
    candidate: ToolResponseCandidate;
    qualification: DurableEvidence;
}> | Readonly<{
    kind: 'invalid';
    issues: readonly SchemaIssue[];
}> | Readonly<{
    kind: 'denied' | 'stale' | 'conflict';
    reason: string;
}>;
export interface ToolWaitResponseValidator<P> {
    validate(input: CallAccess<P> & Readonly<{
        wait: ToolWaitId;
        submission: ToolOperationId;
        source: DurableEvidence;
        candidate: ToolResponseCandidate;
    }>): Reply<ToolWaitValidation>;
}
export interface ToolProcessReceiver {
    receive(input: Readonly<{
        sequence: string;
        update: ToolProcessUpdate;
    }>): Promise<Outcome<void, ToolPrimitiveFailure>>;
}
export type IndependentToolScopeInput = Readonly<{
    limits: ToolAuthorLimits;
    signal: AbortSignal;
    process: ToolProcessReceiver | null;
    waits: ToolWaiter | null;
}>;
export {};
```

## 声明文件 `authoring.d.ts`

```ts
import type { ContentBlock } from '@omne-harness/content-block';
import type { JsonValue } from '@omne-harness/json-text';
import type { Modality } from '@omne-harness/modality';
import type { Outcome } from '@omne-harness/operation-result';
import type { ToolWaitContract } from './author-context.ts';
import type { ParameterContract, SourceLayer, ToolArguments, ToolAssetVersion, ToolAvailability, ToolDefinition, ToolGovernance, ToolImplementationFacts, ToolInvocation, ToolReturnDeclaration, ToolValueSchema } from './definitions.ts';
import type { TextRenderer, ToolExecutor } from './execution.ts';
import type { Access, Adoption, DurableEvidence, ToolCallId } from './identity.ts';
import type { Reply, ToolResult } from './results.ts';
export type ToolDeclarations = Readonly<{
    adoption: Adoption;
    environment: Adoption | null;
    attachments: readonly Readonly<{
        store: string;
        mediaTypes: readonly string[];
    }>[];
    inputModalities: readonly Modality[];
    outputModalities: readonly Modality[];
    settings: ToolSettingsDeclaration | null;
}>;
export type ToolSettingsDeclaration = Readonly<{
    schema: ParameterContract;
    defaults: JsonValue;
    items: readonly Readonly<{
        path: readonly string[];
        category: 'preference' | 'binding' | 'placement-identity' | 'governance';
        sensitive: boolean;
    }>[];
}>;
export type ToolConsumerProfile = Readonly<{
    capabilities: DurableEvidence;
    conversion: Adoption | null;
    attachmentAccess: DurableEvidence;
}>;
export type ToolInspection<P> = Access<P> & Readonly<{
    name: string;
    command: string | null;
    consumer: ToolConsumerProfile;
}>;
export type ToolUsage = Readonly<{
    definition: Adoption;
    command: string | null;
    description: string;
    parameters: ParameterContract | Readonly<{
        kind: 'executor-owned';
        usage: string;
        protocol: Adoption;
    }>;
    returns: ToolReturnDeclaration;
}>;
export type ToolPresentation = Readonly<{
    name: string;
    description: string;
    programmable: boolean;
    commands: readonly Readonly<{
        name: string;
        summary: string;
    }>[];
}>;
export interface ToolCatalog<P> {
    inspect(input: ToolInspection<P>): Reply<ToolAvailability>;
    usage(input: ToolInspection<P> & Readonly<{
        adoption: Adoption;
    }>): Reply<ToolUsage>;
    search(input: Access<P> & Readonly<{
        query: string;
        consumer: ToolConsumerProfile;
        invocation: ToolInvocation['kind'];
        after: string | null;
        limit: number;
    }>): Reply<Readonly<{
        entries: readonly ToolAvailability[];
        next: string | null;
    }>>;
}
export interface ParameterCodec<A> {
    readonly adoption: Adoption;
    parse(input: ToolArguments): Outcome<A, Readonly<{
        kind: 'incomplete' | 'invalid';
        reason: string;
    }>>;
}
export interface OutputCodec<R> {
    readonly adoption: Adoption;
    encode(value: unknown): Outcome<Uint8Array, Readonly<{
        reason: string;
    }>>;
    decode(bytes: Uint8Array): Outcome<R, Readonly<{
        reason: string;
    }>>;
}
export interface ToolReturnValidator<A, R> {
    readonly adoption: Adoption;
    check(input: Readonly<{
        arguments: A;
        value: unknown;
    }>): Outcome<R, Readonly<{
        reason: string;
    }>>;
}
export type ToolProgramContract = Readonly<{
    kind: 'none';
}> | Readonly<{
    kind: 'json';
    adoption: Adoption;
    schema: ToolValueSchema<unknown>;
}>;
export type ToolProgramOutput<R> = Readonly<{
    kind: 'none';
}> | Readonly<{
    kind: 'json';
    adoption: Adoption;
    schema: ToolValueSchema<unknown>;
    encode(value: R): Outcome<JsonValue, Readonly<{
        reason: string;
    }>>;
}>;
export type ToolAuthor<A, R, E, B extends ContentBlock> = Readonly<{
    parameters: ParameterCodec<A>;
    waits: readonly ToolWaitContract<unknown, 'ask' | 'resource'>[];
}> & (Readonly<{
    kind: 'ordinary';
    executor: ToolExecutor<A, R, E>;
    codec: OutputCodec<R>;
    output: ToolReturnValidator<A, R>;
    renderer: TextRenderer<R>;
    program: ToolProgramOutput<R>;
}> | Readonly<{
    kind: 'structured';
    executor: ToolExecutor<A, ToolResult<B>, E>;
    codec: OutputCodec<ToolResult<B>>;
    output: ToolReturnValidator<A, ToolResult<B>>;
    program: ToolProgramContract;
}>);
export type ToolOperationParameters = Readonly<{
    kind: 'declared';
    value: ParameterContract;
}> | Readonly<{
    kind: 'executor-owned';
    usage: string;
    protocol: Adoption;
}>;
declare const toolOperation: unique symbol;
declare const toolAuthorRegistration: unique symbol;
export type ToolOperation<E, B extends ContentBlock, P extends ToolOperationParameters = ToolOperationParameters> = Readonly<{
    parameters: P;
    returns: ToolReturnDeclaration;
    [toolOperation]: Readonly<{
        environment: (value: E) => E;
        block: (value: B) => B;
    }>;
}>;
export type ToolOperationSpec<A, R, E, B extends ContentBlock, P extends ToolOperationParameters> = Readonly<{
    parameters: P;
}> & (Readonly<{
    returns: ToolReturnDeclaration & Readonly<{
        kind: 'ordinary';
    }>;
    author: Extract<ToolAuthor<A, R, E, B>, {
        kind: 'ordinary';
    }>;
}> | Readonly<{
    returns: ToolReturnDeclaration & Readonly<{
        kind: 'structured';
    }>;
    author: Extract<ToolAuthor<A, R, E, B>, {
        kind: 'structured';
    }>;
}>);
export type ToolImplementation<E, B extends ContentBlock> = Readonly<{
    facts: ToolImplementationFacts;
    [toolAuthorRegistration]: Readonly<{
        environment: (value: E) => E;
        block: (value: B) => B;
    }>;
}>;
export type ToolImplementationDeclaration = Readonly<{
    description: string;
    backgroundAllowed: boolean;
    declarations: ToolDeclarations;
}>;
export type ToolImplementationModule<E, B extends ContentBlock> = Readonly<{
    executor: Adoption;
    createAuthor(construction: JsonValue): Outcome<ToolImplementation<E, B>, Readonly<{
        field: string;
        reason: string;
    }>>;
}>;
export type ToolBindingKey = Readonly<{
    layer: SourceLayer;
    asset: ToolAssetVersion;
}>;
export type ToolShapeParameters = Readonly<{
    kind: 'declared';
    schema: string;
    vocabulary: Readonly<{
        owner: string;
        name: string;
        digest: string;
    }>;
}> | Readonly<{
    kind: 'executor-owned';
}>;
export type ToolShape = Readonly<{
    name: string;
}> & (Readonly<{
    kind: 'function';
    parameters: ToolShapeParameters;
}> | Readonly<{
    kind: 'commands';
    commands: readonly Readonly<{
        name: string;
        parameters: ToolShapeParameters;
    }>[];
}>);
declare const toolLoadedRegistration: unique symbol;
export type ToolLoadedRegistration<E, B extends ContentBlock> = Readonly<{
    implementation: ToolImplementation<E, B>;
    key: ToolBindingKey;
    definition: ToolDefinition;
    shape: ToolShape;
    executor: Adoption;
    settings: Adoption;
    [toolLoadedRegistration]: true;
}>;
export interface ToolLoader<P, E, B extends ContentBlock> {
    load(input: Access<P> & Readonly<{
        asset: ToolGovernance;
        settings: Adoption;
        module: ToolImplementationModule<E, B>;
        services: Readonly<Record<string, unknown>>;
    }>): Reply<ToolLoadedRegistration<E, B>>;
}
export type ToolAuthority = Readonly<{
    layer: SourceLayer;
    asset: ToolAssetVersion;
    holding: DurableEvidence;
    publication: DurableEvidence;
}>;
export type ToolContribution = Readonly<{
    key: ToolBindingKey;
    token: string;
    ordinal: string;
    release(): Readonly<{
        removed: boolean;
    }>;
}>;
export type ToolContributionFailure = Readonly<{
    kind: 'conflict';
}> | Readonly<{
    kind: 'denied';
}> | Readonly<{
    kind: 'invalid';
    reason: string;
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
export type ToolBindingEntry = Readonly<{
    key: ToolBindingKey;
    ordinal: string;
    digest: string;
    shape: ToolShape;
    state: 'live' | 'draining';
    fiber: string;
}>;
export type ToolBindingScope<P> = Access<P> | Readonly<{
    scope: 'system';
}>;
export type ToolBindingKeyFailure = Readonly<{
    kind: 'unknown-key';
}>;
export type ToolBindingDrain = Readonly<{
    pins: string;
    inflight: readonly ToolCallId[];
}>;
export interface ToolBindingRegistry<P, E, B extends ContentBlock> {
    register(input: Access<P> & Readonly<{
        loaded: ToolLoadedRegistration<E, B>;
        authority: ToolAuthority;
    }>): Outcome<ToolContribution, ToolContributionFailure>;
    snapshot(scope: ToolBindingScope<P>): Outcome<readonly ToolBindingEntry[], Extract<ToolContributionFailure, {
        kind: 'unavailable';
    }>>;
    pins(key: ToolBindingKey): Outcome<string, ToolBindingKeyFailure>;
    close(key: ToolBindingKey): Outcome<void, ToolBindingKeyFailure>;
    reopen(key: ToolBindingKey): Outcome<void, ToolBindingKeyFailure>;
    drain(key: ToolBindingKey): Outcome<ToolBindingDrain, ToolBindingKeyFailure>;
}
export interface TextResultFactory<B extends ContentBlock> {
    text(value: string): Outcome<ToolResult<B>, Readonly<{
        reason: string;
    }>>;
}
export type AvailabilityFacts = Readonly<{
    definition: ToolDefinition;
    executor: Adoption;
    layer: SourceLayer;
    qualification: 'allowed' | 'denied';
    dependencies: readonly Readonly<{
        name: string;
        available: boolean;
    }>[];
    inputCompatible: boolean;
    outputCompatible: boolean;
    attachmentsReadable: boolean;
}>;
export {};
```

## 声明文件 `binding.d.ts`

```ts
import { slot } from './shape.ts';
export { readToolOperation, readToolRegistration, type ToolOperationSlot, type ToolRegistrationSlot, } from './registration.ts';
export type OwnSlot = ReturnType<typeof slot>;
export { slot as readOwnSlot };
```

## 声明文件 `catalog.d.ts`

```ts
import type { AvailabilityFacts, ToolPresentation } from './authoring.ts';
import type { ToolAvailability, ToolDefinition } from './definitions.ts';
export declare function presentTool(definition: ToolDefinition): ToolPresentation;
export declare function evaluateToolAvailability(facts: AvailabilityFacts): ToolAvailability;
```

## 声明文件 `contract.d.ts`

```ts
import { type BodyContract } from '@omne-harness/assets';
export declare function toolBodyContract(): BodyContract;
```

## 声明文件 `custody.d.ts`

```ts
import type { CallAccount } from '@omne-harness/call-account';
import type { ContentBlock } from '@omne-harness/content-block';
import type { OrganizationId, TenantId } from '@omne-harness/legal-identity';
import type { Adoption, CallAccess, DurableEvidence, Mutation, ToolCallId, ToolCursor, ToolOperationId, ToolResultVersion, ToolWaitId } from './identity.ts';
import type { ProcessBlock } from './operations.ts';
import type { WaitRecord } from './records.ts';
import type { Attachment, OperationResolution, Reply, ResultPage, ToolLookup, ToolResult, ToolState } from './results.ts';
export type RawOutput = Readonly<{
    codec: Adoption;
    content: Attachment;
    custody: DurableEvidence;
}>;
export interface ToolOutputCustody<P> {
    preserve(input: Mutation<P> & Readonly<{
        codec: Adoption;
        bytes: Uint8Array;
        source: DurableEvidence;
    }>): Reply<RawOutput>;
    inspect(input: Mutation<P>): Reply<Readonly<{
        kind: 'retained';
        raw: RawOutput;
    }> | Readonly<{
        kind: 'unknown';
    }> | Readonly<{
        kind: 'excluded';
        evidence: DurableEvidence;
    }>>;
    retainResult(input: Mutation<P> & Readonly<{
        raw: RawOutput;
        value: ToolResult<ContentBlock>;
    }>): Reply<DurableEvidence>;
}
export type ProcessSnapshot = Readonly<{
    cursor: ToolCursor;
    state: ToolState;
    blocks: readonly ProcessBlock[];
}>;
export type DiagnosticPage = Readonly<{
    entries: readonly Readonly<{
        operation: ToolOperationId;
        phase: string;
        code: string;
        evidence: DurableEvidence;
    }>[];
    next: string | null;
}>;
export type ContentPage = Readonly<{
    result: ToolResultVersion;
    attachment: Attachment;
    offset: string;
    bytes: Uint8Array;
    next: string | null;
}>;
export interface ToolContentReader<P> {
    read(input: CallAccess<P> & Readonly<{
        result: ToolResultVersion;
        attachment: Attachment;
        after: string | null;
        maxBytes: number;
    }>): Reply<ContentPage>;
    raw(input: CallAccess<P> & Readonly<{
        result: ToolResultVersion;
    }>): Reply<RawOutput>;
}
export interface ToolReads<P, B extends ContentBlock> {
    lookup(input: CallAccess<P> & Readonly<{
        admission: ToolOperationId;
    }>): Reply<ToolLookup>;
    operation(input: CallAccess<P> & Readonly<{
        operation: ToolOperationId;
    }>): Reply<OperationResolution>;
    result(input: CallAccess<P> & Readonly<{
        result: ToolResultVersion;
        after: string | null;
    }>): Reply<ResultPage<B>>;
    process(input: CallAccess<P> & Readonly<{
        at: ToolCursor | null;
    }>): Reply<ProcessSnapshot>;
    wait(input: CallAccess<P> & Readonly<{
        wait: ToolWaitId;
    }>): Reply<WaitRecord>;
    diagnostics(input: CallAccess<P> & Readonly<{
        after: string | null;
    }>): Reply<DiagnosticPage>;
    account(input: CallAccess<P>): Reply<CallAccount>;
    readonly content: ToolContentReader<P>;
}
export type AccountScope = Readonly<{
    kind: 'tenant';
    tenant: TenantId;
}> | Readonly<{
    kind: 'organization';
    organization: OrganizationId;
}>;
export interface ToolAccounts<P> {
    list(input: Readonly<{
        principal: P;
        scope: AccountScope;
        after: string | null;
        limit: number;
    }>): Reply<Readonly<{
        entries: readonly Readonly<{
            tenant: TenantId;
            call: ToolCallId;
            start: ToolOperationId | null;
            source: DurableEvidence;
            account: CallAccount;
        }>[];
        next: string | null;
    }>>;
}
export interface ToolOffloader<P, B extends ContentBlock> {
    offload(input: Mutation<P> & Readonly<{
        result: ToolResultVersion;
        maxBytes: number;
        headBytes: number;
        tailBytes: number;
    }>): Reply<Readonly<{
        source: DurableEvidence;
        value: ToolResult<B>;
        originalBytes: string;
    }>>;
}
```

## 声明文件 `definitions.d.ts`

```ts
import type { JsonValue } from '@omne-harness/json-text';
import type { OrganizationId, TenantId } from '@omne-harness/legal-identity';
import type { SchemaRef } from '@omne-harness/schema-provider';
import type { ToolDeclarations } from './authoring.ts';
import type { Adoption, ConsumerRef, DurableEvidence } from './identity.ts';
export type ParameterContract = Readonly<{
    schema: JsonValue;
    vocabulary: Adoption;
    descriptions: readonly Readonly<{
        path: string;
        text: string;
    }>[];
}>;
export type ToolSchemaIdentity = Readonly<{
    id: string;
    revision: string;
    digest: string;
}>;
export type ToolValueSchema<T> = Readonly<{
    identity: ToolSchemaIdentity;
    ref: SchemaRef<T>;
    maxBytes: number;
}>;
export type ToolProgramDeclaration = Readonly<{
    kind: 'none';
}> | Readonly<{
    kind: 'json';
    contract: Adoption;
    schema: ToolSchemaIdentity;
    definition: ParameterContract;
    maxBytes: number;
}>;
export type ToolReturnDeclaration = Readonly<{
    kind: 'ordinary' | 'structured';
    program: ToolProgramDeclaration;
}>;
export type ToolAssetVersion = Readonly<{
    name: string;
    adoption: Adoption;
}>;
export type ToolGovernance = Readonly<{
    asset: ToolAssetVersion;
    requiredCapabilities: readonly string[];
    programmable?: boolean;
}>;
export type ToolCommandDeclaration = Readonly<{
    name: string;
    summary: string;
    parameters: Readonly<{
        kind: 'declared';
        value: ParameterContract;
    }> | Readonly<{
        kind: 'executor-owned';
    }>;
    returns: ToolReturnDeclaration;
}>;
export type ToolImplementationShape = Readonly<{
    kind: 'function';
    parameters: ParameterContract;
    returns: ToolReturnDeclaration;
}> | Readonly<{
    kind: 'commands';
    commands: readonly ToolCommandDeclaration[];
}>;
export type ToolImplementationFacts = Readonly<{
    implements: ToolImplementationShape;
    description: string;
    backgroundAllowed: boolean;
    declarations: ToolDeclarations;
}>;
export type ToolDefinition = Readonly<{
    adoption: Adoption;
    name: string;
    description: string;
    requiredCapabilities: readonly string[];
    backgroundAllowed: boolean;
    programmable?: boolean;
    declarations: ToolDeclarations;
}> & ToolImplementationShape;
declare const workspaceIdBrand: unique symbol;
export type WorkspaceId = string & {
    readonly [workspaceIdBrand]: true;
};
export type SourceLayer = Readonly<{
    kind: 'official';
}> | Readonly<{
    kind: 'organization';
    organization: OrganizationId;
}> | Readonly<{
    kind: 'tenant';
    tenant: TenantId;
}> | Readonly<{
    kind: 'workspace';
    workspace: WorkspaceId;
}>;
export type ToolAvailability = Readonly<{
    kind: 'available';
    definition: ToolDefinition;
    executor: Adoption;
    layer: SourceLayer;
}> | Readonly<{
    kind: 'known-unavailable';
    definition: ToolDefinition;
    reason: string;
}>;
export type ToolArguments = Readonly<{
    original: string;
    effective: string;
    complete: boolean;
}>;
export type ResourceScope = Readonly<{
    owner: string;
    key: string;
    grant: DurableEvidence;
}>;
export type ToolInvocation = Readonly<{
    kind: 'direct' | 'programmatic';
    source: DurableEvidence;
}>;
export type FixedToolRequest = Readonly<{
    availability: ToolAvailability;
    invocation: ToolInvocation;
    command: string | null;
    arguments: ToolArguments;
    settings: Adoption;
    context: Adoption;
    workspace: Adoption | null;
    environment: Adoption;
    resources: readonly Adoption[];
    scope: ResourceScope;
    consumer: ConsumerRef;
    batchDecision: DurableEvidence | null;
    mode: 'foreground' | 'background';
    limits: Readonly<{
        concurrency: number | null;
        foregroundMs: number | null;
        backgroundAfterMs: number | null;
    }>;
}>;
export {};
```

## 声明文件 `dynamics.d.ts`

```ts
import { type Outcome } from '@omne-harness/operation-result';
import type { ToolBindingKey, ToolShape } from './authoring.ts';
import type { SourceLayer, ToolDefinition, ToolGovernance, ToolImplementationFacts } from './definitions.ts';
import type { DurableEvidence } from './identity.ts';
export declare function deriveDefinition(governance: ToolGovernance, facts: ToolImplementationFacts): ToolDefinition;
export declare function shapeOf(definition: ToolDefinition): ToolShape;
export declare function sameShape(left: ToolShape, right: ToolShape): boolean;
export declare function sameSourceLayer(left: SourceLayer, right: SourceLayer): boolean;
export declare function sameBindingKey(left: ToolBindingKey, right: ToolBindingKey): boolean;
export type ToolReloadResult = Readonly<{
    kind: 'loaded';
}> | Readonly<{
    kind: 'recognized';
}> | Readonly<{
    kind: 'missing';
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'rejected';
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'unavailable';
}> | Readonly<{
    kind: 'denied';
}> | Readonly<{
    kind: 'invalid';
}> | Readonly<{
    kind: 'conflict';
    usable: boolean;
}> | Readonly<{
    kind: 'draining';
}>;
export type FreezeVerdict = Readonly<{
    cause: 'tool-shape-lost';
    evidence: DurableEvidence;
}>;
export type AdoptionFacts = Readonly<{
    recorded: Readonly<{
        key: ToolBindingKey;
        shape: ToolShape;
        usable: boolean;
    }>;
    sameShape: readonly ToolBindingKey[];
    winner: Readonly<{
        key: ToolBindingKey;
        shape: ToolShape;
    }> | null;
    reload: ToolReloadResult | null;
}>;
export type AdoptionPlan = Readonly<{
    kind: 'advance';
    key: ToolBindingKey;
}> | Readonly<{
    kind: 'keep';
    key: ToolBindingKey;
}> | Readonly<{
    kind: 'fallback';
    key: ToolBindingKey;
}> | Readonly<{
    kind: 'reload';
    key: ToolBindingKey;
}> | Readonly<{
    kind: 'replacement';
}> | Readonly<{
    kind: 'freeze';
    verdict: FreezeVerdict;
}>;
export declare function planAdoption(facts: AdoptionFacts): AdoptionPlan;
export type RefreshFacts = Readonly<{
    recorded: Readonly<{
        key: ToolBindingKey;
        usable: boolean;
    }>;
    sameShape: readonly ToolBindingKey[];
}>;
export type RefreshOutcome = Readonly<{
    kind: 'available';
    key: ToolBindingKey;
}> | Readonly<{
    kind: 'routed';
    key: ToolBindingKey;
}> | Readonly<{
    kind: 'unavailable';
}>;
export declare function refreshAvailability(facts: RefreshFacts): RefreshOutcome;
export type ResidentTool = Readonly<{
    definition: ToolDefinition;
    shape: ToolShape;
    key: ToolBindingKey;
}>;
export type ResidentFoldFailure = Readonly<{
    kind: 'already-resident';
    name: string;
}> | Readonly<{
    kind: 'shape-mismatch';
    name: string;
}>;
export declare function foldResident(resident: readonly ResidentTool[], admitted: ResidentTool): Outcome<readonly ResidentTool[], ResidentFoldFailure>;
```

## 声明文件 `execution.d.ts`

```ts
import type { CallAccount } from '@omne-harness/call-account';
import type { ContentBlock } from '@omne-harness/content-block';
import type { Outcome } from '@omne-harness/operation-result';
import type { TenantId } from '@omne-harness/legal-identity';
import type { ToolExecutionContext } from './author-context.ts';
import type { RawOutput } from './custody.ts';
import type { FixedToolRequest } from './definitions.ts';
import type { Access, Adoption, CallAccess, ConsumerRef, DurableEvidence, Mutation, ToolCallId, ToolCursor, ToolDeliveryId, ToolInstanceId, ToolOperationId, ToolResultVersion, ToolRevision, ToolWaitId } from './identity.ts';
import type { ControlReceipt, Handoff, ProcessBlock, ToolControl } from './operations.ts';
import type { ToolStartRecord } from './ports.ts';
import type { ProgramClosure } from './program.ts';
import type { Checkpoint, ControlProgress, ControlRecord, FactBatch, FactProgress, FactReceipt, PreparationRecord, ProgramScheduling, ReleaseProgress, ReleaseRecord, ResponseProgress, ResponseRecord, StartProgress, SuspensionRecord, TaskResolution, ToolTask, WaitIntent, WaitRecord } from './records.ts';
import type { DeliveryState, ReleasedDelivery, Effect, Reply, ToolResult, ToolState, ToolTerminal, WaitState } from './results.ts';
export interface TextRenderer<R> {
    render(value: R): Outcome<string, Readonly<{
        reason: string;
    }>>;
}
export interface ToolExecutor<A, R, E> {
    execute(argumentsValue: A, environment: E, execution: ToolExecutionContext): Promise<R>;
}
export interface ResultPolicy<B extends ContentBlock> {
    readonly adoption: Adoption;
    judge(value: ContentBlock): Outcome<B, Readonly<{
        reason: string;
    }>>;
    judgeResult(value: ToolResult<ContentBlock>): Outcome<ToolResult<B>, Readonly<{
        reason: string;
    }>>;
}
export type ToolExecutionRef = Readonly<{
    tenant: TenantId;
    call: ToolCallId;
    instance: ToolInstanceId;
    generation: string;
}>;
export type WriteContext = ToolExecutionRef & Readonly<{
    operation: ToolOperationId;
    expected: ToolRevision;
}>;
export type ToolRecovery<B extends ContentBlock> = Readonly<{
    state: ToolState;
    request: FixedToolRequest;
    admission: ToolOperationId;
    initiator: Readonly<{
        owner: string;
        subject: string;
        revision: string;
    }>;
    execution: ToolExecutionRef | null;
    checkpoint: DurableEvidence | null;
    start: ToolStartRecord | null;
    startRejection: Readonly<{
        reason: string;
        exclusion: DurableEvidence;
    }> | null;
    invocations: readonly ToolStartRecord[];
    controls: readonly ControlRecord[];
    result: ToolResult<B> | null;
    unresolved: readonly ToolOperationId[];
    preparations: readonly PreparationRecord[];
    waits: readonly WaitRecord[];
    suspensions: readonly SuspensionRecord[];
    rawOutputs: readonly RawOutput[];
    tasks: readonly ToolTask[];
    program: ProgramClosure | null;
    scheduling: ProgramScheduling | null;
    streams: readonly FactProgress[];
}>;
export interface ToolCommands<P, B extends ContentBlock> {
    admit(input: Mutation<P> & Readonly<{
        request: FixedToolRequest;
    }>): Reply<ToolState>;
    control(input: Mutation<P> & Readonly<{
        intent: ToolControl;
    }>): Reply<ControlReceipt>;
    acceptDecision(input: Mutation<P> & Readonly<{
        wait: ToolWaitId;
        decision: DurableEvidence;
    }>): Reply<WaitState>;
    acceptResource(input: Mutation<P> & Readonly<{
        wait: ToolWaitId;
        response: DurableEvidence;
    }>): Reply<WaitRecord>;
    releaseDelivery(input: Mutation<P> & Readonly<{
        result: ToolResultVersion;
        delivery: ToolDeliveryId;
        consumer: ConsumerRef;
        evidence: Handoff;
    }>): Reply<ReleasedDelivery>;
    scanPending(input: Access<P> & Readonly<{
        after: string | null;
        limit: number;
    }>): Reply<Readonly<{
        calls: readonly ToolCallId[];
        next: string | null;
    }>>;
    loadRecovery(input: CallAccess<P>): Reply<ToolRecovery<B>>;
    claim(input: Mutation<P> & Readonly<{
        instance: ToolInstanceId;
        continuity: DurableEvidence;
    }>): Reply<ToolExecutionRef>;
    planPreparation(input: WriteContext & Readonly<{
        request: FixedToolRequest;
        purpose: 'initial' | 'resume';
    }>): Reply<PreparationRecord>;
    prepared(input: WriteContext & Readonly<{
        preparation: PreparationRecord;
        resources: DurableEvidence;
    }>): Reply<ToolState>;
    enqueue(input: WriteContext): Reply<ToolState>;
    prepareStart(input: WriteContext): Reply<Readonly<{
        state: ToolState;
        start: Extract<ToolStartRecord, {
            kind: 'start';
        }>;
    }>>;
    prepareResume(input: WriteContext & Readonly<{
        checkpoint: DurableEvidence;
    }>): Reply<Readonly<{
        state: ToolState;
        start: Extract<ToolStartRecord, {
            kind: 'resume';
        }>;
    }>>;
    rejectPending(input: WriteContext & Readonly<{
        reason: string;
        exclusion: DurableEvidence;
    }>): Reply<ToolState>;
    recordStart(input: WriteContext & Readonly<{
        invocation: ToolStartRecord;
        outcome: StartProgress;
    }>): Reply<ToolState>;
    preserveProcess(input: WriteContext & Readonly<{
        blocks: readonly ProcessBlock[];
    }>): Reply<ToolCursor>;
    openWait(input: WriteContext & Readonly<{
        wait: WaitIntent;
    }>): Reply<WaitRecord>;
    attachRegistration(input: WriteContext & Readonly<{
        wait: ToolWaitId;
        registration: DurableEvidence;
    }>): Reply<WaitRecord>;
    attachResource(input: WriteContext & Readonly<{
        wait: ToolWaitId;
        registration: DurableEvidence;
    }>): Reply<WaitRecord>;
    planSuspension(input: WriteContext & Readonly<{
        start: ToolStartRecord;
        schema: Adoption;
    }>): Reply<SuspensionRecord>;
    suspend(input: WriteContext & Readonly<{
        suspension: SuspensionRecord;
        checkpoint: Checkpoint;
    }>): Reply<ToolState>;
    preserveResult(input: WriteContext & Readonly<{
        raw: RawOutput;
        value: ToolResult<B>;
        terminal: ToolTerminal;
        effect: Effect;
    }>): Reply<ToolState>;
    recordResponse(input: WriteContext & Readonly<{
        response: ResponseRecord;
        outcome: ResponseProgress;
    }>): Reply<WaitRecord>;
    closeWait(input: WriteContext & Readonly<{
        wait: ToolWaitId;
        continuation: DurableEvidence;
    }>): Reply<ToolState>;
    recordControl(input: Mutation<P> & Readonly<{
        control: ToolOperationId;
        source: DurableEvidence;
        progress: ControlProgress;
    }>): Reply<ControlRecord>;
    receiveFacts(input: CallAccess<P> & Readonly<{
        start: ToolStartRecord;
        batch: FactBatch<B>;
    }>): Reply<FactReceipt>;
    recordFactAcknowledgement(input: Mutation<P> & Readonly<{
        receipt: FactReceipt;
        sourceReceipt: DurableEvidence;
    }>): Reply<FactProgress>;
    recordScheduling(input: WriteContext & Readonly<{
        scheduling: ProgramScheduling;
    }>): Reply<ToolState>;
    recordAccount(input: Mutation<P> & Readonly<{
        start: ToolStartRecord | null;
        source: DurableEvidence;
        event: string;
        value: CallAccount;
    }>): Reply<DurableEvidence>;
    planRelease(input: Mutation<P> & Readonly<{
        preparation: PreparationRecord;
        custody: DurableEvidence;
    }>): Reply<ReleaseRecord>;
    recordRelease(input: Mutation<P> & Readonly<{
        release: ReleaseRecord;
        outcome: ReleaseProgress;
    }>): Reply<DurableEvidence>;
    recordLateFact(input: Mutation<P> & Readonly<{
        source: DurableEvidence;
        event: string;
        fact: Readonly<{
            kind: 'account';
            value: CallAccount;
        }> | Readonly<{
            kind: 'effect';
            value: Effect;
        }>;
    }>): Reply<ToolRevision>;
    recordLateResult(input: Mutation<P> & Readonly<{
        start: ToolStartRecord;
        source: DurableEvidence;
        event: string;
        raw: RawOutput;
        value: ToolResult<B>;
        actual: ToolTerminal;
        effect: Effect;
    }>): Reply<Readonly<{
        result: ToolResultVersion;
        delivery: DeliveryState;
    }>>;
    settleLost(input: Mutation<P> & Readonly<{
        continuity: DurableEvidence;
    }>): Reply<ToolState>;
    recordTask(input: Mutation<P> & Readonly<{
        task: ToolTask;
        resolution: TaskResolution;
    }>): Reply<DurableEvidence>;
}
```

## 声明文件 `identity.d.ts`

```ts
import { type Outcome } from '@omne-harness/operation-result';
import type { Access } from '@omne-harness/legal-identity';
declare const toolIdentity: unique symbol;
export type ToolIdentity<K extends string> = string & {
    readonly [toolIdentity]: K;
};
export type ToolCallId = ToolIdentity<'ToolCallId'>;
export type ToolOperationId = ToolIdentity<'ToolOperationId'>;
export type ToolInstanceId = ToolIdentity<'ToolInstanceId'>;
export type ToolWaitId = ToolIdentity<'ToolWaitId'>;
export type ToolResultVersion = ToolIdentity<'ToolResultVersion'>;
export type ToolDeliveryId = ToolIdentity<'ToolDeliveryId'>;
export type ToolCursor = ToolIdentity<'ToolCursor'>;
export type ToolRevision = ToolIdentity<'ToolRevision'>;
export type { Adoption, ConsumerRef, DurableEvidence } from '@omne-harness/exchange-refs';
export type { Access } from '@omne-harness/legal-identity';
export type CallAccess<P> = Access<P> & Readonly<{
    call: ToolCallId;
}>;
export type Mutation<P> = CallAccess<P> & Readonly<{
    operation: ToolOperationId;
}>;
export type ToolIdentityRejection<K extends string> = Readonly<{
    field: K;
    reason: 'type' | 'empty' | 'length' | 'character';
}>;
export declare const TOOL_IDENTITY_MAX_LENGTH = 256;
export declare function decodeToolCallId(text: unknown): Outcome<ToolCallId, ToolIdentityRejection<'ToolCallId'>>;
export declare function decodeToolOperationId(text: unknown): Outcome<ToolOperationId, ToolIdentityRejection<'ToolOperationId'>>;
export declare function decodeToolInstanceId(text: unknown): Outcome<ToolInstanceId, ToolIdentityRejection<'ToolInstanceId'>>;
export declare function decodeToolWaitId(text: unknown): Outcome<ToolWaitId, ToolIdentityRejection<'ToolWaitId'>>;
export declare function decodeToolResultVersion(text: unknown): Outcome<ToolResultVersion, ToolIdentityRejection<'ToolResultVersion'>>;
export declare function decodeToolDeliveryId(text: unknown): Outcome<ToolDeliveryId, ToolIdentityRejection<'ToolDeliveryId'>>;
export declare function decodeToolCursor(text: unknown): Outcome<ToolCursor, ToolIdentityRejection<'ToolCursor'>>;
export declare function decodeToolRevision(text: unknown): Outcome<ToolRevision, ToolIdentityRejection<'ToolRevision'>>;
```

## 声明文件 `index.d.ts`

```ts
export { decodeToolCallId, decodeToolOperationId } from './identity.ts';
export type { Access, Adoption, ConsumerRef, DurableEvidence, ToolCallId, ToolCursor, ToolDeliveryId, ToolIdentity, ToolIdentityRejection, ToolInstanceId, ToolOperationId, ToolResultVersion, ToolRevision, ToolWaitId, } from './identity.ts';
export { encodeToolInvocationRef, encodeToolOperationRef, readToolOperationRef, resolveToolInvocationRef, resolveToolOperationRef, } from './reference.ts';
export type { ToolInvocationParts, ToolInvocationRef, ToolOperationParts, ToolOperationRef, ToolReferenceFailure, ToolReferenceRejection, } from './reference.ts';
export type { FixedToolRequest, ParameterContract, ResourceScope, SourceLayer, ToolArguments, ToolAvailability, ToolCommandDeclaration, ToolDefinition, ToolImplementationShape, ToolInvocation, ToolProgramDeclaration, ToolReturnDeclaration, ToolSchemaIdentity, WorkspaceId, } from './definitions.ts';
export type { ActiveRelation, Attachment, DeliveryState, Effect, InterruptionCause, OperationResolution, ReleasedDelivery, Reply, ResultPage, ToolFailure, ToolLookup, ToolRelation, ToolResult, ToolResultData, ToolState, ToolTerminal, WaitState, } from './results.ts';
export type { BackgroundSource, ControlReceipt, ForegroundReturn, Handoff, InvocationAccess, ProcessBlock, ToolCommandOutcome, ToolControl, ToolDefiniteFailure, ToolInvocationCommands, ToolInvocationContentReader, ToolInvocationQueries, ToolInvokeOutcome, ToolInvokeRequest, ToolReleaseDeliveryOutcome, ToolRuntime, ToolStreamDelta, ToolStreamEnd, ToolStreamObservation, ToolStreamReferences, ToolStreamSelection, ToolStreamSnapshot, } from './operations.ts';
export type { ToolDecision, ToolWaitSchemaSnapshot } from './author-context.ts';
export type { ToolExecutionRef } from './execution.ts';
export type { DecisionValue, ToolStartRecord } from './ports.ts';
export type { ToolCatalog, ToolConsumerProfile, ToolDeclarations, ToolInspection, ToolSettingsDeclaration, ToolUsage, } from './authoring.ts';
export type { ClockSegment, ControlProgress, ControlRecord, ExternalResponse, PhysicalExecution, ProtocolIdentity, QueuePosition, ResponseProgress, ResponseRecord, ToolTiming, WaitIntent, WaitRecord, } from './records.ts';
export type { ContentPage, DiagnosticPage, ProcessSnapshot, RawOutput } from './custody.ts';
export { judgeToolDelivery } from './result-delivery.ts';
export type { ToolDelivery, ToolDeliveryFailure, ToolDeliveryKey, ToolDeliveryRejection, ToolResultReceiver, ToolSavedReceipt, } from './result-delivery.ts';
```

## 声明文件 `json-tree.d.ts`

```ts
import { type JsonValue } from '@omne-harness/json-text';
import { type Check } from './shape.ts';
export declare const jsonValue: Check<JsonValue>;
export declare const jsonObject: Check<Extract<JsonValue, {
    kind: 'object';
}>>;
export declare function jsonTextBytes(tree: JsonValue): number;
```

## 声明文件 `judge-definition.d.ts`

```ts
import { type Outcome } from '@omne-harness/operation-result';
import type { ToolDeclarations } from './authoring.ts';
import type { ToolImplementationDeclaration } from './authoring.ts';
import type { ParameterContract, ToolDefinition, ToolImplementationFacts, ToolProgramDeclaration, ToolReturnDeclaration } from './definitions.ts';
import { type Check } from './shape.ts';
export declare const parameterContract: Check<ParameterContract>;
export declare const programDeclaration: Check<ToolProgramDeclaration>;
export declare const returnDeclaration: Check<ToolReturnDeclaration>;
export declare const toolDeclarations: Check<ToolDeclarations>;
export declare const commandName: Check<string>;
export declare const commandSummary: Check<string>;
export declare const implementationDeclaration: Check<ToolImplementationDeclaration>;
export declare const toolDefinition: Check<ToolDefinition>;
export declare function judgeImplementationFacts(value: unknown): Outcome<ToolImplementationFacts, Readonly<{
    field: string;
    reason: string;
}>>;
export declare function judgeToolDefinition(value: unknown): Outcome<ToolDefinition, Readonly<{
    field: string;
    reason: string;
}>>;
```

## 声明文件 `judge-release.d.ts`

```ts
import type { Outcome } from '@omne-harness/operation-result';
import type { ConsumerRef } from './identity.ts';
import type { Handoff } from './operations.ts';
export declare function judgeConsumerRef(value: unknown): Outcome<ConsumerRef, Readonly<{
    field: string;
    reason: string;
}>>;
export declare function judgeHandoff(value: unknown): Outcome<Handoff, Readonly<{
    field: string;
    reason: string;
}>>;
```

## 声明文件 `judge-request.d.ts`

```ts
import { type Outcome } from '@omne-harness/operation-result';
import type { FixedToolRequest } from './definitions.ts';
import type { ToolInvokeRequest } from './operations.ts';
export declare function judgeFixedToolRequest(value: unknown): Outcome<FixedToolRequest, Readonly<{
    field: string;
    reason: string;
}>>;
export declare function judgeToolInvokeRequest(value: unknown): Outcome<ToolInvokeRequest, Readonly<{
    field: string;
    reason: string;
}>>;
```

## 声明文件 `judge-state.d.ts`

```ts
import { type Outcome } from '@omne-harness/operation-result';
import type { ToolState } from './results.ts';
export declare function judgeToolState(value: unknown): Outcome<ToolState, Readonly<{
    field: string;
    reason: string;
}>>;
```

## 声明文件 `operations.d.ts`

```ts
import type { CallAccount } from '@omne-harness/call-account';
import type { ContentBlock } from '@omne-harness/content-block';
import type { StreamId, StreamObserver, StreamRef } from '@omne-harness/stream-arrival';
import type { ToolCatalog, ToolInspection } from './authoring.ts';
import type { ContentPage, DiagnosticPage, ProcessSnapshot, RawOutput } from './custody.ts';
import type { FixedToolRequest, ToolAvailability } from './definitions.ts';
import type { Access, CallAccess, ConsumerRef, DurableEvidence, ToolCallId, ToolCursor, ToolDeliveryId, ToolInstanceId, ToolOperationId, ToolResultVersion, ToolWaitId } from './identity.ts';
import type { ControlProgress, WaitRecord } from './records.ts';
import type { ToolInvocationRef, ToolOperationRef } from './reference.ts';
import type { Attachment, ReleasedDelivery, OperationResolution, Reply, ResultPage, ToolFailure, ToolLookup, ToolState } from './results.ts';
export type ToolControl = Readonly<{
    kind: 'stop';
}> | Readonly<{
    kind: 'withdraw';
    reach: 'all' | 'foreground-and-unadmitted';
}> | Readonly<{
    kind: 'background';
}>;
export type ControlReceipt = Readonly<{
    operation: ToolOperationId;
    state: ToolState;
    progress: ControlProgress;
}>;
export type BackgroundSource = Readonly<{
    kind: 'launched';
}> | Readonly<{
    kind: 'control';
    operation: ToolOperationId;
}> | Readonly<{
    kind: 'foreground-limit';
}> | Readonly<{
    kind: 'threshold';
}>;
export type ForegroundReturn = Readonly<{
    kind: 'final';
    result: ToolResultVersion;
}> | Readonly<{
    kind: 'background';
    call: ToolCallId;
    source: BackgroundSource;
}>;
export type ProcessBlock = Readonly<{
    index: string;
    mode: 'append' | 'replace';
    state: 'open' | 'closed';
    sequence: string;
    content: ContentBlock;
    trim: Readonly<{
        removed: string;
        reason: string;
    }> | null;
}>;
export type ToolStreamSnapshot = Readonly<{
    state: ToolState;
    process: readonly ProcessBlock[];
    foreground: ForegroundReturn | null;
}>;
export type ToolStreamDelta = Readonly<{
    state: ToolState;
    blocks: readonly ProcessBlock[];
}>;
export type ToolStreamEnd = Readonly<{
    reason: 'closed' | 'stale-instance';
}>;
export type ToolStreamObservation<P> = StreamObserver<P, ToolStreamSnapshot, ToolStreamDelta, ToolStreamEnd>;
export type ToolStreamSelection = Readonly<{
    state: ToolState;
    current: Readonly<{
        ref: StreamRef;
        instance: ToolInstanceId;
        generation: string;
        projection: 'tool-process-v1';
    }> | null;
}>;
export interface ToolStreamReferences<P> {
    current(input: Readonly<{
        access: Access<P>;
        reference: ToolInvocationRef;
    }>): Reply<ToolStreamSelection>;
}
export interface ToolHandle<P> {
    readonly instance: ToolInstanceId;
    readonly generation: string;
    readonly stream: StreamId;
    readonly observation: ToolStreamObservation<P>;
}
export interface ToolDirectory<P> {
    connect(input: CallAccess<P>): Reply<Readonly<{
        kind: 'live';
        handle: ToolHandle<P>;
    }> | Readonly<{
        kind: 'no-live-route';
    }>>;
}
export type Handoff = Readonly<{
    kind: 'retained';
    custody: DurableEvidence;
}> | Readonly<{
    kind: 'processed';
    completion: DurableEvidence;
}>;
export type ToolInvokeRequest = Omit<FixedToolRequest, 'invocation'>;
export type InvocationAccess<P> = Access<P> & Readonly<{
    reference: ToolInvocationRef;
}>;
export type ToolDefiniteFailure = Exclude<ToolFailure, {
    kind: 'commit-unknown';
}>;
export type ToolInvokeOutcome = Readonly<{
    kind: 'accepted';
    reference: ToolInvocationRef;
    state: ToolState;
    recovered: boolean;
}> | Readonly<{
    kind: 'commit-unknown';
    reference: ToolInvocationRef;
}> | Readonly<{
    kind: 'association-unknown';
}> | Readonly<{
    kind: 'rejected';
    failure: ToolDefiniteFailure;
}>;
export type ToolCommandOutcome<T> = Readonly<{
    kind: 'committed';
    operation: ToolOperationRef;
    receipt: T;
}> | Readonly<{
    kind: 'commit-unknown';
    operation: ToolOperationRef;
}> | Readonly<{
    kind: 'rejected';
    failure: ToolDefiniteFailure;
}>;
export type ToolReleaseDeliveryOutcome = Readonly<{
    kind: 'released';
    receipt: ReleasedDelivery;
}> | Readonly<{
    kind: 'commit-unknown';
    operation: ToolOperationRef;
}> | Readonly<{
    kind: 'rejected';
    failure: ToolDefiniteFailure;
}>;
export interface ToolInvocationQueries<P, B extends ContentBlock> {
    lookup(input: InvocationAccess<P>): Reply<ToolLookup>;
    queryOperation(input: Access<P> & Readonly<{
        operation: ToolOperationRef;
    }>): Reply<OperationResolution>;
    readProcess(input: InvocationAccess<P> & Readonly<{
        at: ToolCursor | null;
    }>): Reply<ProcessSnapshot>;
    readWait(input: InvocationAccess<P> & Readonly<{
        wait: ToolWaitId;
    }>): Reply<WaitRecord>;
    readDiagnostics(input: InvocationAccess<P> & Readonly<{
        after: string | null;
    }>): Reply<DiagnosticPage>;
    readResult(input: InvocationAccess<P> & Readonly<{
        result: ToolResultVersion;
        after: string | null;
    }>): Reply<ResultPage<B>>;
    account(input: InvocationAccess<P>): Reply<CallAccount>;
}
export interface ToolInvocationCommands<P> {
    control(input: InvocationAccess<P> & Readonly<{
        intent: ToolControl;
    }>): Promise<ToolCommandOutcome<ControlReceipt>>;
    releaseDelivery(input: InvocationAccess<P> & Readonly<{
        result: ToolResultVersion;
        delivery: ToolDeliveryId;
        consumer: ConsumerRef;
        evidence: Handoff;
    }>): Promise<ToolReleaseDeliveryOutcome>;
}
export interface ToolInvocationContentReader<P> {
    read(input: InvocationAccess<P> & Readonly<{
        result: ToolResultVersion;
        attachment: Attachment;
        after: string | null;
        maxBytes: number;
    }>): Reply<ContentPage>;
    raw(input: InvocationAccess<P> & Readonly<{
        result: ToolResultVersion;
    }>): Reply<RawOutput>;
}
export interface ToolRuntime<P, B extends ContentBlock> {
    invoke(input: Access<P> & Readonly<{
        request: ToolInvokeRequest;
    }>): Promise<ToolInvokeOutcome>;
    inspect(input: ToolInspection<P>): Reply<ToolAvailability>;
    readonly queries: ToolInvocationQueries<P, B>;
    readonly commands: ToolInvocationCommands<P>;
    readonly instances: ToolStreamReferences<P>;
    readonly observation: ToolStreamObservation<P>;
    readonly content: ToolInvocationContentReader<P>;
    readonly catalog: ToolCatalog<P>;
}
```

## 声明文件 `parameter-codec.d.ts`

```ts
import { type JsonLimits, type JsonValue } from '@omne-harness/json-text';
import { type Outcome } from '@omne-harness/operation-result';
import type { ParameterCodec } from './authoring.ts';
import type { ToolArguments } from './definitions.ts';
import { type Check } from './shape.ts';
export declare const toolArguments: Check<ToolArguments>;
export declare function createDefaultParameterCodec(limits: JsonLimits): Outcome<ParameterCodec<JsonValue>, Readonly<{
    field: string;
    reason: string;
}>>;
export type ParsedToolArguments = Readonly<{
    original: JsonValue;
    effective: JsonValue;
}>;
export type ToolArgumentsRejection = Readonly<{
    kind: 'shape';
    field: string;
    reason: string;
}> | Readonly<{
    kind: 'incomplete';
}> | Readonly<{
    kind: 'invalid';
    field: 'original' | 'effective';
    reason: string;
}>;
export declare function judgeToolArguments(input: unknown, limits: JsonLimits): Outcome<ParsedToolArguments, ToolArgumentsRejection>;
```

## 声明文件 `ports.d.ts`

```ts
import type { CallAccount } from '@omne-harness/call-account';
import type { ContentBlock } from '@omne-harness/content-block';
import type { JsonValue } from '@omne-harness/json-text';
import type { TenantId } from '@omne-harness/legal-identity';
import type { ToolDecision } from './author-context.ts';
import type { ToolInspection } from './authoring.ts';
import type { RawOutput } from './custody.ts';
import type { FixedToolRequest, ToolAvailability, ToolInvocation } from './definitions.ts';
import type { ToolExecutionRef } from './execution.ts';
import type { Access, Adoption, CallAccess, DurableEvidence, Mutation, ToolCallId, ToolInstanceId, ToolOperationId, ToolWaitId } from './identity.ts';
import type { ProcessBlock, ToolDirectory, ToolHandle, ToolInvokeRequest, ToolDefiniteFailure, ToolRuntime } from './operations.ts';
import type { ClockSegment, ControlDispatch, ControlProgress, DrainState, ExternalOperationResolution, FactBatch, FactReceipt, PreparationProgress, PreparationRecord, ProgramScheduling, ReleaseProgress, ReleaseRecord, ResponseProgress, ResponseRecord, StartPermit, SuspensionProgress, SuspensionRecord, ToolRecoveryBinding, WaitIntent } from './records.ts';
import type { Effect, Reply, ToolResult, ToolTerminal } from './results.ts';
export type DecisionValue = ToolDecision<JsonValue>;
export interface ToolDecisionBridge<P> {
    inspectOperation(input: Mutation<P>): Reply<ExternalOperationResolution>;
    ensure(input: Mutation<P> & Readonly<{
        wait: ToolWaitId;
        request: DurableEvidence;
    }>): Reply<DurableEvidence>;
    inspect(input: CallAccess<P> & Readonly<{
        wait: ToolWaitId;
    }>): Reply<Readonly<{
        registration: DurableEvidence;
        decision: DurableEvidence | null;
    }>>;
    invalidate(input: Mutation<P> & Readonly<{
        wait: ToolWaitId;
        terminal: DurableEvidence;
    }>): Reply<DurableEvidence>;
    resolve(input: CallAccess<P> & Readonly<{
        wait: ToolWaitId;
        decision: DurableEvidence;
    }>): Reply<DecisionValue>;
}
export type ToolExecutionFact<B extends ContentBlock> = Readonly<{
    kind: 'process';
    blocks: readonly ProcessBlock[];
}> | Readonly<{
    kind: 'wait';
    value: WaitIntent;
}> | Readonly<{
    kind: 'continued';
    wait: ToolWaitId;
    response: ToolOperationId;
    timing: DurableEvidence;
}> | Readonly<{
    kind: 'program-scheduling';
    value: ProgramScheduling;
}> | Readonly<{
    kind: 'account';
    event: string;
    value: CallAccount;
}> | Readonly<{
    kind: 'final';
    raw: RawOutput;
    result: ToolResult<B>;
    terminal: ToolTerminal;
    effect: Effect;
}>;
export interface ToolLiveExecution<B extends ContentBlock> {
    facts(input: Readonly<{
        after: string | null;
        signal: AbortSignal;
    }>): AsyncIterable<FactBatch<B>>;
    acknowledge(input: FactReceipt): Reply<DurableEvidence>;
    stop(input: ControlDispatch): Reply<ControlProgress>;
    inspectControl(input: ControlDispatch): Reply<ControlProgress>;
    answer(input: ResponseRecord): Reply<ResponseProgress>;
    inspectAnswer(input: ResponseRecord): Reply<ResponseProgress>;
}
export type ToolStartRecord = Readonly<{
    operation: ToolOperationId;
    executor: Adoption;
    execution: ToolExecutionRef;
}> & (Readonly<{
    kind: 'start';
}> | Readonly<{
    kind: 'resume';
    checkpoint: DurableEvidence;
}>);
export type ToolStartLookup<B extends ContentBlock> = Readonly<{
    kind: 'not-started';
    exclusion: DurableEvidence;
}> | Readonly<{
    kind: 'unknown';
    diagnostic: string;
}> | Readonly<{
    kind: 'live';
    execution: ToolLiveExecution<B>;
}> | Readonly<{
    kind: 'settled';
    source: DurableEvidence;
    event: string;
    fact: Extract<ToolExecutionFact<B>, {
        kind: 'final';
    }>;
}> | Readonly<{
    kind: 'lost';
    continuity: DurableEvidence;
}>;
export type ToolExecutorBinding<P, B extends ContentBlock, E> = Readonly<{
    kind: 'live-only';
    start(input: CallAccess<P> & Readonly<{
        start: Extract<ToolStartRecord, {
            kind: 'start';
        }>;
        permit: StartPermit;
        request: FixedToolRequest;
    }>, environment: E): Reply<ToolLiveExecution<B>>;
    inspectStart(input: CallAccess<P> & Readonly<{
        start: ToolStartRecord;
    }>): Reply<ToolStartLookup<B>>;
}> | Readonly<{
    kind: 'checkpointed';
    checkpointSchema: Adoption;
    start(input: CallAccess<P> & Readonly<{
        start: Extract<ToolStartRecord, {
            kind: 'start';
        }>;
        permit: StartPermit;
        request: FixedToolRequest;
    }>, environment: E): Reply<ToolLiveExecution<B>>;
    inspectStart(input: CallAccess<P> & Readonly<{
        start: ToolStartRecord;
    }>): Reply<ToolStartLookup<B>>;
    suspend(input: SuspensionRecord): Reply<SuspensionProgress>;
    inspectSuspension(input: SuspensionRecord): Reply<SuspensionProgress>;
    resume(input: CallAccess<P> & Readonly<{
        start: Extract<ToolStartRecord, {
            kind: 'resume';
        }>;
        permit: StartPermit;
        request: FixedToolRequest;
    }>, environment: E): Reply<ToolLiveExecution<B>>;
}>;
export interface PreparedEnvironment<E> {
    readonly value: E;
    readonly evidence: DurableEvidence;
    readonly preparation: PreparationRecord;
}
export interface ToolEnvironment<P, E> {
    prepare(input: CallAccess<P> & Readonly<{
        preparation: PreparationRecord;
    }>): Reply<PreparationProgress<E>>;
    inspectPreparation(input: CallAccess<P> & Readonly<{
        preparation: PreparationRecord;
    }>): Reply<PreparationProgress<E>>;
    release(input: CallAccess<P> & Readonly<{
        release: ReleaseRecord;
    }>): Reply<ReleaseProgress>;
    inspectRelease(input: CallAccess<P> & Readonly<{
        release: ReleaseRecord;
    }>): Reply<ReleaseProgress>;
}
export interface ToolBindings<P, B extends ContentBlock, E> {
    inspect(input: ToolInspection<P>): Reply<ToolAvailability>;
    resolve(input: CallAccess<P> & Readonly<{
        request: FixedToolRequest;
    }>): Reply<ToolExecutorBinding<P, B, E>>;
    recover(input: CallAccess<P> & Readonly<{
        start: ToolStartRecord;
    }>): Reply<ToolRecoveryBinding<B>>;
}
export interface ToolInstanceHost<P> {
    install(driver: ToolDriver<P>): Readonly<{
        release(): Promise<void>;
    }>;
    schedule(input: Readonly<{
        tenant: TenantId;
        call: ToolCallId;
    }>): Reply<Readonly<{
        queued: true;
    }>>;
    publish(input: ToolExecutionRef, handle: ToolHandle<P>): Reply<Readonly<{
        execution: ToolExecutionRef;
        registration: string;
    }>>;
    withdraw(input: Readonly<{
        execution: ToolExecutionRef;
        registration: string;
    }>): Reply<Readonly<{
        removed: boolean;
    }>>;
    readonly directory: ToolDirectory<P>;
}
export interface ToolOperationIdentities {
    newOperation(): Reply<ToolOperationId>;
}
export interface ToolInstanceIdentities {
    newInstance(): Reply<ToolInstanceId>;
}
export type ToolInvocationSourceOutcome = Readonly<{
    kind: 'bound';
    call: ToolCallId;
    admission: ToolOperationId;
    invocation: ToolInvocation;
    recovered: boolean;
}> | Readonly<{
    kind: 'issuance-unknown';
    call: ToolCallId;
    admission: ToolOperationId;
}> | Readonly<{
    kind: 'association-unknown';
}> | Readonly<{
    kind: 'rejected';
    failure: ToolDefiniteFailure;
}>;
export interface ToolInvocationSourceIssuer<P> {
    resolve(input: Access<P> & Readonly<{
        request: ToolInvokeRequest;
    }>): Promise<ToolInvocationSourceOutcome>;
}
export interface ToolDriver<P> {
    run(input: CallAccess<P> & Readonly<{
        instance: ToolInstanceId;
        signal: AbortSignal;
    }>): Promise<void>;
}
export interface ToolClock {
    now(): string;
    begin(input: Readonly<{
        operation: ToolOperationId;
        execution: ToolExecutionRef;
    }>): Reply<ClockSegment>;
    elapsed(evidence: DurableEvidence): Reply<Readonly<{
        milliseconds: string;
        evidence: DurableEvidence;
    }>>;
    waitUntil(instant: string, signal: AbortSignal): Promise<'elapsed' | 'cancelled'>;
}
export interface ToolProvider<P, B extends ContentBlock> {
    readonly runtime: ToolRuntime<P, B>;
    recover(input: Access<P>): Reply<Readonly<{
        scheduled: string;
    }>>;
    quiesce(): Reply<Readonly<{
        pending: string;
        running: string;
    }>>;
    inspectDrain(input: Access<P>): Reply<DrainState>;
    handover(input: Access<P> & Readonly<{
        operation: ToolOperationId;
        successor: DurableEvidence;
        inventory: DurableEvidence;
    }>): Reply<DurableEvidence>;
}
```

## 声明文件 `program.d.ts`

```ts
import type { ContentBlock } from '@omne-harness/content-block';
import type { JsonValue } from '@omne-harness/json-text';
import type { ContentPage, RawOutput } from './custody.ts';
import type { FixedToolRequest } from './definitions.ts';
import type { ToolExecutionRef } from './execution.ts';
import type { CallAccess, DurableEvidence, Mutation, ToolCallId, ToolDeliveryId, ToolOperationId, ToolResultVersion } from './identity.ts';
import type { Attachment, Effect, InterruptionCause, Reply, ResultPage, ToolLookup, ToolResult, ToolState, ToolTerminal } from './results.ts';
export type ChildPosition = Readonly<{
    program: DurableEvidence;
    ordinal: string;
}>;
export type ChildReservation = Readonly<{
    parent: ToolCallId;
    position: ChildPosition;
    child: ToolCallId;
    admission: ToolOperationId;
    request: FixedToolRequest;
    source: DurableEvidence;
}>;
export type ChildState = Readonly<{
    reservation: ChildReservation;
}> & (Readonly<{
    kind: 'reserved' | 'unknown';
}> | Readonly<{
    kind: 'excluded';
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'admitted';
    state: ToolState;
}> | Readonly<{
    kind: 'retained';
    state: ToolState;
    result: ToolResultVersion;
    custody: DurableEvidence;
    release: DurableEvidence;
}>);
export type ProgramEnd = Readonly<{
    kind: 'returned';
    output: RawOutput;
}> | Readonly<{
    kind: 'stopped';
    cause: InterruptionCause;
}> | Readonly<{
    kind: 'failed';
    cause: 'exception' | 'resource-limit' | 'continuity-lost';
    evidence: DurableEvidence;
}>;
export type ProgramClosure = Readonly<{
    operation: ToolOperationId;
    end: ProgramEnd;
    pending: readonly ToolCallId[];
}> & (Readonly<{
    kind: 'closing';
    barrier: null;
}> | Readonly<{
    kind: 'closed';
    barrier: DurableEvidence;
}>);
export interface ToolChildren<P> {
    reserve(input: Mutation<P> & Readonly<{
        execution: ToolExecutionRef;
        position: ChildPosition;
        request: FixedToolRequest;
    }>): Reply<ChildReservation>;
    admitted(input: Mutation<P> & Readonly<{
        reservation: ChildReservation;
        outcome: ToolLookup;
    }>): Reply<ChildState>;
    retain(input: Mutation<P> & Readonly<{
        child: ToolCallId;
        result: ToolResultVersion;
        delivery: ToolDeliveryId;
        custody: DurableEvidence;
        release: DurableEvidence;
    }>): Reply<ChildState>;
    list(input: CallAccess<P> & Readonly<{
        after: string | null;
        limit: number;
    }>): Reply<Readonly<{
        children: readonly ChildState[];
        next: string | null;
    }>>;
    close(input: Mutation<P> & Readonly<{
        end: ProgramEnd;
    }>): Reply<ProgramClosure>;
    closure(input: CallAccess<P>): Reply<ProgramClosure | null>;
    confirmBarrier(input: Mutation<P> & Readonly<{
        close: ToolOperationId;
        evidence: DurableEvidence;
    }>): Reply<ProgramClosure>;
    finish(input: Mutation<P> & Readonly<{
        output: RawOutput;
    }>): Reply<DurableEvidence>;
}
export type ProgramToolResult<B extends ContentBlock> = Readonly<{
    child: ToolCallId;
    result: ToolResultVersion;
    terminal: ToolTerminal;
    effect: Effect;
    value: ToolResult<B>;
}>;
export interface ProgramTools<B extends ContentBlock> {
    call(input: Readonly<{
        name: string;
        command: string | null;
        arguments: JsonValue;
    }>): Reply<ProgramToolResult<B>>;
    read(input: Readonly<{
        child: ToolCallId;
        result: ToolResultVersion;
        after: string | null;
    }>): Reply<ResultPage<B>>;
    attachment(input: Readonly<{
        child: ToolCallId;
        result: ToolResultVersion;
        attachment: Attachment;
        after: string | null;
        maxBytes: number;
    }>): Reply<ContentPage>;
}
```

## 声明文件 `provider.d.ts`

```ts
export { toolBodyContract } from './contract.ts';
export { describedAdoption } from './adoption.ts';
export type { AdoptionRules } from './adoption.ts';
export { TOOL_IDENTITY_MAX_LENGTH, decodeToolCursor, decodeToolDeliveryId, decodeToolInstanceId, decodeToolResultVersion, decodeToolRevision, decodeToolWaitId, } from './identity.ts';
export type { CallAccess, Mutation } from './identity.ts';
export { defaultResultPolicy, defaultResultPolicyAdoption, defaultResultPolicyRules, } from './result-policy.ts';
export { judgeImplementationFacts, judgeToolDefinition } from './judge-definition.ts';
export { deriveDefinition, foldResident, planAdoption, refreshAvailability, sameBindingKey, sameShape, sameSourceLayer, shapeOf, } from './dynamics.ts';
export type { AdoptionFacts, AdoptionPlan, FreezeVerdict, RefreshFacts, RefreshOutcome, ResidentFoldFailure, ResidentTool, ToolReloadResult, } from './dynamics.ts';
export { judgeFixedToolRequest, judgeToolInvokeRequest } from './judge-request.ts';
export { judgeConsumerRef, judgeHandoff } from './judge-release.ts';
export { judgeToolState } from './judge-state.ts';
export { evaluateToolAvailability, presentTool } from './catalog.ts';
export { TOOL_REFERENCE_MAX_LENGTH, decodeToolInvocationRef, decodeToolOperationRef, readToolInvocationRef, toolStreamCallCodec, } from './reference.ts';
export { defineCommandTool, defineFunctionTool, defineToolOperation } from './registration.ts';
export { defineToolWaitContract } from './wait-contract.ts';
export { createDefaultParameterCodec, judgeToolArguments } from './parameter-codec.ts';
export type { ParsedToolArguments, ToolArgumentsRejection } from './parameter-codec.ts';
export { renderToolResult } from './result-rendering.ts';
export { projectToolResult } from './result-projection.ts';
export type { ToolAssetVersion, ToolGovernance, ToolImplementationFacts, ToolValueSchema, } from './definitions.ts';
export type { ToolMessageContentBlock } from './results.ts';
export type { ToolDirectory, ToolHandle } from './operations.ts';
export type { IndependentToolScopeInput, ToolAskRequest, ToolAuthorLimits, ToolEmitReceipt, ToolExecutionContext, ToolExecutionScope, ToolPrimitiveFailure, ToolProcessEmitter, ToolProcessReceiver, ToolProcessUpdate, ToolResourceReply, ToolResourceWaitRequest, ToolResponseCandidate, ToolWaitContract, ToolWaitProtocolDefinition, ToolWaitResponseValidator, ToolWaitValidation, ToolWaiter, } from './author-context.ts';
export type { ResultPolicy, TextRenderer, ToolCommands, ToolExecutor, ToolRecovery, WriteContext, } from './execution.ts';
export type { PreparedEnvironment, ToolBindings, ToolClock, ToolDecisionBridge, ToolDriver, ToolEnvironment, ToolExecutionFact, ToolExecutorBinding, ToolInstanceHost, ToolInstanceIdentities, ToolInvocationSourceIssuer, ToolInvocationSourceOutcome, ToolLiveExecution, ToolOperationIdentities, ToolProvider, ToolStartLookup, } from './ports.ts';
export type { AvailabilityFacts, OutputCodec, ParameterCodec, TextResultFactory, ToolAuthor, ToolAuthority, ToolBindingDrain, ToolBindingEntry, ToolBindingKey, ToolBindingKeyFailure, ToolBindingRegistry, ToolBindingScope, ToolContribution, ToolContributionFailure, ToolImplementation, ToolImplementationDeclaration, ToolImplementationModule, ToolLoadedRegistration, ToolLoader, ToolOperation, ToolOperationParameters, ToolOperationSpec, ToolPresentation, ToolProgramContract, ToolProgramOutput, ToolReturnValidator, ToolShape, ToolShapeParameters, } from './authoring.ts';
export type { Checkpoint, ControlDispatch, DrainState, ExternalOperationResolution, FactBatch, FactProgress, FactReceipt, PreparationProgress, PreparationRecord, ProgramScheduling, ReleaseProgress, ReleaseRecord, StartGuard, StartPermit, StartProgress, SuspensionProgress, SuspensionRecord, TaskResolution, ToolRecoveryBinding, ToolResourceResponses, ToolStartAuthority, ToolTask, } from './records.ts';
export type { ToolPermitConsumption, ToolPermitRef, ToolStartAcceptance, ToolStartFence, } from './records.ts';
export type { AccountScope, ToolAccounts, ToolContentReader, ToolOffloader, ToolOutputCustody, ToolReads, } from './custody.ts';
export type { ChildPosition, ChildReservation, ChildState, ProgramClosure, ProgramEnd, ProgramToolResult, ProgramTools, ToolChildren, } from './program.ts';
```

## 声明文件 `records.d.ts`

```ts
import type { ContentBlock } from '@omne-harness/content-block';
import type { JsonValue } from '@omne-harness/json-text';
import type { TenantId } from '@omne-harness/legal-identity';
import type { ToolWaitSchemaSnapshot } from './author-context.ts';
import type { FixedToolRequest } from './definitions.ts';
import type { ToolExecutionRef } from './execution.ts';
import type { Access, Adoption, CallAccess, ConsumerRef, DurableEvidence, Mutation, ToolCallId, ToolDeliveryId, ToolOperationId, ToolResultVersion, ToolWaitId } from './identity.ts';
import type { ToolControl } from './operations.ts';
import type { DecisionValue, PreparedEnvironment, ToolExecutionFact, ToolStartLookup, ToolStartRecord } from './ports.ts';
import type { ChildReservation, ProgramEnd } from './program.ts';
import type { Reply, WaitState } from './results.ts';
export type PhysicalExecution = Readonly<{
    kind: 'not-started';
}> | Readonly<{
    kind: 'starting' | 'live' | 'unknown';
    start: ToolOperationId;
}> | Readonly<{
    kind: 'suspended';
    checkpoint: DurableEvidence;
}> | Readonly<{
    kind: 'ended' | 'lost';
    evidence: DurableEvidence;
}>;
export type QueuePosition = Readonly<{
    kind: 'none';
}> | Readonly<{
    kind: 'waiting' | 'held';
    key: string;
    ordinal: string;
}> | Readonly<{
    kind: 'released';
    key: string;
    ordinal: string;
    evidence: DurableEvidence;
}>;
export type ClockSegment = Readonly<{
    operation: ToolOperationId;
    source: string;
    epoch: string;
    marker: DurableEvidence;
}>;
export type ToolTiming = Readonly<{
    accumulatedMs: string;
}> & (Readonly<{
    kind: 'running';
    segment: ClockSegment;
}> | Readonly<{
    kind: 'paused' | 'closed';
}> | Readonly<{
    kind: 'unknown';
    segment: ClockSegment;
    diagnostic: string;
}>);
export type ProtocolIdentity = Readonly<{
    tenant: TenantId;
    call: ToolCallId;
    operation: ToolOperationId;
    adoption: Adoption;
    inputDigest: string;
}>;
export type PreparationRecord = ProtocolIdentity & Readonly<{
    purpose: 'initial' | 'resume';
    request: FixedToolRequest;
}>;
export type PreparationProgress<E> = Readonly<{
    kind: 'prepared';
    environment: PreparedEnvironment<E>;
}> | Readonly<{
    kind: 'excluded';
    exclusion: DurableEvidence;
}> | Readonly<{
    kind: 'rejected';
    reason: string;
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'pending' | 'unknown';
    diagnostic: string;
}>;
export type ReleaseRecord = ProtocolIdentity & Readonly<{
    preparation: ToolOperationId;
    resource: DurableEvidence;
    custody: DurableEvidence;
}>;
export type ReleaseProgress = Readonly<{
    kind: 'released';
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'pending' | 'unknown' | 'rejected';
    diagnostic: string;
}>;
export type StartProgress = Readonly<{
    kind: 'started';
    acceptance: DurableEvidence;
}> | Readonly<{
    kind: 'unknown';
    diagnostic: string;
}> | Readonly<{
    kind: 'not-started';
    exclusion: DurableEvidence;
}> | Readonly<{
    kind: 'rejected';
    reason: string;
    exclusion: DurableEvidence;
}>;
export type StartGuard = Readonly<{
    owner: string;
    resource: string;
    revision: string;
    evidence: DurableEvidence;
    scope: Readonly<{
        kind: 'resource';
    }> | (Readonly<{
        kind: 'program';
        parent: ToolCallId;
    }> & (Readonly<{
        gate: 'open';
    }> | Readonly<{
        gate: 'closing' | 'closed';
        closure: ToolOperationId;
        applies: 'all-children' | 'foreground-and-unadmitted';
        cutoff: DurableEvidence;
    }>));
}>;
export type StartPermit = ProtocolIdentity & Readonly<{
    start: ToolStartRecord;
    guards: readonly StartGuard[];
    request: DurableEvidence;
}>;
export interface ToolStartAuthority<P> {
    exclude(input: Mutation<P> & Readonly<{
        reason: string;
    }>): Reply<DurableEvidence>;
    prepare(input: CallAccess<P> & Readonly<{
        start: ToolStartRecord;
        request: FixedToolRequest;
    }>): Reply<StartPermit>;
    consume(input: CallAccess<P> & Readonly<{
        permit: StartPermit;
        executorReceipt: DurableEvidence;
    }>): Reply<StartProgress>;
    inspect(input: CallAccess<P> & Readonly<{
        start: ToolStartRecord;
    }>): Reply<StartProgress>;
    invalidate(input: Access<P> & Readonly<{
        operation: ToolOperationId;
        guard: StartGuard;
    }>): Reply<DurableEvidence>;
}
export type ToolStartFence<P> = Pick<ToolStartAuthority<P>, 'invalidate'>;
export type ToolPermitRef = Readonly<{
    tenant: TenantId;
    permit: string;
}>;
export type ToolPermitConsumption = Readonly<{
    permit: ToolPermitRef;
    consumer: Readonly<{
        owner: string;
        work: string;
        position: string;
    }>;
    evidence: DurableEvidence;
}>;
export type ToolStartAcceptance = Readonly<{
    tenant: TenantId;
    call: ToolCallId;
    start: ToolStartRecord;
    permit: DurableEvidence;
    guards: readonly StartGuard[];
    authorizations: readonly ToolPermitConsumption[];
    executorReceipt: DurableEvidence;
    acceptance: DurableEvidence;
}>;
export type WaitIntent = Readonly<{
    wait: ToolWaitId;
    resume: DurableEvidence;
    schemas: ToolWaitSchemaSnapshot;
}> & (Readonly<{
    kind: 'ask';
    request: DurableEvidence;
}> | Readonly<{
    kind: 'resource';
    contract: Adoption;
    request: DurableEvidence;
    deadline: string | null;
}>);
export type ExternalResponse = Readonly<{
    kind: 'decision';
    value: DecisionValue;
    source: DurableEvidence;
}> | Readonly<{
    kind: 'resource';
    value: JsonValue;
    source: DurableEvidence;
}> | Readonly<{
    kind: 'expired';
    source: DurableEvidence;
}>;
export type ResponseRecord = ProtocolIdentity & Readonly<{
    start: ToolStartRecord;
    wait: ToolWaitId;
    response: ExternalResponse;
}>;
export type ResponseProgress = Readonly<{
    kind: 'accepted';
    receipt: DurableEvidence;
}> | Readonly<{
    kind: 'continued';
    receipt: DurableEvidence;
    timing: DurableEvidence;
}> | Readonly<{
    kind: 'not-accepted';
    exclusion: DurableEvidence;
}> | Readonly<{
    kind: 'unknown' | 'rejected';
    diagnostic: string;
}>;
export type WaitRecord = Readonly<{
    intent: WaitIntent;
}> & (Readonly<{
    phase: 'opening';
    operation: ToolOperationId;
}> | Readonly<{
    phase: 'open';
    value: Exclude<WaitState, {
        kind: 'none';
    }>;
}> | Readonly<{
    phase: 'responding';
    value: Exclude<WaitState, {
        kind: 'none';
    }>;
    response: ResponseRecord;
    progress: ResponseProgress;
}> | Readonly<{
    phase: 'closed';
    cause: 'continued' | 'cancelled' | 'terminal';
    evidence: DurableEvidence;
}>);
export interface ToolResourceResponses<P> {
    inspectOperation(input: Mutation<P>): Reply<ExternalOperationResolution>;
    ensure(input: Mutation<P> & Readonly<{
        wait: Extract<WaitIntent, {
            kind: 'resource';
        }>;
    }>): Reply<DurableEvidence>;
    inspect(input: CallAccess<P> & Readonly<{
        wait: ToolWaitId;
    }>): Reply<Readonly<{
        registration: DurableEvidence;
        response: DurableEvidence | null;
    }>>;
    expire(input: Mutation<P> & Readonly<{
        wait: Extract<WaitIntent, {
            kind: 'resource';
        }>;
        registration: DurableEvidence;
    }>): Reply<DurableEvidence>;
    invalidate(input: Mutation<P> & Readonly<{
        wait: ToolWaitId;
        terminal: DurableEvidence;
    }>): Reply<DurableEvidence>;
    resolve(input: CallAccess<P> & Readonly<{
        wait: WaitIntent;
        response: DurableEvidence;
    }>): Reply<Extract<ExternalResponse, {
        kind: 'resource' | 'expired';
    }>>;
}
export type ExternalOperationResolution = Readonly<{
    kind: 'committed';
    operation: ToolOperationId;
    receipt: DurableEvidence;
}> | Readonly<{
    kind: 'excluded';
    operation: ToolOperationId;
    exclusion: DurableEvidence;
}> | Readonly<{
    kind: 'pending' | 'unknown';
    operation: ToolOperationId;
    diagnostic: string;
}>;
export type ControlProgress = Readonly<{
    kind: 'pending' | 'unknown';
    diagnostic: string;
}> | Readonly<{
    kind: 'accepted';
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'stopped' | 'already-ended' | 'relation-changed';
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'rejected';
    reason: string;
    evidence: DurableEvidence;
}>;
export type ControlRecord = Readonly<{
    operation: ToolOperationId;
    intent: ToolControl;
    source: DurableEvidence;
    progress: ControlProgress;
}>;
export type ControlDispatch = ProtocolIdentity & Readonly<{
    start: ToolStartRecord;
    intent: Extract<ToolControl, {
        kind: 'stop';
    }>;
    source: DurableEvidence;
}>;
export type SuspensionRecord = ProtocolIdentity & Readonly<{
    start: ToolStartRecord;
    schema: Adoption;
}>;
export type Checkpoint = Readonly<{
    schema: Adoption;
    payload: DurableEvidence;
    start: ToolStartRecord;
    consumedResponses: readonly ToolOperationId[];
    effectBoundary: DurableEvidence;
    exclusion: DurableEvidence;
}>;
export type SuspensionProgress = Readonly<{
    kind: 'suspended';
    checkpoint: Checkpoint;
}> | Readonly<{
    kind: 'not-suspended';
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'unknown' | 'rejected';
    diagnostic: string;
}>;
export interface ToolRecoveryBinding<B extends ContentBlock> {
    acknowledge(input: FactReceipt): Reply<DurableEvidence>;
    inspectStart(start: ToolStartRecord): Reply<ToolStartLookup<B>>;
    inspectSuspension(input: SuspensionRecord): Reply<SuspensionProgress>;
    stop(input: ControlDispatch): Reply<ControlProgress>;
    inspectControl(input: ControlDispatch): Reply<ControlProgress>;
}
export type FactBatch<B extends ContentBlock> = Readonly<{
    start: ToolStartRecord;
    source: DurableEvidence;
    batch: string;
    after: string | null;
    cursor: string;
    events: readonly Readonly<{
        event: string;
        fact: ToolExecutionFact<B>;
    }>[];
}>;
export type FactReceipt = Readonly<{
    start: ToolOperationId;
    batch: string;
    cursor: string;
    custody: DurableEvidence;
}>;
export type FactProgress = Readonly<{
    start: ToolStartRecord;
    source: DurableEvidence;
    cursor: string | null;
    pendingAcknowledgements: readonly FactReceipt[];
}>;
export type ProgramScheduling = Readonly<{
    execution: ToolExecutionRef;
    source: DurableEvidence;
    sequence: string;
    marker: DurableEvidence;
}> & (Readonly<{
    kind: 'runnable';
}> | Readonly<{
    kind: 'blocked';
    children: readonly ToolCallId[];
}> | Readonly<{
    kind: 'unknown';
    diagnostic: string;
}>);
export type ToolTask = Readonly<{
    operation: ToolOperationId;
    state: 'pending' | 'blocked';
    diagnostic: string | null;
}> & (Readonly<{
    kind: 'prepare';
    preparation: PreparationRecord;
}> | Readonly<{
    kind: 'release';
    release: ReleaseRecord;
}> | Readonly<{
    kind: 'start';
    start: ToolStartRecord;
}> | Readonly<{
    kind: 'answer';
    response: ResponseRecord;
}> | Readonly<{
    kind: 'stop';
    control: ControlDispatch;
}> | Readonly<{
    kind: 'suspend';
    suspension: SuspensionRecord;
}> | Readonly<{
    kind: 'wait-registration';
    wait: ToolWaitId;
    action: 'ensure' | 'invalidate';
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'deliver';
    result: ToolResultVersion;
    delivery: ToolDeliveryId;
    consumer: ConsumerRef;
}> | Readonly<{
    kind: 'queue' | 'settle' | 'account' | 'facts' | 'clock';
    basis: DurableEvidence;
}> | Readonly<{
    kind: 'child';
    reservation: ChildReservation;
    action: 'reconcile' | 'collect' | 'control';
    cause: ProgramEnd | null;
}> | Readonly<{
    kind: 'program-fence';
    end: ProgramEnd;
    guard: StartGuard;
}> | Readonly<{
    kind: 'resource-wait';
    wait: Extract<WaitIntent, {
        kind: 'resource';
    }>;
    action: 'ensure' | 'expire' | 'invalidate';
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'fact-ack';
    start: ToolStartRecord;
    source: DurableEvidence;
    receipt: FactReceipt;
}>);
export type TaskResolution = Readonly<{
    kind: 'done';
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'blocked';
    reason: string;
}>;
export type DrainState = Readonly<{
    admission: 'open' | 'closed';
    inventory: DurableEvidence;
    active: readonly ToolCallId[];
    tasks: readonly ToolTask[];
    untransferred: readonly DurableEvidence[];
}>;
```

## 声明文件 `reference.d.ts`

```ts
import { type Outcome } from '@omne-harness/operation-result';
import type { StreamCallCodec } from '@omne-harness/stream-arrival';
import { type TenantId } from '@omne-harness/legal-identity';
import { type ToolCallId, type ToolOperationId } from './identity.ts';
declare const toolInvocationRef: unique symbol;
declare const toolOperationRef: unique symbol;
export type ToolInvocationRef = string & {
    readonly [toolInvocationRef]: true;
};
export type ToolOperationRef = string & {
    readonly [toolOperationRef]: true;
};
export type ToolReferenceRejection = Readonly<{
    field: 'ToolInvocationRef' | 'ToolOperationRef';
    reason: 'type' | 'version' | 'shape' | 'length';
}>;
export type ToolReferenceFailure = Readonly<{
    kind: 'malformed';
    rejection: ToolReferenceRejection;
}> | Readonly<{
    kind: 'foreign-tenant';
}>;
export type ToolInvocationParts = Readonly<{
    tenant: TenantId;
    call: ToolCallId;
    admission: ToolOperationId;
}>;
export type ToolOperationParts = ToolInvocationParts & Readonly<{
    operation: ToolOperationId;
}>;
export declare const TOOL_REFERENCE_MAX_LENGTH = 1668;
export declare function encodeToolInvocationRef(parts: ToolInvocationParts): Outcome<ToolInvocationRef, ToolReferenceRejection>;
export declare function encodeToolOperationRef(parts: ToolOperationParts): Outcome<ToolOperationRef, ToolReferenceRejection>;
export declare function decodeToolInvocationRef(text: unknown): Outcome<ToolInvocationRef, ToolReferenceRejection>;
export declare function decodeToolOperationRef(text: unknown): Outcome<ToolOperationRef, ToolReferenceRejection>;
export declare function readToolInvocationRef(reference: ToolInvocationRef): ToolInvocationParts;
export declare function readToolOperationRef(reference: ToolOperationRef): ToolOperationParts;
export declare function resolveToolInvocationRef(reference: unknown, tenant: TenantId): Outcome<ToolInvocationParts, ToolReferenceFailure>;
export declare function resolveToolOperationRef(reference: unknown, tenant: TenantId): Outcome<ToolOperationParts, ToolReferenceFailure>;
export declare const toolStreamCallCodec: StreamCallCodec;
export {};
```

## 声明文件 `registration.d.ts`

```ts
import type { ContentBlock } from '@omne-harness/content-block';
import { type Outcome } from '@omne-harness/operation-result';
import type { ToolAuthor, ToolImplementation, ToolImplementationDeclaration, ToolOperation, ToolOperationParameters, ToolOperationSpec } from './authoring.ts';
import type { ToolReturnDeclaration } from './definitions.ts';
type Rejection = Readonly<{
    field: string;
    reason: string;
}>;
type AnyAuthor = ToolAuthor<unknown, unknown, unknown, ContentBlock>;
export type ToolOperationSlot = Readonly<{
    author: AnyAuthor;
    parameters: ToolOperationParameters;
    returns: ToolReturnDeclaration;
}>;
export type ToolRegistrationSlot = Readonly<{
    kind: 'function';
    operation: ToolOperationSlot;
}> | Readonly<{
    kind: 'commands';
    operations: readonly (readonly [
        string,
        ToolOperationSlot
    ])[];
}>;
export declare function readToolOperation(value: unknown): ToolOperationSlot | undefined;
export declare function readToolRegistration(value: unknown): ToolRegistrationSlot | undefined;
export declare function defineToolOperation<A, R, E, B extends ContentBlock, P extends ToolOperationParameters>(input: ToolOperationSpec<A, R, E, B, P>): Outcome<ToolOperation<E, B, P>, Rejection>;
export declare function defineFunctionTool<E, B extends ContentBlock>(input: Readonly<{
    implementation: ToolImplementationDeclaration;
    operation: ToolOperation<E, B, Extract<ToolOperationParameters, {
        kind: 'declared';
    }>>;
}>): Outcome<ToolImplementation<E, B>, Rejection>;
export declare function defineCommandTool<E, B extends ContentBlock>(input: Readonly<{
    implementation: ToolImplementationDeclaration;
    commands: Readonly<Record<string, Readonly<{
        summary: string;
        operation: ToolOperation<E, B>;
    }>>>;
}>): Outcome<ToolImplementation<E, B>, Rejection>;
export {};
```

## 声明文件 `result-delivery.d.ts`

```ts
import type { CallAccount } from '@omne-harness/call-account';
import type { ContentBlock } from '@omne-harness/content-block';
import { type TenantId } from '@omne-harness/legal-identity';
import { type Outcome } from '@omne-harness/operation-result';
import type { Access, ConsumerRef, DurableEvidence, ToolDeliveryId, ToolResultVersion } from './identity.ts';
import { type ToolInvocationRef } from './reference.ts';
import type { Effect, ToolResult, ToolTerminal } from './results.ts';
export type ToolDeliveryKey = Readonly<{
    kind: 'result';
    producer: 'tool';
    reference: ToolInvocationRef;
    result: ToolResultVersion;
}> | Readonly<{
    kind: 'account';
    producer: 'tool';
    reference: ToolInvocationRef;
    event: string;
    revision: CallAccount['revision'];
}>;
export type ToolDelivery<B extends ContentBlock> = Readonly<{
    kind: 'result';
    key: Extract<ToolDeliveryKey, {
        kind: 'result';
    }>;
    consumer: ConsumerRef;
    delivery: ToolDeliveryId;
    relation: 'original' | 'late';
    terminal: ToolTerminal;
    actualTerminal: ToolTerminal | null;
    effect: Effect;
    source: DurableEvidence;
    value: ToolResult<B>;
    account: CallAccount | null;
}> | Readonly<{
    kind: 'account';
    key: Extract<ToolDeliveryKey, {
        kind: 'account';
    }>;
    consumer: ConsumerRef;
    account: CallAccount;
}>;
export type ToolSavedReceipt = Readonly<{
    key: ToolDeliveryKey;
    evidence: DurableEvidence;
}>;
export type ToolDeliveryFailure = Readonly<{
    kind: 'denied';
}> | Readonly<{
    kind: 'invalid';
    field: string;
    reason: string;
}> | Readonly<{
    kind: 'conflict';
}> | Readonly<{
    kind: 'backpressured';
    resource: 'records' | 'bytes' | 'attachments' | 'in-flight';
}> | Readonly<{
    kind: 'unavailable';
    dependency: string;
}> | Readonly<{
    kind: 'cancelled-before-accept';
}> | Readonly<{
    kind: 'outcome-unknown';
}>;
export interface ToolResultReceiver<P, B extends ContentBlock> {
    push(input: Readonly<{
        access: Access<P>;
        delivery: ToolDelivery<B>;
        signal: AbortSignal;
    }>): Promise<Outcome<ToolSavedReceipt, ToolDeliveryFailure>>;
}
export type ToolDeliveryRejection = Readonly<{
    field: 'tenant';
    reason: 'identity';
}> | Readonly<{
    field: 'key.reference';
    reason: 'reference-malformed' | 'foreign-tenant';
}> | Readonly<{
    field: 'key.revision';
    reason: 'revision-mismatch';
}> | Readonly<{
    field: 'account.subject';
    reason: 'call-mismatch';
}>;
export declare function judgeToolDelivery<B extends ContentBlock>(input: Readonly<{
    tenant: TenantId;
    delivery: ToolDelivery<B>;
}>): Outcome<ToolDelivery<B>, ToolDeliveryRejection>;
```

## 声明文件 `result-policy.d.ts`

```ts
import type { ResultPolicy } from './execution.ts';
import type { Adoption } from './identity.ts';
import type { ToolMessageContentBlock, ToolResult } from './results.ts';
import { type Check } from './shape.ts';
export declare const defaultResultPolicyRules: Readonly<{
    owner: "@omne-harness/tool-contract";
    name: "default-result-policy";
    revision: "1";
    accept: readonly [
        "text",
        "voice-reference",
        "image-reference",
        "file-reference"
    ];
    reject: readonly [
        "thinking",
        "inline-media",
        "inline-file",
        "nested-container",
        "unknown-kind"
    ];
}>;
export declare const defaultResultPolicyAdoption: Adoption;
export declare const toolResultShape: Check<ToolResult<ToolMessageContentBlock>>;
export declare const defaultResultPolicy: ResultPolicy<ToolMessageContentBlock>;
```

## 声明文件 `result-projection.d.ts`

```ts
import type { BlockId, ContentBlock } from '@omne-harness/content-block';
import { type Outcome } from '@omne-harness/operation-result';
import type { ToolMessageContentBlock, ToolResult } from './results.ts';
export declare function projectToolResult(value: ToolResult<ContentBlock>, attachmentBlockIds: readonly BlockId[]): Outcome<readonly ToolMessageContentBlock[], Readonly<{
    field: string;
    reason: string;
}>>;
```

## 声明文件 `result-rendering.d.ts`

```ts
import type { ContentBlock } from '@omne-harness/content-block';
import { type Outcome } from '@omne-harness/operation-result';
import type { TextResultFactory, ToolAuthor } from './authoring.ts';
import type { ResultPolicy } from './execution.ts';
import type { ToolResult } from './results.ts';
type Step<T> = Outcome<T, Readonly<{
    reason: string;
}>>;
type Rendering<B extends ContentBlock> = Step<ToolResult<B>>;
export declare function renderToolResult<A, R, E, B extends ContentBlock>(value: R, author: Extract<ToolAuthor<A, R, E, B>, {
    kind: 'ordinary';
}>, text: TextResultFactory<B>, policy: ResultPolicy<B>): Rendering<B>;
export declare function renderToolResult<A, E, B extends ContentBlock>(value: ToolResult<B>, author: Extract<ToolAuthor<A, never, E, B>, {
    kind: 'structured';
}>, text: TextResultFactory<B>, policy: ResultPolicy<B>): Rendering<B>;
export {};
```

## 声明文件 `results.d.ts`

```ts
import type { ContentBlock, ContentReference, ReferenceContentBlock, TextContentBlock } from '@omne-harness/content-block';
import type { JsonValue } from '@omne-harness/json-text';
import type { Outcome } from '@omne-harness/operation-result';
import type { ToolSchemaIdentity } from './definitions.ts';
import type { Adoption, ConsumerRef, DurableEvidence, ToolCallId, ToolDeliveryId, ToolInstanceId, ToolOperationId, ToolResultVersion, ToolRevision, ToolWaitId } from './identity.ts';
import type { ForegroundReturn } from './operations.ts';
import type { ControlRecord, PhysicalExecution, QueuePosition, ToolTiming } from './records.ts';
export type Attachment = ContentReference;
export type ToolMessageContentBlock = TextContentBlock | ReferenceContentBlock;
export type ToolResult<B extends ContentBlock> = Readonly<{
    content: readonly B[];
    data: ToolResultData;
    original: Readonly<{
        kind: 'none';
    }> | Readonly<{
        kind: 'offloaded';
        source: Attachment;
        summary: readonly B[];
    }>;
    attachments: readonly Attachment[];
}>;
export type ToolResultData = Readonly<{
    kind: 'none';
}> | Readonly<{
    kind: 'json';
    contract: Adoption;
    schema: ToolSchemaIdentity;
    value: JsonValue;
}>;
export type Effect = Readonly<{
    kind: 'not-started';
}> | Readonly<{
    kind: 'not-occurred';
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'occurred';
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'unknown';
    diagnostic: string;
}>;
export type InterruptionCause = Readonly<{
    kind: 'control';
    operation: ToolOperationId;
    withdrawn: boolean;
}> | Readonly<{
    kind: 'foreground-limit';
}> | Readonly<{
    kind: 'resume-rejected';
    exclusion: DurableEvidence;
}>;
export type ToolTerminal = Readonly<{
    kind: 'completed';
}> | Readonly<{
    kind: 'failed';
    cause: 'arguments' | 'environment' | 'executor' | 'runtime-lost' | 'result';
    diagnostic: string;
}> | Readonly<{
    kind: 'unavailable';
    reason: string;
}> | Readonly<{
    kind: 'interrupted';
    cause: InterruptionCause;
}> | Readonly<{
    kind: 'no-response';
    wait: ToolWaitId;
    reason: string;
}>;
export type ToolFailure = Readonly<{
    kind: 'denied';
    action: string;
}> | Readonly<{
    kind: 'invalid';
    field: string;
    reason: string;
}> | Readonly<{
    kind: 'conflict';
    operation: ToolOperationId;
}> | Readonly<{
    kind: 'unavailable';
    dependency: string;
    diagnostic: string;
}> | Readonly<{
    kind: 'commit-unknown';
    operation: ToolOperationId;
}> | Readonly<{
    kind: 'not-settled';
}> | Readonly<{
    kind: 'stale-instance';
    instance: ToolInstanceId;
}> | Readonly<{
    kind: 'stale-revision';
    current: ToolRevision;
}> | Readonly<{
    kind: 'invalid-cursor';
    reason: string;
}> | Readonly<{
    kind: 'unsupported';
    adoption: Adoption;
    reason: string;
}>;
export type Reply<T> = Promise<Outcome<T, ToolFailure>>;
export type WaitState = Readonly<{
    kind: 'none';
}> | Readonly<{
    kind: 'ask';
    wait: ToolWaitId;
    registration: DurableEvidence;
    resume: DurableEvidence;
    decision: DurableEvidence | null;
}> | Readonly<{
    kind: 'resource';
    wait: ToolWaitId;
    contract: Adoption;
    deadline: string | null;
    resume: DurableEvidence;
    registration: DurableEvidence;
}>;
export type DeliveryState = Readonly<{
    kind: 'pending';
    delivery: ToolDeliveryId;
    consumer: ConsumerRef;
}> | Readonly<{
    kind: 'released';
    delivery: ToolDeliveryId;
    consumer: ConsumerRef;
    evidence: DurableEvidence;
}>;
export type ReleasedDelivery = Extract<DeliveryState, {
    kind: 'released';
}>;
export type ToolState = Readonly<{
    call: ToolCallId;
    revision: ToolRevision;
    source: DurableEvidence;
    foreground: ForegroundReturn | null;
    effect: Effect;
    execution: PhysicalExecution;
    timing: ToolTiming;
    queue: QueuePosition;
    controls: readonly ControlRecord[];
    delivery: DeliveryState | null;
    supplements: readonly Readonly<{
        result: ToolResultVersion;
        actual: ToolTerminal;
        delivery: DeliveryState;
        source: DurableEvidence;
    }>[];
}> & ((Readonly<{
    phase: 'accepted' | 'preparing' | 'queued' | 'starting';
    wait: Readonly<{
        kind: 'none';
    }>;
}> & ToolRelation) | (Readonly<{
    phase: 'running';
    instance: ToolInstanceId;
}> & ActiveRelation) | (Readonly<{
    phase: 'suspended';
    checkpoint: DurableEvidence;
}> & ActiveRelation) | (Readonly<{
    phase: 'settled';
    wait: Readonly<{
        kind: 'none';
    }>;
    result: ToolResultVersion;
}> & (Readonly<{
    relation: 'foreground';
    terminal: ToolTerminal;
}> | Readonly<{
    relation: 'background';
    terminal: Exclude<ToolTerminal, {
        kind: 'no-response';
    }>;
}>)));
export type ToolRelation = Readonly<{
    relation: 'foreground' | 'background';
}>;
export type ActiveRelation = Readonly<{
    relation: 'foreground';
    wait: WaitState;
}> | Readonly<{
    relation: 'background';
    wait: Readonly<{
        kind: 'none';
    }>;
}>;
export type ResultPage<B extends ContentBlock> = Readonly<{
    result: ToolResultVersion;
    terminal: ToolTerminal;
    effect: Effect;
    actualTerminal: ToolTerminal | null;
    relation: 'original' | 'late';
    delivery: ToolDeliveryId;
    source: DurableEvidence;
    value: ToolResult<B>;
    next: string | null;
}>;
export type OperationResolution = Readonly<{
    kind: 'committed';
    revision: ToolRevision;
    receipt: DurableEvidence;
}> | Readonly<{
    kind: 'rolled-back' | 'not-committed';
}> | Readonly<{
    kind: 'unknown';
}>;
export type ToolLookup = Readonly<{
    kind: 'found';
    state: ToolState;
}> | Readonly<{
    kind: 'not-accepted';
    operation: ToolOperationId;
}>;
```

## 声明文件 `shape.d.ts`

```ts
import { type Outcome } from '@omne-harness/operation-result';
export type ShapeRejection = Readonly<{
    field: string;
    reason: string;
}>;
export type Checked<T> = Outcome<T, ShapeRejection>;
export type Check<T> = (value: unknown, at: string) => Checked<T>;
type Checks = Readonly<Record<string, Check<unknown>>>;
type Checked_<C> = C extends Check<infer T> ? T : never;
type Fields<C extends Checks> = {
    readonly [K in keyof C]: Checked_<C[K]>;
};
export declare function reject(field: string, reason: string): Checked<never>;
export declare function member(at: string, key: string): string;
export declare function item(at: string, index: number): string;
export declare function judgeAt<T>(check: Check<T>, value: unknown, root: string): Checked<T>;
export declare function judgeUnknown<T>(check: Check<T>, value: unknown, root: string): Checked<T>;
type Slot = Readonly<{
    kind: 'absent';
}> | Readonly<{
    kind: 'accessor';
}> | Readonly<{
    kind: 'value';
    value: unknown;
}>;
export declare function slot(value: object, key: PropertyKey): Slot;
export declare function inheritedSlot(value: object, key: PropertyKey): Slot;
export declare function isPlainObject(value: unknown): value is object;
export declare function record<R extends Checks, O extends Checks = Readonly<Record<never, never>>>(required: R, optional?: O): Check<Fields<R> & Partial<Fields<O>>>;
export declare function variant<B extends Checks>(tag: string, branches: B): Check<{
    [K in keyof B]: Checked_<B[K]>;
}[keyof B]>;
export declare function literal<const L extends readonly string[]>(...values: L): Check<L[number]>;
export declare const text: Check<string>;
export declare const filled: Check<string>;
export declare const nonBlank: Check<string>;
export declare const oneLine: Check<string>;
export declare const decimal: Check<string>;
export declare const positiveSafeInteger: Check<number>;
export declare const bool: Check<boolean>;
export declare function nullable<T>(check: Check<T>): Check<T | null>;
export declare function list<T>(check: Check<T>): Check<readonly T[]>;
export declare function refine<T>(check: Check<T>, rule: (value: T, at: string) => ShapeRejection | undefined): Check<T>;
export declare function nonEmpty<T>(check: Check<readonly T[]>): Check<readonly T[]>;
export declare function unique<T>(check: Check<readonly T[]>, key: (value: T) => string, suffix?: string): Check<readonly T[]>;
export declare function firstRepeat(values: readonly string[]): number;
export declare function identity<T>(decode: (text: unknown) => Outcome<T, Readonly<{
    reason: string;
}>>): Check<T>;
export declare function describeRejection(rejection: ShapeRejection): string;
export {};
```

## 声明文件 `testing-case.d.ts`

```ts
import type { Outcome } from '@omne-harness/operation-result';
import type { Access } from './identity.ts';
import type { ToolFailure } from './results.ts';
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
export declare function succeeded<T>(outcome: Outcome<T, ToolFailure>, what: string): T;
export declare function refused(outcome: Outcome<unknown, ToolFailure>, what: string): ToolFailure;
export declare function expectKind<T extends {
    kind: string;
}, K extends T['kind']>(value: T, kind: K, what: string): Extract<T, {
    kind: K;
}>;
export declare function expectOneOf(value: {
    kind: string;
}, kinds: readonly string[], what: string): void;
export declare function within<T>(work: Promise<T>, milliseconds: number, what: string): Promise<T>;
export interface TwoTenantFixture {
    readonly access: Access<unknown>;
    readonly otherAccess?: Access<unknown>;
}
export declare function otherAccessOf<F extends TwoTenantFixture>(fixture: F): F['access'];
export type AnswerRow<K extends string = string> = Readonly<{
    clause: string;
    progress: readonly K[];
    lostReply?: readonly string[];
    ranks?: Readonly<Partial<Record<K, number>>>;
    recalled?: readonly K[];
}>;
export type AnswerModel<Method extends string = string> = Readonly<Record<Method, AnswerRow>>;
export declare function isProgress(answer: unknown, row: AnswerRow): boolean;
export type Completion = Readonly<{
    name: string;
    call: (() => Promise<void>) | undefined;
}>;
export declare function completionOf<K extends string, A extends unknown[] = [
]>(fixture: Readonly<Partial<Record<NoInfer<K>, (...args: A) => Promise<void>>>>, name: K, ...args: A): Completion;
export declare function finalAnswer<A>(read: Readonly<{
    ask: () => Promise<A>;
    row: AnswerRow;
    completion?: Completion;
    view?: (answer: A) => unknown;
    what: string;
}>): Promise<A>;
export type CrossTenantAnswers<A> = Readonly<{
    real: A;
    ghost: A;
}>;
export declare function crossTenantAnswers<A extends Outcome<unknown, ToolFailure>>(read: Readonly<{
    ask: Readonly<{
        real: () => Promise<A>;
        ghost: () => Promise<A>;
    }>;
    row: AnswerRow;
    completion?: Completion;
    identifying: readonly unknown[];
    submitted: readonly unknown[];
    what: string;
}>): Promise<CrossTenantAnswers<A>>;
export declare function resendRecalls(row: AnswerRow, reads: Readonly<{
    earlier: unknown;
    later: unknown;
}>, what: string): void;
```

## 声明文件 `testing-clock.d.ts`

```ts
import type { Access } from './identity.ts';
import type { ToolClock } from './ports.ts';
import { type ConformanceCase } from './testing-case.ts';
export declare const clockAnswers: {
    readonly now: {
        readonly clause: 'P07';
        readonly progress: readonly [
        ];
    };
    readonly begin: {
        readonly clause: 'P07';
        readonly progress: readonly [
        ];
    };
    readonly elapsed: {
        readonly clause: 'P07';
        readonly progress: readonly [
        ];
    };
    readonly waitUntil: {
        readonly clause: 'P07';
        readonly progress: readonly [
        ];
    };
};
export interface ToolClockFixture {
    readonly clock: ToolClock;
    readonly access: Access<unknown>;
    readonly waitMs?: number;
    readonly quietMs?: number;
    advance?(milliseconds: number): void | Promise<void>;
    setBack?(milliseconds: number): void | Promise<void>;
    changeEpoch?(): void | Promise<void>;
    instantAfter?(milliseconds: number): string;
}
export declare function toolClockConformance(): readonly ConformanceCase<ToolClockFixture>[];
export interface MemoryToolClock extends ToolClock {
    readonly durability: 'none';
    readonly controls: Readonly<{
        advance(milliseconds: number): void;
        setBack(milliseconds: number): void;
        changeEpoch(): void;
        instantAfter(milliseconds: number): string;
    }>;
}
export declare function createMemoryToolClock(): MemoryToolClock;
export declare function memoryToolClockFixture(): ToolClockFixture;
```

## 声明文件 `testing-decision-bridge.d.ts`

```ts
import type { Access, DurableEvidence, ToolCallId, ToolWaitId } from './identity.ts';
import type { DecisionValue, ToolDecisionBridge } from './ports.ts';
import { type ConformanceCase } from './testing-case.ts';
import { type ExternalHandles } from './testing-external.ts';
import { operationId } from './testing-values.ts';
export interface ToolDecisionBridgeFixture<P> extends ExternalHandles {
    readonly bridge: ToolDecisionBridge<P>;
    readonly access: Access<P>;
    readonly otherAccess?: Access<P>;
    decide?(input: Readonly<{
        call: ToolCallId;
        wait: ToolWaitId;
        value: DecisionValue;
    }>): Promise<DurableEvidence>;
}
export declare const decisionBridgeAnswers: {
    readonly ensure: {
        readonly clause: 'P06';
        readonly progress: readonly [
        ];
        readonly lostReply: readonly [
            "commit-unknown"
        ];
    };
    readonly invalidate: {
        readonly clause: 'P06';
        readonly progress: readonly [
        ];
        readonly lostReply: readonly [
            "commit-unknown"
        ];
    };
    readonly inspect: {
        readonly clause: 'P06';
        readonly progress: readonly [
        ];
    };
    readonly inspectOperation: {
        readonly clause: 'P06';
        readonly progress: readonly [
            "pending",
            "unknown"
        ];
    };
    readonly resolve: {
        readonly clause: 'P12';
        readonly progress: readonly [
        ];
    };
};
export declare function toolDecisionBridgeConformance<P>(): readonly ConformanceCase<ToolDecisionBridgeFixture<P>>[];
export interface MemoryToolDecisionBridge<P> extends ToolDecisionBridge<P> {
    readonly durability: 'none';
    readonly controls: Readonly<{
        hold(): void;
        settle(): Promise<void>;
        excludeDeferred(operation: ReturnType<typeof operationId>): Promise<void>;
        invalidations(): readonly DurableEvidence[];
        decide(input: Readonly<{
            tenant: Access<unknown>['tenant'];
            call: ToolCallId;
            wait: ToolWaitId;
            value: DecisionValue;
        }>): Promise<DurableEvidence>;
    }>;
}
export declare function createMemoryToolDecisionBridge<P>(): MemoryToolDecisionBridge<P>;
export declare function memoryToolDecisionBridgeFixture(): ToolDecisionBridgeFixture<string>;
```

## 声明文件 `testing-environment.d.ts`

```ts
import type { FixedToolRequest } from './definitions.ts';
import type { Access } from './identity.ts';
import type { ToolEnvironment } from './ports.ts';
import type { PreparationRecord } from './records.ts';
import { type ConformanceCase } from './testing-case.ts';
export interface ToolEnvironmentFixture<P, E> {
    readonly environment: ToolEnvironment<P, E>;
    readonly access: Access<P>;
    readonly otherAccess?: Access<P>;
    readonly request?: FixedToolRequest;
    allocations?(): number;
    hold?(): void;
    settle?(): Promise<void>;
    excludeDeferred?(preparation: PreparationRecord): Promise<void>;
    rejectNext?(reason: string): void;
}
export declare const environmentAnswers: {
    readonly prepare: {
        readonly clause: 'P03';
        readonly progress: string[];
    };
    readonly inspectPreparation: {
        readonly clause: 'P03';
        readonly progress: string[];
    };
    readonly release: {
        readonly clause: 'P03';
        readonly progress: string[];
    };
    readonly inspectRelease: {
        readonly clause: 'P03';
        readonly progress: string[];
    };
};
type Fixture<P, E> = ToolEnvironmentFixture<P, E>;
export declare function toolEnvironmentConformance<P, E>(): readonly ConformanceCase<Fixture<P, E>>[];
export type MemoryEnvironment = Readonly<{
    resource: string;
}>;
export interface MemoryToolEnvironment<P> extends ToolEnvironment<P, MemoryEnvironment> {
    readonly durability: 'none';
    readonly controls: Readonly<{
        allocations(): number;
        hold(): void;
        settle(): Promise<void>;
        excludeDeferred(preparation: PreparationRecord): Promise<void>;
        rejectNext(reason: string): void;
    }>;
}
export declare function createMemoryToolEnvironment<P>(): MemoryToolEnvironment<P>;
export declare function memoryToolEnvironmentFixture(): ToolEnvironmentFixture<string, MemoryEnvironment>;
export {};
```

## 声明文件 `testing-executor-binding.d.ts`

```ts
import type { ContentBlock } from '@omne-harness/content-block';
import type { FixedToolRequest } from './definitions.ts';
import type { Access } from './identity.ts';
import type { ToolExecutionFact, ToolExecutorBinding, ToolStartRecord } from './ports.ts';
import type { StartPermit } from './records.ts';
import { type ConformanceCase } from './testing-case.ts';
type Start = Extract<ToolStartRecord, {
    kind: 'start';
}>;
type Fact = ToolExecutionFact<ContentBlock>;
type FinalFact = Extract<Fact, {
    kind: 'final';
}>;
type LiveOnly<P, E> = Extract<ToolExecutorBinding<P, ContentBlock, E>, {
    kind: 'live-only';
}>;
export interface ToolExecutorBindingFixture<P, E> {
    readonly binding: LiveOnly<P, E>;
    readonly access: Access<P>;
    readonly otherAccess?: Access<P>;
    readonly environment: E;
    readonly request?: FixedToolRequest;
    readonly readDeadlineMs?: number;
    readonly quietMs?: number;
    permit?(start: Start): Promise<StartPermit>;
    settle?(): Promise<void>;
    launches?(): number;
    emit?(start: Start, fact: Fact): Promise<void>;
    finish?(start: Start, final: FinalFact): Promise<void>;
    loseContinuity?(start: Start): Promise<void>;
    blindInspection?(start: Start): void;
    pendingAcknowledgements?(start: Start): number;
    holdStop?(start: Start): void;
    completeStop?(start: Start): Promise<void>;
}
export declare const executorBindingAnswers: {
    readonly start: {
        readonly clause: 'P05';
        readonly progress: readonly [
        ];
    };
    readonly inspectStart: {
        readonly clause: 'P05';
        readonly progress: readonly [
            "unknown"
        ];
    };
    readonly acknowledge: {
        readonly clause: 'P05';
        readonly progress: readonly [
        ];
    };
    readonly stop: Readonly<{
        clause: string;
        progress: readonly ("accepted" | "pending" | "unknown")[];
        lostReply?: readonly string[];
        ranks?: Readonly<Partial<Record<"accepted" | "pending" | "unknown", number>>>;
        recalled?: readonly ("accepted" | "pending" | "unknown")[];
    }>;
    readonly inspectControl: Readonly<{
        clause: string;
        progress: readonly ("accepted" | "pending" | "unknown")[];
        lostReply?: readonly string[];
        ranks?: Readonly<Partial<Record<"accepted" | "pending" | "unknown", number>>>;
        recalled?: readonly ("accepted" | "pending" | "unknown")[];
    }>;
};
export declare function completedFinal(): FinalFact;
export declare function toolExecutorBindingConformance<P, E>(): readonly ConformanceCase<ToolExecutorBindingFixture<P, E>>[];
export interface MemoryToolExecutorBinding<P, E> {
    readonly durability: 'none';
    readonly binding: LiveOnly<P, E>;
    readonly controls: Readonly<{
        launches(): number;
        emit(start: Start, fact: Fact): Promise<void>;
        finish(start: Start, final: FinalFact): Promise<void>;
        loseContinuity(start: Start): Promise<void>;
        blindInspection(start: Start): void;
        pendingAcknowledgements(start: Start): number;
        holdStop(start: Start): void;
        completeStop(start: Start): Promise<void>;
        settle(): Promise<void>;
    }>;
}
export declare function createMemoryToolExecutorBinding<P, E>(): MemoryToolExecutorBinding<P, E>;
export declare function memoryToolExecutorBindingFixture(): ToolExecutorBindingFixture<string, {
    readonly resource: string;
}>;
export {};
```

## 声明文件 `testing-external.d.ts`

```ts
import { type Outcome } from '@omne-harness/operation-result';
import type { DurableEvidence, ToolOperationId } from './identity.ts';
import type { ExternalOperationResolution } from './records.ts';
import type { Reply, ToolFailure } from './results.ts';
import { type AnswerRow, type Completion, type ConformanceCase, type TwoTenantFixture } from './testing-case.ts';
export interface ExternalPeer {
    readonly completion: Completion;
    readonly sends: readonly unknown[];
    ensure(operation: string, wait?: string): Promise<Outcome<DurableEvidence, ToolFailure>>;
    inspect(wait?: string): Promise<Outcome<DurableEvidence, ToolFailure>>;
    invalidate(operation: string, wait?: string): Promise<Outcome<DurableEvidence, ToolFailure>>;
    inspectOperation(operation: string): Reply<ExternalOperationResolution>;
    hold?(): void;
    settle?(): Promise<void>;
    excludeDeferred?(operation: ToolOperationId): Promise<void>;
    invalidations?(): readonly DurableEvidence[];
}
export interface ExternalHandles {
    hold?(): void;
    settle?(): Promise<void>;
    excludeDeferred?(operation: ToolOperationId): Promise<void>;
    invalidations?(): readonly DurableEvidence[];
}
export declare function boundHandles(fixture: ExternalHandles): Pick<ExternalPeer, 'hold' | 'settle' | 'excludeDeferred' | 'invalidations'>;
export declare function mapOk<T, U>(outcome: Outcome<T, ToolFailure>, change: (value: T) => U): Outcome<U, ToolFailure>;
export type ExternalFixture = TwoTenantFixture;
export type PeerView<F extends ExternalFixture> = (fixture: F, access: F['access']) => ExternalPeer;
export declare const WAIT = "wait-1";
export declare const TERMINAL: DurableEvidence;
export declare const externalAnswers: {
    readonly ensure: {
        readonly clause: 'P06';
        readonly progress: readonly [
        ];
        readonly lostReply: readonly [
            "commit-unknown"
        ];
    };
    readonly invalidate: {
        readonly clause: 'P06';
        readonly progress: readonly [
        ];
        readonly lostReply: readonly [
            "commit-unknown"
        ];
    };
    readonly inspect: {
        readonly clause: 'P06';
        readonly progress: readonly [
        ];
    };
    readonly inspectOperation: {
        readonly clause: 'P06';
        readonly progress: readonly [
            "pending",
            "unknown"
        ];
    };
};
export declare function landed<A>(completion: Completion, send: () => Promise<Outcome<A, ToolFailure>>, row: AnswerRow, what: string): Promise<A>;
export declare function externalAssociationCases<F extends ExternalFixture>(peerOf: PeerView<F>): readonly ConformanceCase<F>[];
export declare function createOperationLedger(mint: (kind: string, content: unknown) => DurableEvidence): {
    hold: () => void;
    run(key: string, operation: ToolOperationId, action: Readonly<{
        kind: string;
        input: unknown;
    }>, apply: () => DurableEvidence): Outcome<DurableEvidence, ToolFailure>;
    settle(): void;
    exclude(operation: ToolOperationId): void;
    inspect(key: string, operation: ToolOperationId): ExternalOperationResolution;
};
```

## 声明文件 `testing-output-custody.d.ts`

```ts
import type { RawOutput, ToolOutputCustody } from './custody.ts';
import type { Access, Adoption } from './identity.ts';
import { type ConformanceCase } from './testing-case.ts';
export interface ToolOutputCustodyFixture<P> {
    readonly custody: ToolOutputCustody<P>;
    readonly access: Access<P>;
    readonly otherAccess?: Access<P>;
    readonly codec?: Adoption;
    readBytes?(raw: RawOutput): Promise<Uint8Array>;
    failNext?(): void;
    dropNextAnswer?(): void;
    settle?(): Promise<void>;
}
export declare const outputCustodyAnswers: {
    readonly preserve: {
        readonly clause: 'P01';
        readonly progress: readonly [
        ];
        readonly lostReply: readonly [
            "commit-unknown"
        ];
    };
    readonly inspect: {
        readonly clause: 'P05';
        readonly progress: readonly [
            "unknown"
        ];
    };
    readonly retainResult: {
        readonly clause: 'P01';
        readonly progress: readonly [
        ];
        readonly lostReply: readonly [
            "commit-unknown"
        ];
    };
};
export declare function toolOutputCustodyConformance<P>(): readonly ConformanceCase<ToolOutputCustodyFixture<P>>[];
export interface MemoryToolOutputCustody<P> extends ToolOutputCustody<P> {
    readonly durability: 'none';
    readonly controls: Readonly<{
        readBytes(raw: RawOutput): Promise<Uint8Array>;
        failNext(): void;
        dropNextAnswer(): void;
        settle(): Promise<void>;
    }>;
}
export declare function createMemoryToolOutputCustody<P>(): MemoryToolOutputCustody<P>;
export declare function memoryToolOutputCustodyFixture(): ToolOutputCustodyFixture<string>;
```

## 声明文件 `testing-resource-responses.d.ts`

```ts
import type { JsonValue } from '@omne-harness/json-text';
import type { Access, DurableEvidence, ToolCallId, ToolOperationId } from './identity.ts';
import type { ToolResourceResponses, WaitIntent } from './records.ts';
import { type ConformanceCase } from './testing-case.ts';
import { type ExternalHandles } from './testing-external.ts';
type ResourceWait = Extract<WaitIntent, {
    kind: 'resource';
}>;
export interface ToolResourceResponsesFixture<P> extends ExternalHandles {
    readonly responses: ToolResourceResponses<P>;
    readonly access: Access<P>;
    readonly otherAccess?: Access<P>;
    readonly deadline?: string;
    respond?(input: Readonly<{
        call: ToolCallId;
        wait: ResourceWait;
        value: JsonValue;
    }>): Promise<DurableEvidence>;
    reachDeadline?(input: Readonly<{
        call: ToolCallId;
        wait: ResourceWait;
    }>): Promise<void>;
}
export declare const resourceResponsesAnswers: {
    readonly ensure: {
        readonly clause: 'P06';
        readonly progress: readonly [
        ];
        readonly lostReply: readonly [
            "commit-unknown"
        ];
    };
    readonly invalidate: {
        readonly clause: 'P06';
        readonly progress: readonly [
        ];
        readonly lostReply: readonly [
            "commit-unknown"
        ];
    };
    readonly inspect: {
        readonly clause: 'P06';
        readonly progress: readonly [
        ];
    };
    readonly inspectOperation: {
        readonly clause: 'P06';
        readonly progress: readonly [
            "pending",
            "unknown"
        ];
    };
    readonly expire: {
        readonly clause: 'P06';
        readonly progress: readonly [
        ];
        readonly lostReply: readonly [
            "commit-unknown"
        ];
    };
    readonly resolve: {
        readonly clause: 'P12';
        readonly progress: readonly [
        ];
    };
};
export declare function toolResourceResponsesConformance<P>(): readonly ConformanceCase<ToolResourceResponsesFixture<P>>[];
export interface MemoryToolResourceResponses<P> extends ToolResourceResponses<P> {
    readonly durability: 'none';
    readonly controls: Readonly<{
        hold(): void;
        settle(): Promise<void>;
        excludeDeferred(operation: ToolOperationId): Promise<void>;
        invalidations(): readonly DurableEvidence[];
        respond(input: Readonly<{
            tenant: Access<unknown>['tenant'];
            call: ToolCallId;
            wait: ResourceWait;
            value: JsonValue;
        }>): Promise<DurableEvidence>;
        reachDeadline(input: Readonly<{
            tenant: Access<unknown>['tenant'];
            call: ToolCallId;
            wait: ResourceWait;
        }>): Promise<void>;
    }>;
}
export declare function createMemoryToolResourceResponses<P>(): MemoryToolResourceResponses<P>;
export declare function memoryToolResourceResponsesFixture(): ToolResourceResponsesFixture<string>;
export {};
```

## 声明文件 `testing-result-receiver.d.ts`

```ts
import type { ContentBlock } from '@omne-harness/content-block';
import { type Access, type ConsumerRef } from './identity.ts';
import { type ToolResultReceiver } from './result-delivery.ts';
import { type ConformanceCase } from './testing-case.ts';
export interface ToolResultReceiverFixture<P> {
    readonly receiver: ToolResultReceiver<P, ContentBlock>;
    readonly access: Access<P>;
    readonly otherAccess?: Access<P>;
    readonly consumer: ConsumerRef;
    readonly tenantCapacity?: number;
}
type Fixture<P> = ToolResultReceiverFixture<P>;
export declare function toolResultReceiverConformance<P>(): readonly ConformanceCase<Fixture<P>>[];
export interface MemoryToolResultReceiver<P> extends ToolResultReceiver<P, ContentBlock> {
    readonly durability: 'none';
}
export declare function createMemoryToolResultReceiver<P>(input: Readonly<{
    owner: string;
    tenantCapacity: number;
}>): MemoryToolResultReceiver<P>;
export declare function memoryToolResultReceiverFixture(): ToolResultReceiverFixture<string>;
export {};
```

## 声明文件 `testing-start-authority.d.ts`

```ts
import type { FixedToolRequest } from './definitions.ts';
import type { Access, DurableEvidence, ToolCallId } from './identity.ts';
import type { ToolPermitConsumption, ToolPermitRef, ToolStartAcceptance, ToolStartAuthority } from './records.ts';
import { type ConformanceCase } from './testing-case.ts';
export interface ToolStartAuthorityFixture<P> {
    readonly authority: ToolStartAuthority<P>;
    readonly access: Access<P>;
    readonly otherAccess?: Access<P>;
    readonly request?: FixedToolRequest;
    settle?(): Promise<void>;
}
export declare const startAuthorityAnswers: {
    readonly prepare: {
        readonly clause: 'P04';
        readonly progress: readonly [
        ];
    };
    readonly consume: {
        readonly clause: 'P04';
        readonly progress: readonly [
            "unknown"
        ];
    };
    readonly inspect: {
        readonly clause: 'P04';
        readonly progress: readonly [
            "unknown"
        ];
    };
    readonly invalidate: {
        readonly clause: 'P04';
        readonly progress: readonly [
        ];
    };
    readonly exclude: {
        readonly clause: 'P04';
        readonly progress: readonly [
        ];
    };
};
type Fixture<P> = ToolStartAuthorityFixture<P>;
export declare function toolStartAuthorityConformance<P>(): readonly ConformanceCase<Fixture<P>>[];
export interface MemoryToolStartAuthority<P> extends ToolStartAuthority<P> {
    readonly durability: 'none';
}
export declare const MEMORY_START_GUARD: Readonly<{
    owner: "conformance-fence";
    resource: "start-fence";
}>;
export declare function createMemoryToolStartAuthority<P>(): MemoryToolStartAuthority<P>;
export type ToolPermitReading = Readonly<{
    kind: 'open';
}> | Readonly<{
    kind: 'consumed';
    fact: ToolPermitConsumption;
}> | Readonly<{
    kind: 'unknown';
}>;
export interface ToolStartAuthorizationHandles<P> {
    bind(input: Readonly<{
        access: Access<P>;
        call: ToolCallId;
        permit?: ToolPermitRef;
    }>): Promise<ToolPermitRef>;
    revoke(input: Readonly<{
        access: Access<P>;
        call: ToolCallId;
    }>): Promise<void>;
    read(permit: ToolPermitRef): Promise<ToolPermitReading>;
}
export interface MemoryAuthorizedToolStartAuthority<P> extends MemoryToolStartAuthority<P> {
    readonly authorization: ToolStartAuthorizationHandles<P>;
    acceptanceOf(acceptance: DurableEvidence): ToolStartAcceptance | null;
}
export declare function createMemoryAuthorizedToolStartAuthority<P>(): MemoryAuthorizedToolStartAuthority<P>;
export declare function memoryToolStartAuthorityFixture(): ToolStartAuthorityFixture<string>;
export {};
```

## 声明文件 `testing-start-authorization.d.ts`

```ts
import { type ConformanceCase } from './testing-case.ts';
import { type ToolStartAuthorizationHandles, type ToolStartAuthorityFixture } from './testing-start-authority.ts';
export interface ToolStartAuthorizationFixture<P> extends ToolStartAuthorityFixture<P> {
    readonly authorization?: ToolStartAuthorizationHandles<P>;
}
type Fixture<P> = ToolStartAuthorizationFixture<P>;
export declare function toolStartAuthorizationConformance<P>(): readonly ConformanceCase<Fixture<P>>[];
export declare function memoryToolStartAuthorizationFixture(): ToolStartAuthorizationFixture<string>;
export {};
```

## 声明文件 `testing-start-fence.d.ts`

```ts
import type { ToolStartFence } from './records.ts';
import { type ConformanceCase } from './testing-case.ts';
import { type ToolStartAuthorityFixture } from './testing-start-authority.ts';
export interface ToolStartFenceFixture<P> extends ToolStartAuthorityFixture<P> {
    readonly fence: ToolStartFence<P>;
    readonly guard: Readonly<{
        owner: string;
        resource: string;
    }>;
}
type Fixture<P> = ToolStartFenceFixture<P>;
export declare function toolStartFenceConformance<P>(): readonly ConformanceCase<Fixture<P>>[];
export declare function memoryToolStartFenceFixture(): ToolStartFenceFixture<string>;
export {};
```

## 声明文件 `testing-values.d.ts`

```ts
import type { ContentBlock } from '@omne-harness/content-block';
import { type TenantId } from '@omne-harness/legal-identity';
import type { FixedToolRequest } from './definitions.ts';
import { type Access, type Adoption, type DurableEvidence, type ToolCallId, type ToolInstanceId, type ToolOperationId, type ToolWaitId } from './identity.ts';
import type { ToolStartRecord } from './ports.ts';
import type { PreparationRecord, ReleaseRecord, StartPermit, WaitIntent } from './records.ts';
import type { ToolResult } from './results.ts';
export declare const TESTING_OWNER = "@omne-harness/tool-contract/testing";
export declare function adoption(name: string): Adoption;
export declare function evidence(record: string): DurableEvidence;
export declare function digestOf(value: unknown): string;
export declare function mintEvidence(record: string, content: unknown): DurableEvidence;
export declare function tenantKey(tenant: TenantId): string;
export declare function identifyingValues(tenant: TenantId, ...evidences: readonly DurableEvidence[]): readonly unknown[];
export declare function testingTenant(organization: string, account: string): TenantId;
export declare function memoryAccess<P>(principal: P): Access<P>;
export declare function memoryOtherAccess<P>(principal: P): Access<P>;
export declare const callId: (text: string) => ToolCallId;
export declare const operationId: (text: string) => ToolOperationId;
export declare const waitId: (text: string) => ToolWaitId;
export declare const instanceId: () => ToolInstanceId;
export declare function fixedRequest(): FixedToolRequest;
export declare function startRecord(access: Access<unknown>, call: ToolCallId): Extract<ToolStartRecord, {
    kind: 'start';
}>;
export declare function syntheticPermit(access: Access<unknown>, call: ToolCallId, start: Extract<ToolStartRecord, {
    kind: 'start';
}>, request: FixedToolRequest): StartPermit;
export declare function preparationRecord(access: Access<unknown>, call: ToolCallId, operation: string, request: FixedToolRequest): PreparationRecord;
export declare function releaseRecord(preparation: PreparationRecord, operation: string, resource: DurableEvidence): ReleaseRecord;
export declare function textResult(text: string): ToolResult<ContentBlock>;
export declare const FAR_DEADLINE = "2099-12-31T23:59:59.000Z";
export declare function resourceWait(wait: string, options?: Readonly<{
    deadline?: string | null;
    expiry?: 'forbidden' | 'supported';
}>): Extract<WaitIntent, {
    kind: 'resource';
}>;
```

## 声明文件 `testing.d.ts`

```ts
export { NotApplicable, completionOf, crossTenantAnswers, finalAnswer, isNotApplicable, isProgress, resendRecalls, runConformanceCase, type AnswerModel, type AnswerRow, type CaseVerdict, type Completion, type ConformanceCase, type CrossTenantAnswers, } from './testing-case.ts';
export { createMemoryToolStartAuthority, memoryToolStartAuthorityFixture, startAuthorityAnswers, toolStartAuthorityConformance, type MemoryToolStartAuthority, type ToolStartAuthorityFixture, } from './testing-start-authority.ts';
export { createMemoryAuthorizedToolStartAuthority, type MemoryAuthorizedToolStartAuthority, type ToolPermitReading, type ToolStartAuthorizationHandles, } from './testing-start-authority.ts';
export { memoryToolStartFenceFixture, toolStartFenceConformance, type ToolStartFenceFixture, } from './testing-start-fence.ts';
export { memoryToolStartAuthorizationFixture, toolStartAuthorizationConformance, type ToolStartAuthorizationFixture, } from './testing-start-authorization.ts';
export { createMemoryToolResultReceiver, memoryToolResultReceiverFixture, toolResultReceiverConformance, type MemoryToolResultReceiver, type ToolResultReceiverFixture, } from './testing-result-receiver.ts';
export { createMemoryToolEnvironment, environmentAnswers, memoryToolEnvironmentFixture, toolEnvironmentConformance, type MemoryEnvironment, type MemoryToolEnvironment, type ToolEnvironmentFixture, } from './testing-environment.ts';
export { completedFinal, createMemoryToolExecutorBinding, executorBindingAnswers, memoryToolExecutorBindingFixture, toolExecutorBindingConformance, type MemoryToolExecutorBinding, type ToolExecutorBindingFixture, } from './testing-executor-binding.ts';
export { createMemoryToolOutputCustody, memoryToolOutputCustodyFixture, outputCustodyAnswers, toolOutputCustodyConformance, type MemoryToolOutputCustody, type ToolOutputCustodyFixture, } from './testing-output-custody.ts';
export { clockAnswers, createMemoryToolClock, memoryToolClockFixture, toolClockConformance, type MemoryToolClock, type ToolClockFixture, } from './testing-clock.ts';
export { createMemoryToolDecisionBridge, decisionBridgeAnswers, memoryToolDecisionBridgeFixture, toolDecisionBridgeConformance, type MemoryToolDecisionBridge, type ToolDecisionBridgeFixture, } from './testing-decision-bridge.ts';
export { createMemoryToolResourceResponses, resourceResponsesAnswers, memoryToolResourceResponsesFixture, toolResourceResponsesConformance, type MemoryToolResourceResponses, type ToolResourceResponsesFixture, } from './testing-resource-responses.ts';
export { testingTenant } from './testing-values.ts';
```

## 声明文件 `value-shapes.d.ts`

```ts
import { type ContentReference } from '@omne-harness/content-block';
import type { SourceLayer, ToolSchemaIdentity } from './definitions.ts';
import type { Adoption, ConsumerRef, DurableEvidence } from './identity.ts';
import { type Check } from './shape.ts';
export declare const sourceLayer: Check<SourceLayer>;
export declare const adoption: Check<Adoption>;
export declare const durableEvidence: Check<DurableEvidence>;
export declare const consumerRef: Check<ConsumerRef>;
export declare const schemaIdentity: Check<ToolSchemaIdentity>;
export declare function sameAdoption(left: Adoption, right: Adoption): boolean;
export declare function sameSchemaIdentity(left: ToolSchemaIdentity, right: ToolSchemaIdentity): boolean;
export declare const contentReference: Check<ContentReference>;
```

## 声明文件 `wait-contract.d.ts`

```ts
import { type Outcome } from '@omne-harness/operation-result';
import type { ToolWaitContract, ToolWaitProtocolDefinition } from './author-context.ts';
import type { ToolValueSchema } from './definitions.ts';
import { type Check } from './shape.ts';
export declare const valueSchema: Check<ToolValueSchema<unknown>>;
export declare function isToolWaitContract(value: unknown): boolean;
export declare function defineToolWaitContract<A, K extends 'ask' | 'resource'>(definition: ToolWaitProtocolDefinition<A, K>): Outcome<ToolWaitContract<A, K>, Readonly<{
    reason: string;
}>>;
```
