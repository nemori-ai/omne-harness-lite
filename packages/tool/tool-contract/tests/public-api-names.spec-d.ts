// Resolve accepted public type names and function signatures through the package root.
import type { BlockId, ContentBlock } from '@omne-harness/content-block'
import type { JsonValue } from '@omne-harness/json-text'
import type { Outcome } from '@omne-harness/operation-result'
import type {
  Adoption,
  BackgroundSource,
  ConsumerRef,
  DurableEvidence,
  FixedToolRequest,
  Handoff,
  InterruptionCause,
  ResourceScope,
  ToolConsumerProfile,
  ToolControl,
  ToolTerminal,
  WaitState,
} from '@omne-harness/tool-contract'
import type { ProgramEnd, StartGuard, ToolTask } from '@omne-harness/tool-contract/provider'
import { expectTypeOf, it } from 'vitest'
import {
  encodeToolInvocationRef,
  encodeToolOperationRef,
  readToolOperationRef,
  resolveToolInvocationRef,
  resolveToolOperationRef,
} from '@omne-harness/tool-contract'
import {
  defineCommandTool,
  defineFunctionTool,
  defineToolOperation,
  defineToolWaitContract,
  deriveDefinition,
  evaluateToolAvailability,
  foldResident,
  judgeConsumerRef,
  judgeImplementationFacts,
  planAdoption,
  refreshAvailability,
  sameBindingKey,
  sameShape,
  sameSourceLayer,
  shapeOf,
  judgeFixedToolRequest,
  judgeHandoff,
  judgeToolArguments,
  judgeToolDefinition,
  judgeToolInvokeRequest,
  judgeToolState,
  presentTool,
  projectToolResult,
  renderToolResult,
  createDefaultParameterCodec,
  defaultResultPolicy,
  decodeToolInvocationRef,
  decodeToolOperationRef,
  readToolInvocationRef,
} from '@omne-harness/tool-contract/provider'
export type {
  ToolIdentity,
  ToolCallId,
  ToolOperationId,
  ToolInstanceId,
  ToolWaitId,
  ToolResultVersion,
  ToolDeliveryId,
  ToolCursor,
  ToolRevision,
  Adoption,
  ConsumerRef,
  DurableEvidence,
  Access,
  CallAccess,
  ParameterContract,
  ToolSchemaIdentity,
  ToolProgramDeclaration,
  ToolReturnDeclaration,
  ToolCommandDeclaration,
  ToolImplementationShape,
  ToolDefinition,
  WorkspaceId,
  SourceLayer,
  ToolAvailability,
  ToolArguments,
  ResourceScope,
  ToolInvocation,
  FixedToolRequest,
  Attachment,
  ToolResult,
  ToolResultData,
  Effect,
  InterruptionCause,
  BackgroundSource,
  ToolTerminal,
  ToolFailure,
  Reply,
  WaitState,
  DeliveryState,
  ToolState,
  ToolRelation,
  ActiveRelation,
  ResultPage,
  OperationResolution,
  ToolLookup,
  ToolControl,
  ControlReceipt,
  ForegroundReturn,
  ProcessBlock,
  ToolObservation,
  ToolHandle,
  ToolDirectory,
  Handoff,
  ToolRuntime,
  ToolDecision,
  ToolWaitSchemaSnapshot,
  ToolExecutionRef,
  DecisionValue,
  ToolStartRecord,
  ToolDeclarations,
  ToolSettingsDeclaration,
  ToolConsumerProfile,
  ToolInspection,
  ToolUsage,
  ToolCatalog,
  PhysicalExecution,
  QueuePosition,
  ClockSegment,
  ToolTiming,
  ProtocolIdentity,
  WaitIntent,
  ExternalResponse,
  ResponseRecord,
  ResponseProgress,
  WaitRecord,
  ControlProgress,
  ControlRecord,
  RawOutput,
  ProcessSnapshot,
  DiagnosticPage,
  ContentPage,
  ToolInvokeRequest,
  InvocationAccess,
  ToolDefiniteFailure,
  ToolInvokeOutcome,
  ToolCommandOutcome,
  ToolReleaseDeliveryOutcome,
  ReleasedDelivery,
  ToolInvocationQueries,
  ToolInvocationCommands,
  ToolInvocationDirectory,
  ToolInvocationContentReader,
  ToolInvocationRef,
  ToolOperationRef,
  ToolReferenceRejection,
  ToolReferenceFailure,
  ToolInvocationParts,
  ToolOperationParts,
} from '@omne-harness/tool-contract'
export type {
  Mutation,
  ToolValueSchema,
  ToolAssetVersion,
  ToolGovernance,
  ToolImplementationFacts,
  ToolMessageContentBlock,
  ToolProcessUpdate,
  ToolEmitReceipt,
  ToolPrimitiveFailure,
  ToolWaitProtocolDefinition,
  ToolWaitContract,
  ToolAskRequest,
  ToolResourceWaitRequest,
  ToolResourceReply,
  ToolProcessEmitter,
  ToolWaiter,
  ToolExecutionContext,
  ToolAuthorLimits,
  ToolExecutionScope,
  ToolResponseCandidate,
  ToolWaitValidation,
  ToolWaitResponseValidator,
  TextRenderer,
  ToolExecutor,
  ResultPolicy,
  WriteContext,
  ToolRecovery,
  ToolCommands,
  ToolDecisionBridge,
  ToolExecutionFact,
  ToolLiveExecution,
  ToolStartLookup,
  ToolExecutorBinding,
  PreparedEnvironment,
  ToolEnvironment,
  ToolBindings,
  ToolInstanceHost,
  ToolDriver,
  ToolClock,
  ToolProvider,
  ToolPresentation,
  ParameterCodec,
  OutputCodec,
  ToolReturnValidator,
  ToolProgramContract,
  ToolProgramOutput,
  ToolAuthor,
  ToolOperationParameters,
  ToolOperation,
  ToolOperationSpec,
  ToolImplementation,
  ToolImplementationDeclaration,
  ToolImplementationModule,
  ToolBindingKey,
  ToolShapeParameters,
  ToolShape,
  ToolLoadedRegistration,
  ToolLoader,
  ToolAuthority,
  ToolContribution,
  ToolContributionFailure,
  ToolBindingEntry,
  ToolBindingScope,
  ToolBindingKeyFailure,
  ToolBindingDrain,
  ToolBindingRegistry,
  AdoptionFacts,
  AdoptionPlan,
  FreezeVerdict,
  RefreshFacts,
  RefreshOutcome,
  ResidentFoldFailure,
  ResidentTool,
  ToolReloadResult,
  TextResultFactory,
  AvailabilityFacts,
  PreparationRecord,
  PreparationProgress,
  ReleaseRecord,
  ReleaseProgress,
  StartProgress,
  StartGuard,
  StartPermit,
  ToolStartAuthority,
  ToolResourceResponses,
  ExternalOperationResolution,
  ControlDispatch,
  SuspensionRecord,
  Checkpoint,
  SuspensionProgress,
  ToolRecoveryBinding,
  FactBatch,
  FactReceipt,
  FactProgress,
  ProgramScheduling,
  ToolTask,
  TaskResolution,
  DrainState,
  ToolOutputCustody,
  ToolContentReader,
  ToolReads,
  AccountScope,
  ToolAccounts,
  ToolOffloader,
  ToolInvocationSourceOutcome,
  ToolOperationIdentities,
  ToolInstanceIdentities,
  ToolInvocationSourceIssuer,
  ChildPosition,
  ChildReservation,
  ChildState,
  ProgramEnd,
  ProgramClosure,
  ToolChildren,
  ProgramToolResult,
  ProgramTools,
} from '@omne-harness/tool-contract/provider'
import type {
  ToolCallId,
  ToolOperationId,
  ToolDefinition,
  ToolAvailability,
  ToolResult,
  ToolState,
  ToolInvokeRequest,
  ToolInvocationRef,
  ToolOperationRef,
  ToolReferenceRejection,
  ToolReferenceFailure,
  ToolInvocationParts,
  ToolOperationParts,
} from '@omne-harness/tool-contract'
import type {
  ToolMessageContentBlock,
  ToolWaitProtocolDefinition,
  ToolWaitContract,
  ResultPolicy,
  ToolPresentation,
  ParameterCodec,
  ToolOperationParameters,
  ToolOperation,
  ToolImplementation,
  ToolImplementationFacts,
  ToolGovernance,
  ToolShape,
  AvailabilityFacts,
  ParsedToolArguments,
  ToolArgumentsRejection,
} from '@omne-harness/tool-contract/provider'
import type { TenantId } from '@omne-harness/legal-identity'
import {
  readToolOperation,
  readToolRegistration,
  type ToolOperationSlot,
  type ToolRegistrationSlot,
} from '@omne-harness/tool-contract/binding'

it('resolves the readers of the author from the binding entry with their signatures', () => {
  expectTypeOf(readToolOperation).toEqualTypeOf<(value: unknown) => ToolOperationSlot | undefined>()
  expectTypeOf(readToolRegistration).toEqualTypeOf<
    (value: unknown) => ToolRegistrationSlot | undefined
  >()
})

it('resolves every public type name from the package root', () => {
  expectTypeOf<ToolCallId>().not.toEqualTypeOf<ToolOperationId>()
})

type Rejection = Readonly<{ field: string; reason: string }>

it('resolves every implemented contract function from the package root with its accepted signature', () => {
  expectTypeOf(judgeToolDefinition).toEqualTypeOf<
    (value: unknown) => Outcome<ToolDefinition, Rejection>
  >()
  expectTypeOf(judgeFixedToolRequest).toEqualTypeOf<
    (value: unknown) => Outcome<FixedToolRequest, Rejection>
  >()
  expectTypeOf(judgeToolInvokeRequest).toEqualTypeOf<
    (value: unknown) => Outcome<ToolInvokeRequest, Rejection>
  >()
  expectTypeOf(encodeToolInvocationRef).toEqualTypeOf<
    (parts: ToolInvocationParts) => Outcome<ToolInvocationRef, ToolReferenceRejection>
  >()
  expectTypeOf(encodeToolOperationRef).toEqualTypeOf<
    (parts: ToolOperationParts) => Outcome<ToolOperationRef, ToolReferenceRejection>
  >()
  expectTypeOf(decodeToolInvocationRef).toEqualTypeOf<
    (text: unknown) => Outcome<ToolInvocationRef, ToolReferenceRejection>
  >()
  expectTypeOf(decodeToolOperationRef).toEqualTypeOf<
    (text: unknown) => Outcome<ToolOperationRef, ToolReferenceRejection>
  >()
  expectTypeOf(readToolInvocationRef).toEqualTypeOf<
    (reference: ToolInvocationRef) => ToolInvocationParts
  >()
  expectTypeOf(readToolOperationRef).toEqualTypeOf<
    (reference: ToolOperationRef) => ToolOperationParts
  >()
  expectTypeOf(resolveToolInvocationRef).toEqualTypeOf<
    (reference: unknown, tenant: TenantId) => Outcome<ToolInvocationParts, ToolReferenceFailure>
  >()
  expectTypeOf(resolveToolOperationRef).toEqualTypeOf<
    (reference: unknown, tenant: TenantId) => Outcome<ToolOperationParts, ToolReferenceFailure>
  >()
  expectTypeOf(judgeToolArguments).returns.toEqualTypeOf<
    Outcome<ParsedToolArguments, ToolArgumentsRejection>
  >()
  expectTypeOf(judgeConsumerRef).toEqualTypeOf<
    (value: unknown) => Outcome<ConsumerRef, Rejection>
  >()
  expectTypeOf(judgeHandoff).toEqualTypeOf<(value: unknown) => Outcome<Handoff, Rejection>>()
  expectTypeOf(judgeToolState).toEqualTypeOf<(value: unknown) => Outcome<ToolState, Rejection>>()
  expectTypeOf(presentTool).toEqualTypeOf<(definition: ToolDefinition) => ToolPresentation>()
  expectTypeOf(evaluateToolAvailability).toEqualTypeOf<
    (facts: AvailabilityFacts) => ToolAvailability
  >()
  expectTypeOf(projectToolResult).toEqualTypeOf<
    (
      value: ToolResult<ContentBlock>,
      attachmentBlockIds: readonly BlockId[],
    ) => Outcome<readonly ToolMessageContentBlock[], Rejection>
  >()
  expectTypeOf(defineToolWaitContract<string, 'ask'>).toEqualTypeOf<
    (
      definition: ToolWaitProtocolDefinition<string, 'ask'>,
    ) => Outcome<ToolWaitContract<string, 'ask'>, Readonly<{ reason: string }>>
  >()
  expectTypeOf(defineToolOperation).returns.toEqualTypeOf<
    Outcome<ToolOperation<unknown, ContentBlock, ToolOperationParameters>, Rejection>
  >()
  expectTypeOf(defineFunctionTool<string, ToolMessageContentBlock>).returns.toEqualTypeOf<
    Outcome<ToolImplementation<string, ToolMessageContentBlock>, Rejection>
  >()
  expectTypeOf(defineCommandTool<string, ToolMessageContentBlock>).returns.toEqualTypeOf<
    Outcome<ToolImplementation<string, ToolMessageContentBlock>, Rejection>
  >()
  expectTypeOf(judgeImplementationFacts).toEqualTypeOf<
    (value: unknown) => Outcome<ToolImplementationFacts, Rejection>
  >()
  expectTypeOf(deriveDefinition).toEqualTypeOf<
    (governance: ToolGovernance, facts: ToolImplementationFacts) => ToolDefinition
  >()
  expectTypeOf(shapeOf).toEqualTypeOf<(definition: ToolDefinition) => ToolShape>()
  expectTypeOf(sameShape).toEqualTypeOf<(left: ToolShape, right: ToolShape) => boolean>()
  expectTypeOf(sameSourceLayer).returns.toEqualTypeOf<boolean>()
  expectTypeOf(sameBindingKey).returns.toEqualTypeOf<boolean>()
  expectTypeOf(planAdoption).toBeFunction()
  expectTypeOf(refreshAvailability).toBeFunction()
  expectTypeOf(foldResident).toBeFunction()
  expectTypeOf(renderToolResult).toBeFunction()
  expectTypeOf(createDefaultParameterCodec).returns.toEqualTypeOf<
    Outcome<ParameterCodec<JsonValue>, Rejection>
  >()
  expectTypeOf(defaultResultPolicy).toEqualTypeOf<ResultPolicy<ToolMessageContentBlock>>()
})

it('renames the outside-actor constructs and keeps no removed public name', () => {
  expectTypeOf<InterruptionCause['kind']>().toEqualTypeOf<
    'control' | 'foreground-limit' | 'resume-rejected'
  >()
  expectTypeOf<BackgroundSource['kind']>().toEqualTypeOf<
    'launched' | 'control' | 'threshold' | 'foreground-limit'
  >()
  expectTypeOf<ToolControl['kind']>().toEqualTypeOf<'stop' | 'withdraw' | 'background'>()
  expectTypeOf<Extract<ToolControl, { kind: 'withdraw' }>>().toEqualTypeOf<
    Readonly<{ kind: 'withdraw'; reach: 'all' | 'foreground-and-unadmitted' }>
  >()
  expectTypeOf<Extract<ToolControl, { kind: 'stop' }>>().toEqualTypeOf<Readonly<{ kind: 'stop' }>>()
  expectTypeOf<
    Extract<
      Extract<StartGuard['scope'], { kind: 'program' }>,
      { gate: 'closing' | 'closed' }
    >['applies']
  >().toEqualTypeOf<'all-children' | 'foreground-and-unadmitted'>()
  expectTypeOf<ToolConsumerProfile>().toEqualTypeOf<
    Readonly<{
      capabilities: DurableEvidence
      conversion: Adoption | null
      attachmentAccess: DurableEvidence
    }>
  >()
  expectTypeOf<ResourceScope>().toEqualTypeOf<
    Readonly<{ owner: string; key: string; grant: DurableEvidence }>
  >()
  expectTypeOf<Extract<WaitState, { kind: 'ask' }>>().toHaveProperty('registration')
  expectTypeOf<Extract<WaitState, { kind: 'ask' }>>().not.toHaveProperty('card')
  expectTypeOf<Extract<ToolTask, { kind: 'wait-registration' }>>().not.toBeNever()
  expectTypeOf<
    Extract<ProgramEnd, { kind: 'stopped' }>['cause']
  >().toEqualTypeOf<InterruptionCause>()
  expectTypeOf<
    Extract<ToolTerminal, { kind: 'interrupted' }>['cause']
  >().toEqualTypeOf<InterruptionCause>()
})
