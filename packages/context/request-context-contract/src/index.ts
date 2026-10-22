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
} from './refs.js'
export type { AssemblyPorts, AssemblyPolicies, AssemblyOperations } from './ports.js'
export type { PreparedInputKey } from './values.js'
export { assemble } from './assembly.js'
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
  RequestSerializer,
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
  AssemblyInput,
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
export { planCompaction } from './plan.js'
export { deriveStep } from './compaction-step.js'
export { resume } from './resume.js'
