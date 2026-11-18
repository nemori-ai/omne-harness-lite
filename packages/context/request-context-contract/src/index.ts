export type { ScopeRef, ContextBlockKey } from '@omne-harness/runtime-context-contract'
export type { Path, Decoded, Decoder } from './schema.js'
export {
  standardSchema,
  compactionPolicySchema,
  representationPolicyConfigSchema,
  coverageSchema,
} from './schema.js'
export type { ToolCommandSelection, ToolRoute, ToolDeclarationSet } from './declare-tools.js'
export { declareTools } from './declare-tools.js'
export type { ConversionIndex, RepresentationResult } from './representation.js'
export { chooseRepresentations } from './representation.js'
export type { ProjectedMessage, ProjectedHistory, HumanProjection } from './projection.js'
export { project, projectForHuman, projectMessageForModel } from './projection.js'
export type { CompactionSettingsValue } from './blocks.js'
export { compactionSettingsSchema, compactionSettingsBlock } from './blocks.js'
export type { SystemPromptResult } from './prompt.js'
export { assembleSystemPrompt } from './prompt.js'
export type {
  Access,
  Adoption,
  DurableEvidence,
  RequestContextRef,
  CandidateRef,
  PositionRef,
  EpochId,
  BatchRef,
  PassageRef,
  RegistrationRef,
  SourceGeneration,
  GroupToken,
  CommitOrder,
  PrincipalKey,
  HistorySequence,
  ContextTarget,
  RefKind,
  RefRejection,
} from './refs.js'
export {
  REQUEST_CONTEXT_REF_MAX_LENGTH,
  decodeCandidateRef,
  decodePositionRef,
  decodeEpochId,
  decodeBatchRef,
  decodePassageRef,
  decodeRegistrationRef,
  decodeSourceGeneration,
  decodeGroupToken,
  decodeCommitOrder,
  decodePrincipalKey,
  decodeHistorySequence,
  compareHistorySequence,
} from './refs.js'
export type { AssemblyPolicies, AssemblyOperations } from './ports.js'
export type { PreparedInputKey } from './values.js'
export type { AssemblyOperationsInput } from './operations.js'
export { createAssemblyOperations } from './operations.js'
export type { AssemblyReuse, CachedAssemblyMaterial, ContentControl } from './reuse.js'
export type {
  SourceRead,
  SourceGroupValue,
  GroupSource,
  ContextGroupSources,
  AdoptedRead,
  AdoptedRequestSource,
  SourceDecision,
  ContextReadEligibility,
  PrincipalBinding,
  ContextSources,
  SourceRegistrationAuthority,
  SourceSettlement,
  ContextRegistration,
  RegistrationResult,
  ContextSourceRegistry,
  ContextRegistryOptions,
} from './sources.js'
export type { HistoryResolution, HistoryEvidenceResolver } from './history-resolution.js'
export type {
  HistoryRow,
  HistoryPage,
  HistoryReadResult,
  CompactionContextResult,
  HistorySource,
  ConversionIndexResult,
  ConversionResultSource,
  CompactionPolicy,
  CompactionPolicyPort,
  RepresentationPolicyConfig,
  RepresentationPolicyPort,
} from './ports.js'
export type { BudgetInput } from './budget.js'
export { judgeBudget } from './budget.js'
export type {
  ContributionRejection,
  ContributionResult,
  ContributionsResult,
  PromptContributionRegistry,
} from './registry.js'
export type {
  RequestPurpose,
  AssemblyCall,
  CallIdentity,
  InputGroups,
  GroupName,
  HistoryUpper,
  HistoryCursor,
  TenantModelCall,
  SourcedMessage,
  ContinuationBasis,
  AdoptedRequestFact,
  HistoryEvidence,
  NewInputBatch,
  AssemblyContext,
  PromptContributionBase,
  PromptSection,
  PromptVariable,
  PromptContribution,
  PromptContributionSet,
  SelectedModel,
  ToolAdoption,
  ConditionsEvidence,
  AlterationEvidence,
  PreviousPreparation,
  TransitionEvidence,
  Layer,
  PrefixBreakReason,
  Coverage,
  BudgetBreach,
  FitVerdict,
  RepresentationChoice,
  RequestLayers,
  RequestCandidate,
  AssemblyFailure,
  InvalidReason,
  UnavailableOwner,
  AssemblyUnknown,
  AssemblyOutcome,
  AssemblyResult,
} from './values.js'
export { LAYER_ORDER, PREFIX_BREAK_REASONS, callIdentity } from './values.js'
export type { FixedRequestRecord, FixedRequestRecordRejection } from './fixed-request.js'
export { encodeFixedRequestRecord, decodeFixedRequestRecord } from './fixed-request.js'

export { measureCandidate } from './measurement.js'
