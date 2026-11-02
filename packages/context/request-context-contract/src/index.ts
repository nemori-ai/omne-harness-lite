export type { ScopeRef, ContextBlockKey } from '@omne-harness/runtime-context-contract'
export type { Path, Decoded, Decoder } from './schema.js'
export {
  standardSchema,
  compactionPolicySchema,
  representationPolicyConfigSchema,
  planProgressSchema,
  compactionPlanSchema,
  coverageSchema,
} from './schema.js'
export type { ToolRoute, ToolDeclarationSet } from './declare-tools.js'
export { declareTools } from './declare-tools.js'
export type { ConversionIndex, RepresentationResult } from './representation.js'
export { chooseRepresentations } from './representation.js'
export type { ProjectedMessage, ProjectedHistory, HumanProjection } from './projection.js'
export { project, projectForHuman } from './projection.js'
export type { CompactionSettingsValue, WindowUsageValue } from './blocks.js'
export {
  windowRatio,
  compactionSettingsSchema,
  windowUsageSchema,
  compactionSettingsBlock,
  windowUsageBlock,
} from './blocks.js'
export type { SystemPromptResult } from './prompt.js'
export { assembleSystemPrompt } from './prompt.js'
export type { Placement, PlacementInput } from './placement.js'
export { SNAPSHOT_ANCHOR_RULE, placeContext } from './placement.js'
export type {
  Access,
  Adoption,
  DurableEvidence,
  RequestContextRef,
  CandidateRef,
  PositionRef,
  PlanId,
  EpochId,
  BatchRef,
  PassageRef,
  RegistrationRef,
  SourceGeneration,
  GroupToken,
  CommitOrder,
  AccountingGeneration,
  RecoveryGrantRef,
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
  decodePlanId,
  decodeEpochId,
  decodeBatchRef,
  decodePassageRef,
  decodeRegistrationRef,
  decodeSourceGeneration,
  decodeGroupToken,
  decodeCommitOrder,
  decodeAccountingGeneration,
  decodeRecoveryGrantRef,
  decodePrincipalKey,
  decodeHistorySequence,
  compareHistorySequence,
} from './refs.js'
export type { AssemblyPolicies, AssemblyOperations } from './ports.js'
export type { PreparedInputKey } from './values.js'
export type { AssemblyOperationsInput } from './operations.js'
export { createAssemblyOperations } from './operations.js'
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
  AccountingOrigin,
  ReceivedAccountFact,
  ContextAccountingInput,
  AccountReceipt,
  ContextAccountingInbox,
  SystemRecoveryAccess,
  AccountReplay,
  RecoveryResult,
  ContextRecovery,
  AccountingSourceAuthority,
  RecoveryAuthority,
  AccountingLimits,
  AccountingOptions,
} from './accounting.js'
export type {
  HistoryRow,
  HistoryPage,
  HistoryReadResult,
  CompactionContextResult,
  HistorySource,
  ConversionIndexResult,
  ConversionResultSource,
  RetainBudget,
  CompactionPolicy,
  CompactionPlanDraft,
  CompactionPolicyPort,
  RepresentationPolicyConfig,
  RepresentationPolicyPort,
  RetentionMeasurement,
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
  InputGroups,
  GroupName,
  HistoryUpper,
  HistoryCursor,
  TenantModelCall,
  SourcedMessage,
  ContinuationBasis,
  AdoptedRequestFact,
  CompactionBasis,
  HistoryEvidence,
  NewInputBatch,
  BlockMaterial,
  SnapshotMaterial,
  ContextReadGroup,
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
  LayerAnchor,
  SnapshotAnchor,
  Coverage,
  BudgetBreach,
  FitVerdict,
  RepresentationChoice,
  SnapshotReminder,
  TailFacts,
  RequestLayers,
  RequestCandidate,
  CompactionPlan,
  PlanProgress,
  SummaryMaterial,
  StepRequest,
  StepInput,
  ContextTransition,
  AssemblyFailure,
  InvalidReason,
  UnavailableOwner,
  AssemblyUnknown,
  AssemblyOutcome,
  AssemblyResult,
  PlanResult,
  StepResult,
} from './values.js'
export { LAYER_ORDER, PREFIX_BREAK_REASONS } from './values.js'
export type { DeriveInput } from './values.js'
