// Resolve accepted public type names and function signatures through the package root.
import type { BlockId, ContentBlock } from '@omne-harness/content-block'
import type { JsonValue } from '@omne-harness/json-text'
import type { Outcome } from '@omne-harness/kernel-basis'
import type { ConsumerRef, FixedToolRequest, Handoff } from '@omne-harness/tool-contract'
import { expectTypeOf, it } from 'vitest'
import {
  defineCommandTool,
  defineFunctionTool,
  defineToolOperation,
  defineToolWaitContract,
  evaluateToolAvailability,
  judgeConsumerRef,
  judgeFixedToolRequest,
  judgeHandoff,
  judgeToolArguments,
  judgeToolDefinition,
  judgeToolState,
  presentTool,
  projectToolResult,
  renderToolResult,
  createDefaultParameterCodec,
  defaultResultPolicy,
} from '@omne-harness/tool-contract'
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
  Mutation,
  ParameterContract,
  ToolSchemaIdentity,
  ToolValueSchema,
  ToolProgramDeclaration,
  ToolReturnDeclaration,
  ToolDefinitionMetadata,
  ToolDefinition,
  ToolAvailability,
  ToolArguments,
  ResourceScope,
  ToolInvocation,
  FixedToolRequest,
  Attachment,
  ToolMessageContentBlock,
  ToolResult,
  ToolResultData,
  Effect,
  StopReason,
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
  ToolProcessUpdate,
  ToolEmitReceipt,
  ToolPrimitiveFailure,
  ToolWaitProtocolDefinition,
  ToolWaitContract,
  ToolDecision,
  ToolAskRequest,
  ToolResourceWaitRequest,
  ToolResourceReply,
  ToolProcessEmitter,
  ToolWaiter,
  ToolExecutionContext,
  ToolAuthorLimits,
  ToolExecutionScope,
  ToolWaitSchemaSnapshot,
  ToolResponseCandidate,
  ToolWaitValidation,
  ToolWaitResponseValidator,
  TextRenderer,
  ToolExecutor,
  ResultPolicy,
  ToolExecutionRef,
  WriteContext,
  ToolRecovery,
  ToolCommands,
  DecisionValue,
  ToolDecisionBridge,
  ToolExecutionFact,
  ToolLiveExecution,
  ToolStartRecord,
  ToolStartLookup,
  ToolExecutorBinding,
  PreparedEnvironment,
  ToolEnvironment,
  ToolBindings,
  ToolInstanceHost,
  ToolDriver,
  ToolClock,
  ToolProvider,
  ToolDeclarations,
  ToolSettingsDeclaration,
  ToolConsumerProfile,
  ToolInspection,
  ToolUsage,
  ToolPresentation,
  ToolCatalog,
  ParameterCodec,
  OutputCodec,
  ToolReturnValidator,
  ToolProgramContract,
  ToolProgramOutput,
  ToolAuthor,
  ToolOperationParameters,
  ToolOperation,
  ToolOperationSpec,
  ToolAuthorRegistration,
  ToolLoadedRegistration,
  ToolLoader,
  ToolBindingRegistry,
  TextResultFactory,
  AvailabilityFacts,
  PhysicalExecution,
  QueuePosition,
  ClockSegment,
  ToolTiming,
  ProtocolIdentity,
  PreparationRecord,
  PreparationProgress,
  ReleaseRecord,
  ReleaseProgress,
  StartProgress,
  StartGuard,
  StartPermit,
  ToolStartAuthority,
  WaitIntent,
  ExternalResponse,
  ResponseRecord,
  ResponseProgress,
  WaitRecord,
  ToolResourceResponses,
  ExternalOperationResolution,
  ControlProgress,
  ControlRecord,
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
  RawOutput,
  ToolOutputCustody,
  ProcessSnapshot,
  DiagnosticPage,
  ContentPage,
  ToolContentReader,
  ToolReads,
  AccountScope,
  ToolAccounts,
  ToolOffloader,
  ChildPosition,
  ChildReservation,
  ChildState,
  ProgramEnd,
  ProgramClosure,
  ToolChildren,
  ProgramToolResult,
  ProgramTools,
} from '@omne-harness/tool-contract'
import type {
  ToolCallId,
  ToolOperationId,
  ToolDefinition,
  ToolAvailability,
  ToolMessageContentBlock,
  ToolResult,
  ToolState,
  ToolWaitProtocolDefinition,
  ToolWaitContract,
  ResultPolicy,
  ToolPresentation,
  ParameterCodec,
  ToolOperationParameters,
  ToolOperation,
  ToolAuthorRegistration,
  AvailabilityFacts,
  ParsedToolArguments,
  ToolArgumentsRejection,
} from '@omne-harness/tool-contract'
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
    Outcome<ToolAuthorRegistration<string, ToolMessageContentBlock>, Rejection>
  >()
  expectTypeOf(defineCommandTool<string, ToolMessageContentBlock>).returns.toEqualTypeOf<
    Outcome<ToolAuthorRegistration<string, ToolMessageContentBlock>, Rejection>
  >()
  expectTypeOf(renderToolResult).toBeFunction()
  expectTypeOf(createDefaultParameterCodec).returns.toEqualTypeOf<
    Outcome<ParameterCodec<JsonValue>, Rejection>
  >()
  expectTypeOf(defaultResultPolicy).toEqualTypeOf<ResultPolicy<ToolMessageContentBlock>>()
})
