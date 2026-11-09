export type {
  ToolBodyWrites,
  ToolBodyWriteInput,
  ToolBodyWriteFailure,
  ToolBodyWriteReply,
  ToolBodyCloseReceipt,
} from './body-writer.ts'
export type { SealedToolBody, ToolBodyCustody } from './body-custody.ts'
export type { ToolBodyReader } from './body-reads.ts'
// The `./provider` entry of the Tool contract package: the provider protocol that only the Tool
// implementation members use (SPEC「公开入口的分组」rules 2 and 3): ports that outside providers
// implement, protocol records between providers, custody and account read/write ports, loading
// and the binding registry, executor binding and start records, the author adapters, and the
// value types only they reference. Every name is defined once, in the same modules as the root
// entry; a name is exported from one entry only. It does not import Cordis or another Tool package.
export { toolBodyContract } from './contract.ts'
export { decodeToolMaterialInstant } from './materials.ts'
export type {
  ToolMaterialFingerprint,
  ToolMaterialInstant,
  ToolMaterialClock,
  ToolMaterialId,
  ToolMaterialGeneration,
  ToolMaterialRef,
  ToolMaterialSeal,
  ToolMaterialDeletion,
  ToolMaterialStore,
  ToolFinalEnvelope,
  ToolFinalPointer,
  ToolFinalCustody,
} from './materials.ts'
export { describedAdoption } from './adoption.ts'
export type { AdoptionRules } from './adoption.ts'
export {
  TOOL_IDENTITY_MAX_LENGTH,
  decodeToolCursor,
  decodeToolDeliveryId,
  decodeToolInstanceId,
  decodeToolMaterialId,
  decodeToolMaterialGeneration,
  decodeToolBodyId,
  decodeToolResultVersion,
  decodeToolRevision,
  decodeToolWaitId,
} from './identity.ts'
export type { CallAccess, Mutation } from './identity.ts'
export type {
  ToolCredentialFailure,
  ToolCredentialRequest,
  ToolCredentials,
  ToolCredentialUsage,
} from './credentials.ts'
export {
  judgeCommittedToolResult,
  defaultResultPolicy,
  defaultResultPolicyAdoption,
  defaultResultPolicyRules,
} from './result-policy.ts'
export { judgeImplementationFacts, judgeToolDefinition } from './judge-definition.ts'
export {
  deriveDefinition,
  foldResident,
  planAdoption,
  refreshAvailability,
  sameBindingKey,
  sameShape,
  sameSourceLayer,
  shapeOf,
} from './dynamics.ts'
export type {
  AdoptionFacts,
  AdoptionPlan,
  FreezeVerdict,
  RefreshFacts,
  RefreshOutcome,
  ResidentFoldFailure,
  ResidentTool,
  ToolReloadResult,
} from './dynamics.ts'
export { judgeFixedToolRequest, judgeToolInvokeRequest } from './judge-request.ts'
export { judgePreparationFact } from './judge-preparation.ts'
export { judgeConsumerRef, judgeHandoff } from './judge-release.ts'
export { judgeToolState } from './judge-state.ts'
export { evaluateToolAvailability, presentTool } from './catalog.ts'
export {
  TOOL_REFERENCE_MAX_LENGTH,
  decodeToolInvocationRef,
  decodeToolOperationRef,
  readToolInvocationRef,
  toolStreamCallCodec,
} from './reference.ts'
export { defineCommandTool, defineFunctionTool, defineToolOperation } from './registration.ts'
export { defineToolWaitContract } from './wait-contract.ts'
export { createDefaultParameterCodec, judgeToolArguments } from './parameter-codec.ts'
export type { ParsedToolArguments, ToolArgumentsRejection } from './parameter-codec.ts'
export { renderToolResult } from './result-rendering.ts'
export { projectToolResult } from './result-projection.ts'
export type {
  ToolAssetVersion,
  ToolGovernance,
  ToolImplementationFacts,
  ToolValueSchema,
} from './definitions.ts'
export type { ToolMessageContentBlock } from './results.ts'
export type { ToolDirectory, ToolHandle } from './operations.ts'
export type {
  IndependentToolScopeInput,
  ToolAskRequest,
  ToolAuthorLimits,
  ToolEmitReceipt,
  ToolExecutionContext,
  ToolExecutionScope,
  ToolPrimitiveFailure,
  ToolProcessEmitter,
  ToolProcessReceiver,
  ToolProcessUpdate,
  ToolResourceReply,
  ToolResourceWaitRequest,
  ToolResponseCandidate,
  ToolWaitContract,
  ToolWaitProtocolDefinition,
  ToolWaitResponseValidator,
  ToolWaitValidation,
  ToolWaiter,
} from './author-context.ts'
export type {
  ResultPolicy,
  TextRenderer,
  ToolCommands,
  ToolExecutor,
  ToolRecovery,
  WriteContext,
} from './execution.ts'
export type {
  PreparedEnvironment,
  ToolBindings,
  ToolClock,
  ToolDecisionBridge,
  ToolDriver,
  ToolEnvironment,
  ToolExecutionFact,
  ToolExecutorBinding,
  ToolInstanceHost,
  ToolInstanceIdentities,
  ToolInvocationSourceIssuer,
  ToolInvocationSourceOutcome,
  ToolLiveExecution,
  ToolOperationIdentities,
  ToolProvider,
  ToolStartLookup,
} from './ports.ts'
export type {
  AvailabilityFacts,
  OutputCodec,
  ParameterCodec,
  TextResultFactory,
  ToolAuthor,
  ToolAuthority,
  ToolBindingDrain,
  ToolBindingEntry,
  ToolBindingKey,
  ToolBindingKeyFailure,
  ToolBindingRegistry,
  ToolBindingScope,
  ToolContribution,
  ToolContributionFailure,
  ToolImplementation,
  ToolImplementationDeclaration,
  ToolImplementationModule,
  ToolLoadedRegistration,
  ToolLoader,
  ToolOperation,
  ToolOperationParameters,
  ToolOperationSpec,
  ToolPresentation,
  ToolProgramContract,
  ToolProgramOutput,
  ToolReturnValidator,
  ToolShape,
  ToolShapeParameters,
} from './authoring.ts'
export type {
  Checkpoint,
  ControlDispatch,
  DrainState,
  ExternalOperationResolution,
  FactBatch,
  FactProgress,
  FactReceipt,
  PreparationProgress,
  PreparationRecord,
  ProgramScheduling,
  ReleaseProgress,
  ReleaseRecord,
  StartGuard,
  StartPermit,
  StartProgress,
  SuspensionProgress,
  SuspensionRecord,
  TaskResolution,
  ToolRecoveryBinding,
  ToolResourceResponses,
  ToolStartAuthority,
  ToolTask,
} from './records.ts'
export type {
  ToolPermitConsumption,
  ToolPermitRef,
  ToolStartAcceptance,
  ToolStartFence,
} from './records.ts'
export type {
  AccountScope,
  ToolAccounts,
  ToolContentReader,
  ToolOffloader,
  ToolOutputCustody,
  ToolReads,
} from './custody.ts'
export type {
  ChildPosition,
  ChildReservation,
  ChildState,
  ProgramClosure,
  ProgramEnd,
  ProgramToolResult,
  ProgramTools,
  ToolChildren,
} from './program.ts'

export { projectToolBackgroundCalls } from './background-calls-projection.ts'
export type {
  ToolBackgroundCallSource,
  ToolBackgroundCallsSource,
} from './background-calls-projection.ts'

export {
  COMMAND_CALL_ENCODINGS,
  commandArguments,
  commandExample,
  commandGuide,
  commandSignature,
  decodeCommandCall,
  describeCommandArgumentsRejection,
  encodeCommandCall,
} from './command-call.ts'
export { attachToolsCapability } from './tools-capability.ts'
export type {
  ToolForwardParent,
  ToolForwardBinding,
  ToolForwardSourceOutcome,
  ToolForwardSource,
  ToolForwardRuntime,
} from './forwarding.ts'
export { returnGuide } from './return-description.ts'
