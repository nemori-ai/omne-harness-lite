// The root entry of the Model contract package: the consumer face. It does not import Cordis, a
// provider or Model. It exports the names that members outside the Model group import, the
// declaration closure of those names, and the consumer-side names (result push and public
// observation). The provider protocol is on the `./provider` entry (`src/provider/index.ts`); a
// name is exported from exactly one of the two entries. The grouping rules are the ones of
// tool-contract SPEC「公开入口的分组」; the chapter「提供者协议入口」of docs/public-api.md
// records the grouping of this package.
export type {
  Access,
  Admit,
  Adoption,
  CallAccess,
  ConsumerRef,
  DispatchId,
  FixedModelRequest,
  Identity,
  ModelCallId,
  ModelIdentityKey,
  ModelIdentityRejection,
  ModelInstanceId,
  ModelOperationId,
  ModelReferenceAccess,
  Mutation,
  OutputCursor,
  Parameter,
  ReadId,
  ResultCapacity,
  ResultVersion,
  Revision,
  Supplier,
  ToolDeclaration,
} from './root.ts'
export type * from './result.ts'
export type * from './result-delivery-values.ts'
export type * from './result-delivery.ts'
export type * from './result-delivery-judge.ts'
export { judgeModelDelivery } from './result-delivery-judge.ts'
export type * from './model-stream-values.ts'
export type * from './model-stream.ts'
export { diffModelStream, applyModelStreamDelta } from './model-stream-values.ts'
export type * from './call-surface.ts'
export type {
  MaterializationReceipt,
  RetryDecision,
  RetryPosition,
  RetryResolution,
  TransportFailure,
} from './provider-protocol.ts'
export type {
  AnchorMiss,
  AssembledModelInput,
  BudgetCheck,
  CalibrationReport,
  ContextLimits,
  ForeignThinking,
  LimitMetric,
  Measurement,
  MediaMeasurementFact,
  MeterRepresentation,
  ModalityRequirement,
  ModelInputMeter,
  ModelLimit,
  ModelModality,
  ModelProfile,
  ModelProfileDefinition,
  ParameterAdoption,
  ProfileIdentity,
  ProfileReplay,
  ProfileResolution,
  ProfileScope,
  ProfileSupplier,
  ReplayDeclaration,
  RequestBudget,
  TokenLimit,
  UpstreamLimit,
} from './profile.ts'
export type { ConversionResult, ConvertedContent } from './conversion.ts'
export type { ModelCountingBasis, TokenizerDefinition } from './tokenizer.ts'
export type {
  ModelPreparationLease,
  ModelPreparationResources,
  ModelRequestRules,
  PreparationLineage,
} from './profile-source.ts'
export type * from './diagnostics.ts'
export type { CredentialId } from './credential.ts'
export {
  MODEL_IDENTITY_MAX_LENGTH,
  MODEL_IDENTITY_PREFIXES,
  compareOutputCursors,
  decodeDispatchId,
  decodeModelCallId,
  decodeModelDiagnosticCursor,
  decodeModelDiagnosticId,
  decodeModelInstanceId,
  decodeModelOperationId,
  decodeOutputCursor,
  decodeResultVersion,
  decodeRevision,
} from './identity-values.ts'
export { deriveGuardControlOperation } from './guard-control.ts'

export type {
  ModelInvocationParts,
  ModelInvocationRef,
  ModelReferenceFailure,
  ModelReferenceRejection,
} from './reference.ts'
export {
  MODEL_REFERENCE_MAX_LENGTH,
  encodeModelInvocationRef,
  decodeModelInvocationRef,
  resolveModelInvocationRef,
} from './reference.ts'
