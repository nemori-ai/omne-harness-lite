import type {
  Access,
  Adoption,
  DurableEvidence,
  EpochId,
  BatchRef,
  CandidateRef,
  PositionRef,
  PassageRef,
  PlanId,
  ContextTarget,
  HistorySequence,
  CommitOrder,
  PrincipalKey,
  GroupToken,
  SourceGeneration,
} from './refs.js'
import type {
  ScopeRef,
  ContextBlockKey,
  SnapshotResult,
  ChangesResult,
  BlockRevision,
  ViewRevision,
  EligibilityId,
  BlockValue,
  BlockDescriptorBase,
} from '@omne-harness/runtime-context-contract'
import type * as M from '@omne-harness/model-contract'
import type * as T from '@omne-harness/tool-contract'
import type {
  Message,
  RecordEntryRef,
  CompactionMessage,
  MessageContentBlock,
} from '@omne-harness/message'
import type { ContentBlock, BlockId, ContentReference } from '@omne-harness/content-block'

export type RequestPurpose = 'main' | 'extension'

export type HistoryUpper =
  | Readonly<{ kind: 'empty' }>
  | Readonly<{ kind: 'entry'; seq: HistorySequence }>
export type HistoryEvidence = Readonly<{
  target: ContextTarget
  epoch: EpochId
  upper: HistoryUpper
}>
export type HistoryCursor = Readonly<{ evidence: HistoryEvidence; after: HistorySequence }>
export type TenantModelCall = Readonly<{
  tenant: import('@omne-harness/legal-identity').TenantId
  call: M.ModelCallId
}>
export type SourcedMessage =
  | Readonly<{
      message: Extract<Message, { role: 'assistant' }>
      sourceCall?: TenantModelCall
    }>
  | Readonly<{ message: Exclude<Message, { role: 'assistant' }>; sourceCall?: never }>

export type NewInputBatch = Readonly<{
  batch: BatchRef
  entries: readonly RecordEntryRef[]
  saved: DurableEvidence | null
}>

export type BlockMaterial<K extends ContextBlockKey = ContextBlockKey> = Readonly<{
  key: K
  revision: BlockRevision
  value: BlockValue<K>
  previous: unknown | null
  volatility: BlockDescriptorBase<K, BlockValue<K>>['volatility']
}>

export type SnapshotMaterial = Readonly<{
  scope: ScopeRef
  eligibility: EligibilityId
  revision: ViewRevision
  blocks: readonly BlockMaterial[]
}>

export type ContextReadGroup = Readonly<{
  scope: ScopeRef
  recipient: string
  read: SnapshotResult | ChangesResult
  snapshot: SnapshotMaterial | null
  perRequest: readonly BlockMaterial[]
  source: DurableEvidence
  coverage: DurableEvidence
}>

export type AssemblyContext = Readonly<{
  scope: ScopeRef
  definition: string | null
  workspace: string | null
  keys: Readonly<Record<string, string>>
}>

export type PromptContributionBase = Readonly<{
  name: string
  scope: ScopeRef | null
  source: Adoption
  revision: string
}>
export type PromptSection = PromptContributionBase &
  Readonly<{ kind: 'section'; order: string; template: string; uses: readonly string[] }>
export type PromptVariable = PromptContributionBase &
  Readonly<{ kind: 'variable'; value: string; volatility: 'stable' | 'per-request' }>
export type PromptContribution = PromptSection | PromptVariable
export type PromptContributionSet = Readonly<{
  contributions: readonly PromptContribution[]
  digest: string
  generation: string | null
}>

export type SelectedModel = Readonly<{
  recipient: Readonly<{ route: string; model: string }>
  profile: M.ModelProfile
  parameters: readonly M.ParameterAdoption[]
  replay: 'on' | 'off'
  toolsEvidence: DurableEvidence
  evidence: DurableEvidence
}>

export type ToolAdoption = Readonly<{
  resident: boolean
  availability: T.ToolAvailability
  binding: Adoption
}>

export type ConditionsEvidence = Readonly<{ evidence: DurableEvidence; revision: string }>
export type AlterationEvidence = Readonly<{
  evidence: DurableEvidence
  touches: 'existing-layers' | 'history-tail'
}>
export type PreviousPreparation = Readonly<{
  candidate: CandidateRef
  enteredCompaction: PlanId | null
  carried?: RequestCandidate
}>

export type AssemblyCall<P> = Readonly<{
  access: Access<P>
  candidate: CandidateRef
  position: PositionRef
  purpose: RequestPurpose
}>

export type CallIdentity = Omit<AssemblyCall<unknown>, 'access'>

export function callIdentity(call: AssemblyCall<unknown>): CallIdentity {
  return { purpose: call.purpose, position: call.position, candidate: call.candidate }
}

export type AssemblyInput<P> = Readonly<{
  target: ContextTarget
  identity: Readonly<{
    access: Access<P>
    purpose: RequestPurpose
    position: PositionRef
    candidate: CandidateRef
  }>
  history: HistoryEvidence
  inputs: NewInputBatch
  contextRead: ContextReadGroup
  adopted: AdoptedRequestFact | null
  transition: TransitionEvidence | null
  promptContributions: PromptContributionSet | null
  assembleContext: AssemblyContext
  selection: SelectedModel
  tools: readonly ToolAdoption[]
  conditions: ConditionsEvidence
  previous: PreviousPreparation | null
  alterations: readonly AlterationEvidence[]
  beforeModelCall: readonly PassageRef[] | null
}>

export type InputGroups<P> = Readonly<{
  identity: AssemblyCall<P>
  history: Readonly<{ evidence: HistoryEvidence; inputs: NewInputBatch }>
  context: Readonly<{
    contextRead: ContextReadGroup
    adopted: AdoptedRequestFact | null
    transition: TransitionEvidence | null
  }>
  prompt: Readonly<{
    promptContributions: PromptContributionSet | null
    assembleContext: AssemblyContext
  }>
  model: SelectedModel
  tools: readonly ToolAdoption[]
  control: Readonly<{
    conditions: ConditionsEvidence
    previous: PreviousPreparation | null
    alterations: readonly AlterationEvidence[]
    beforeModelCall: readonly PassageRef[] | null
  }>
}>
export type GroupName = keyof InputGroups<unknown>

export type ContinuationBasis = Readonly<{
  call: TenantModelCall
  fixed: DurableEvidence
  history: HistoryEvidence
  messagePrefix: readonly import('@omne-harness/message').MessageId[]
  projection: Adoption
  system: DurableEvidence
  tools: DurableEvidence
  parameters: DurableEvidence
  replay: DurableEvidence
  visibility: DurableEvidence
}>

export type AdoptedRequestFact = Readonly<{
  coverage: Coverage
  target: ContextTarget
  call: TenantModelCall
  candidate: CandidateRef
  order: CommitOrder
  committed: DurableEvidence
  windowTokens: string
  accounting:
    | Readonly<{ kind: 'unique'; dispatch: M.DispatchId }>
    | Readonly<{ kind: 'unsettled' | 'multiple' }>
  forecast: Readonly<{ kind: 'estimate'; usedTokens: string }> | null
  continuation: ContinuationBasis | null
}>

export type TransitionEvidence = Readonly<{
  planId: PlanId
  candidate: CandidateRef
  committed: DurableEvidence
  epoch: EpochId
}>

export const LAYER_ORDER = Object.freeze([
  'system-prompt',
  'tool-declarations',
  'history-head',
  'snapshot-reminder',
  'history-body',
  'tail-facts',
] as const)
export type Layer = (typeof LAYER_ORDER)[number]

export const PREFIX_BREAK_REASONS = Object.freeze([
  'new-full-read',
  'system-prompt-changed',
  'tool-set-changed',
  'compaction',
  'extension-altered',
  'model-changed',
  'unchanged',
] as const)
export type PrefixBreakReason = (typeof PREFIX_BREAK_REASONS)[number]

export type LayerAnchor = Readonly<{
  layer: Extract<Layer, 'history-head' | 'snapshot-reminder' | 'history-body'>
  seq: HistorySequence
  prefixDigest: string
}>
export type SnapshotAnchor = Readonly<{
  epoch: EpochId
  position: HistoryUpper
  prefixDigest: string | null
}>

export type Coverage = Readonly<{
  history: Readonly<{ epoch: EpochId; upper: HistoryUpper; anchors: readonly LayerAnchor[] }>
  compactions: Readonly<{ record: RecordEntryRef | null; derivation: string | null }>
  inputs: Readonly<{ batch: BatchRef; saved: DurableEvidence | null }>
  snapshot: Readonly<{
    scope: ScopeRef
    eligibility: EligibilityId
    revision: ViewRevision
    anchor: SnapshotAnchor
    content: 'full' | 'incremental'
  }>
  prompt: Readonly<{
    sections: readonly Readonly<{
      name: string
      scope: ScopeRef | null
      source: Adoption
      revision: string
    }>[]
    digest: string
    generation: string | null
  }>
  model: Readonly<{
    profile: Adoption
    revision: string
    recipient: string
    parametersDigest: string
    replay: 'on' | 'off'
  }>
  tools: Readonly<{ direct: readonly string[]; programmatic: readonly string[]; digest: string }>
  conditions: ConditionsEvidence
  alterations: readonly AlterationEvidence[]
  representations: readonly RepresentationChoice[]
  budget: Readonly<{
    inputDigest: string
    kind: 'complete' | 'deferred-media'
    deferred: readonly ContentReference[]
    unknownLimits: readonly string[]
  }>
  prefixBreak: PrefixBreakReason
}>

export type BudgetBreach = Readonly<{ check: M.BudgetCheck; layer: Layer | 'whole' }>
export type FitVerdict =
  | Readonly<{ kind: 'fits'; report: M.RequestBudget }>
  | Readonly<{
      kind: 'fixed-part-over-limit'
      report: M.RequestBudget
      breaches: readonly [BudgetBreach, ...BudgetBreach[]]
    }>
  | Readonly<{
      kind: 'needs-compaction'
      report: M.RequestBudget
      breaches: readonly [BudgetBreach, ...BudgetBreach[]]
    }>
  | Readonly<{
      kind: 'limit-unknown'
      report: M.RequestBudget
      unknown: readonly [M.BudgetCheck, ...M.BudgetCheck[]]
    }>

export type RepresentationChoice = Readonly<{
  message: import('@omne-harness/message').MessageId
  block: BlockId
  choice: 'original' | 'derived' | 'transcript' | 'pending-load'
  converter: Adoption | null
  mediaType: string | null
}>

export type SnapshotReminder = Readonly<{
  scope: ScopeRef
  eligibility: EligibilityId
  revision: ViewRevision
  anchor: SnapshotAnchor
  blocks: readonly BlockMaterial[]
  message: import('@omne-harness/message').SystemReminderMessage | null
}>
export type TailFacts = Readonly<{
  blocks: readonly BlockMaterial[]
  message: import('@omne-harness/message').SystemReminderMessage | null
}>

export type RequestLayers = Readonly<{
  systemPrompt: readonly ContentBlock[]
  toolDeclarations: ToolDeclarationSet
  historyHead: readonly Message[]
  snapshotReminder: SnapshotReminder
  historyBody: readonly Message[]
  tailFacts: TailFacts
}>

export type RequestCandidate = Readonly<{
  preparation: Readonly<{
    key: PreparedInputKey
    rows: readonly HistoryRow[]
    view: ProjectedHistory
  }>
  candidate: CandidateRef
  layers: RequestLayers
  coverage: Coverage
  verdict: Extract<FitVerdict, { kind: 'fits' | 'limit-unknown' }>
  representations: readonly RepresentationChoice[]
  assembled: M.AssembledModelInput
  modality: M.ModalityRequirement | null
  continuation: Omit<ContinuationBasis, 'call' | 'fixed'>
}>

export type RequestFrame = Readonly<{
  system: M.AssembledModelInput['system']
  tools: M.AssembledModelInput['tools']
  snapshotReminder: Message | null
  tailFacts: Message | null
}>

export type CompactionBasis = Readonly<{
  target: ContextTarget
  history: HistoryEvidence
  context: import('@omne-harness/message').CompactionContext
  projected: ProjectedHistory
  selection: SelectedModel
  representation: Adoption
  continuation: ContinuationBasis | null
  frame: RequestFrame
  retainedBudget: string
  digest: string
}>
export type CompactionPlan = Readonly<{
  planId: PlanId
  candidate: CandidateRef
  bound: string
  policy: Readonly<{ identity: Adoption; configDigest: string }>
  covers: import('@omne-harness/message').CompactedRange
  retained: readonly RecordEntryRef[]
  shape: Readonly<{ kind: 'summarize'; trimFirst: boolean }>
  basis: CompactionBasis
}>
export type PlanProgress = Readonly<{
  planId: PlanId
  completed: string
  consumed: readonly Readonly<{ index: string; evidence: DurableEvidence }>[]
}>

export type SummaryMaterial = Readonly<{
  covered: readonly import('@omne-harness/message').CoveredEntry[]
  retained: readonly RecordEntryRef[]
  trimmed: readonly Readonly<{
    message: import('@omne-harness/message').MessageId
    block: BlockId
    originalBytes: string
    keptBytes: string
  }>[]
}>
export type StepRequest = Readonly<{
  planId: PlanId
  index: string
  kind: 'summarize'
  material: SummaryMaterial
  assembled: M.AssembledModelInput
}>

export type StepInput =
  | Readonly<{
      kind: 'summary'
      index: string
      produced: readonly [MessageContentBlock, ...MessageContentBlock[]]
      consumed: DurableEvidence
    }>
  | Readonly<{ kind: 'vetoed'; index: string; reason: string; evidence: DurableEvidence }>

export type ContextTransition = Readonly<{
  planId: PlanId
  candidate: CandidateRef
  message: CompactionMessage
  derivation: import('@omne-harness/message').CompactionDerivation
  commitment: Readonly<{
    preparation: CandidateRef
    steps: readonly Readonly<{ index: string; consumed: DurableEvidence }>[]
    digest: string
  }>
}>

export type AssemblyFailure =
  | Readonly<{
      kind: 'denied'
      action: 'read-history' | 'read-conversions' | 'assemble' | 'read-inputs' | 'read-accounts'
      diagnostic: string
    }>
  | Readonly<{ kind: 'invalid'; field: string; reason: InvalidReason }>
  | Readonly<{
      kind: 'unavailable'
      owner: UnavailableOwner
      diagnostic: string
      original?: M.ConversionResult
    }>
export type InvalidReason =
  | 'missing-input'
  | 'missing-access'
  | 'missing-scope'
  | 'inputs-not-saved'
  | 'missing-snapshot-material'
  | 'missing-assembly-context'
  | 'unsupported-format'
  | 'compaction-purpose'
  | 'per-request-variable'
  | 'profile-binding-conflict'
  | 'resume-without-full-snapshot'
  | 'scope-mismatch'
  | 'contradictory-retry'
  | 'contributions-not-accepted'
  | 'cursor-invalidated'
  | 'plan-mismatch'
  | 'progress-mismatch'
  | 'policy-mismatch'
  | 'tenant-mismatch'
  | 'unknown-epoch'
  | 'upper-out-of-range'
  | 'source-evidence-conflict'
  | 'invalid-account'
export type UnavailableOwner =
  | 'history-source'
  | 'meter'
  | 'conversion-results'
  | 'runtime-context'
  | 'representation'
  | 'compaction-policy'
  | 'instance'
  | 'source-registry'
  | 'input-source'
  | 'principal-binding'
  | 'read-eligibility'
  | 'preparation'
  | 'accounting'
export type AssemblyUnknown = Readonly<{
  kind: 'unknown'
  source: 'read' | 'commit'
  diagnostic: string
}>

export type AssemblyOutcome =
  | Readonly<{ kind: 'candidate-before-extension'; candidate: RequestCandidate }>
  | Readonly<{ kind: 'candidate-fixable'; candidate: RequestCandidate }>
  | Readonly<{
      kind: 'needs-compaction'
      coverage: Coverage
      verdict: Extract<FitVerdict, { kind: 'needs-compaction' }>
      layers: RequestLayers
    }>
  | Readonly<{
      kind: 'cannot-fit'
      reason: 'fixed-part-over-limit' | 'after-compaction'
      coverage: Coverage
      verdict: FitVerdict
      diagnostic: string
    }>
export type AssemblyResult = AssemblyOutcome | AssemblyFailure | AssemblyUnknown

export type PlanResult =
  | Readonly<{ kind: 'planned'; plan: CompactionPlan; progress: PlanProgress; first: StepRequest }>
  | Readonly<{
      kind: 'cannot-fit'
      reason: 'floor-exceeds-budget'
      floor: readonly RecordEntryRef[]
      budget: string
      diagnostic: string
    }>
  | AssemblyFailure
  | AssemblyUnknown
export type StepResult =
  | Readonly<{ kind: 'next'; step: StepRequest; progress: PlanProgress }>
  | Readonly<{ kind: 'transition'; value: ContextTransition; progress: PlanProgress }>
  | Readonly<{
      kind: 'cannot-fit'
      reason: 'after-compaction'
      cause: 'bound-exhausted' | 'step-vetoed' | 'summary-illegal'
      progress: PlanProgress
      diagnostic: string
    }>
  | AssemblyFailure
  | AssemblyUnknown

/** Source-owned group tokens and the principal key; never content hashes or measurements. */
export type PreparedInputKey = Readonly<{
  generation: SourceGeneration | null
  principal: PrincipalKey
  identity: Omit<AssemblyCall<unknown>, 'access'>
  tokens: Readonly<Record<Exclude<GroupName, 'identity'>, GroupToken>>
  rules: Readonly<{ compaction: Adoption; configDigest: string; representation: Adoption }>
}>
export type DeriveInput<P> = Readonly<{
  call: AssemblyCall<P>
  plan: CompactionPlan
  progress: PlanProgress
  step: StepInput
  material: SummaryMaterial
}>

export type ToolCommandSelection =
  | Readonly<{ kind: 'none' }>
  | Readonly<{
      kind: 'argument'
      encoding: T.CommandCallEncoding
      commands: readonly string[]
    }>
export type ToolRoute = Readonly<{
  declared: string
  tool: Adoption
  binding: Adoption
  selection: ToolCommandSelection
}>
export type ToolDeclarationSet = Readonly<{
  direct: readonly M.ToolDeclaration[]
  programmatic: readonly M.ToolDeclaration[]
  routes: readonly ToolRoute[]
  digest: string
}>

export type HistoryRow = Readonly<{
  seq: HistorySequence
  entry: RecordEntryRef
  bytes: string
  prefixDigest: string
}> &
  SourcedMessage

export type ProjectedMessage = Readonly<{
  seq: HistorySequence
  entry: RecordEntryRef
  prefixDigest: string
  dropped: readonly BlockId[]
}> &
  SourcedMessage
export type ProjectedHistory = Readonly<{
  epoch: EpochId
  messages: readonly ProjectedMessage[]
  compaction: Readonly<{ seq: HistorySequence; entry: RecordEntryRef }> | null
}>

export type ConversionIndex = ReadonlyMap<BlockId, M.ConversionResult>
