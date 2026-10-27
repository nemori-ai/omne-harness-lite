// The root entry of the Tool contract package: the names that members outside the Tool group
// import, and the names their declarations reference (SPEC「公开入口的分组」rule 1). The provider
// protocol is on `./provider`; the readers of the author inside a handle are on `./binding`. It
// does not import Cordis or another Tool package.
export { decodeToolCallId, decodeToolOperationId } from './identity.ts'
export type {
  Access,
  Adoption,
  ConsumerRef,
  DurableEvidence,
  ToolCallId,
  ToolCursor,
  ToolDeliveryId,
  ToolIdentity,
  ToolIdentityRejection,
  ToolInstanceId,
  ToolOperationId,
  ToolResultVersion,
  ToolRevision,
  ToolWaitId,
} from './identity.ts'
export {
  encodeToolInvocationRef,
  encodeToolOperationRef,
  readToolOperationRef,
  resolveToolInvocationRef,
  resolveToolOperationRef,
} from './reference.ts'
export type {
  ToolInvocationParts,
  ToolInvocationRef,
  ToolOperationParts,
  ToolOperationRef,
  ToolReferenceFailure,
  ToolReferenceRejection,
} from './reference.ts'
export type {
  FixedToolRequest,
  ParameterContract,
  ResourceScope,
  SourceLayer,
  ToolArguments,
  ToolAvailability,
  ToolCommandDeclaration,
  ToolDefinition,
  ToolImplementationShape,
  ToolInvocation,
  ToolProgramDeclaration,
  ToolReturnDeclaration,
  ToolSchemaIdentity,
} from './definitions.ts'
export type {
  ActiveRelation,
  Attachment,
  DeliveryState,
  Effect,
  InterruptionCause,
  OperationResolution,
  ReleasedDelivery,
  Reply,
  ResultPage,
  ToolFailure,
  ToolLookup,
  ToolRelation,
  ToolResult,
  ToolResultData,
  ToolState,
  ToolTerminal,
  WaitState,
} from './results.ts'
export type {
  BackgroundSource,
  ControlReceipt,
  ForegroundReturn,
  Handoff,
  InvocationAccess,
  ProcessBlock,
  ToolCommandOutcome,
  ToolControl,
  ToolDefiniteFailure,
  ToolInvocationCommands,
  ToolInvocationContentReader,
  ToolInvocationQueries,
  ToolInvokeOutcome,
  ToolInvokeRequest,
  ToolReleaseDeliveryOutcome,
  ToolRuntime,
  ToolStreamDelta,
  ToolStreamEnd,
  ToolStreamObservation,
  ToolStreamReferences,
  ToolStreamSelection,
  ToolStreamSnapshot,
} from './operations.ts'
export type { ToolDecision, ToolWaitSchemaSnapshot } from './author-context.ts'
export type { ToolExecutionRef } from './execution.ts'
export type { DecisionValue, ToolStartRecord } from './ports.ts'
export type {
  ToolCatalog,
  ToolConsumerProfile,
  ToolDeclarations,
  ToolInspection,
  ToolSettingsDeclaration,
  ToolUsage,
} from './authoring.ts'
export type {
  ClockSegment,
  ControlProgress,
  ControlRecord,
  ExternalResponse,
  PhysicalExecution,
  ProtocolIdentity,
  QueuePosition,
  ResponseProgress,
  ResponseRecord,
  ToolTiming,
  WaitIntent,
  WaitRecord,
} from './records.ts'
export type { ContentPage, DiagnosticPage, ProcessSnapshot, RawOutput } from './custody.ts'
export { judgeToolDelivery } from './result-delivery.ts'
export type {
  ToolDelivery,
  ToolDeliveryFailure,
  ToolDeliveryKey,
  ToolDeliveryRejection,
  ToolResultReceiver,
  ToolSavedReceipt,
} from './result-delivery.ts'
