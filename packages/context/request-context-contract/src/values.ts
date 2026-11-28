import type {
  Access,
  Adoption,
  DurableEvidence,
  EpochId,
  BatchRef,
  CandidateRef,
  PositionRef,
  PassageRef,
  ContextTarget,
  HistorySequence,
  CommitOrder,
  PrincipalKey,
  GroupToken,
  SourceGeneration,
} from './refs.js'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type * as M from '@omne-harness/model-contract'
import type * as T from '@omne-harness/tool-contract'
import type { Message, RecordEntryRef } from '@omne-harness/message'
import type {
  ContentBlock,
  BlockId,
  ContentReference,
  RepresentationSnapshot,
} from '@omne-harness/content-block'

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
export type PromptVariable = PromptContributionBase & Readonly<{ kind: 'variable'; value: string }>
export type PromptContribution = PromptSection | PromptVariable
export type PromptContributionSet = Readonly<{
  contributions: readonly PromptContribution[]
  digest: string
  generation: string | null
}>

export type SelectedModel = Readonly<{
  recipient: Readonly<{ route: string; model: string }>
  profile: M.ModelProfile<'llm'>
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
  enteredCompaction: boolean
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
  history: Readonly<{
    evidence: HistoryEvidence
    inputs: NewInputBatch
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

/** The basis a request is built on; adopting the request adds its call and the fixed evidence. */
export type ContinuationPrefix = Omit<ContinuationBasis, 'call' | 'fixed'>

export type AdoptedRequestFact = Readonly<{
  coverage: Coverage
  target: ContextTarget
  call: TenantModelCall
  candidate: CandidateRef
  order: CommitOrder
  committed: DurableEvidence
  continuation: ContinuationBasis | null
}>

export type TransitionEvidence = Readonly<{
  candidate: CandidateRef
  committed: DurableEvidence
  epoch: EpochId
}>

export const LAYER_ORDER = Object.freeze(['system-prompt', 'tool-declarations', 'history'] as const)
export type Layer = (typeof LAYER_ORDER)[number]

export const PREFIX_BREAK_REASONS = Object.freeze([
  'system-prompt-changed',
  'tool-set-changed',
  'compaction',
  'extension-altered',
  'model-changed',
  'unchanged',
] as const)
export type PrefixBreakReason = (typeof PREFIX_BREAK_REASONS)[number]

export type Coverage = Readonly<{
  history: Readonly<{ epoch: EpochId; upper: HistoryUpper; prefixDigest: string | null }>
  compactions: Readonly<{ record: RecordEntryRef | null; derivation: string | null }>
  inputs: Readonly<{ batch: BatchRef; saved: DurableEvidence | null }>
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

export type RepresentationOption = 'original' | 'derived' | 'transcript'
export type RepresentationSource = Pick<RepresentationSnapshot, 'definition' | 'engine'>
export type RepresentationChoice = Readonly<{
  message: import('@omne-harness/message').MessageId
  block: BlockId
  choice: RepresentationOption
  source: RepresentationSource | null
  mediaType: string | null
}>

export type RequestLayers = Readonly<{
  systemPrompt: readonly ContentBlock[]
  toolDeclarations: ToolDeclarationSet
  history: readonly Message[]
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
  verdict: Exclude<FitVerdict, { kind: 'fixed-part-over-limit' }>
  representations: readonly RepresentationChoice[]
  assembled: M.AssembledModelInput
  modality: M.ModalityRequirement | null
  continuation: ContinuationPrefix
}>

export type AssemblyFailure =
  | Readonly<{
      kind: 'denied'
      action: 'read-history' | 'assemble' | 'read-inputs' | 'read-accounts'
      diagnostic: string
    }>
  | Readonly<{ kind: 'invalid'; field: string; reason: InvalidReason }>
  | Readonly<{
      kind: 'unavailable'
      owner: UnavailableOwner
      diagnostic: string
      block?: Readonly<{ message: import('@omne-harness/message').MessageId; block: BlockId }>
    }>
export type InvalidReason =
  | 'missing-input'
  | 'missing-access'
  | 'missing-scope'
  | 'inputs-not-saved'
  | 'missing-assembly-context'
  | 'unsupported-format'
  | 'compaction-purpose'
  | 'profile-binding-conflict'
  | 'scope-mismatch'
  | 'contradictory-retry'
  | 'contributions-not-accepted'
  | 'cursor-invalidated'
  | 'transition-mismatch'
  | 'tenant-mismatch'
  | 'unknown-epoch'
  | 'upper-out-of-range'
  | 'source-evidence-conflict'
export type UnavailableOwner =
  | 'history-source'
  | 'meter'
  | 'representation'
  | 'compaction-policy'
  | 'instance'
  | 'source-registry'
  | 'input-source'
  | 'principal-binding'
  | 'read-eligibility'
  | 'preparation'
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
      candidate: RequestCandidate
      goals: readonly Readonly<{
        metric: M.BudgetCheck['metric']
        relation: 'at-most'
        limit: string
      }>[]
    }>
  | Readonly<{
      kind: 'cannot-fit'
      reason: 'fixed-part-over-limit' | 'after-compaction'
      coverage: Coverage
      verdict: FitVerdict
      diagnostic: string
    }>
export type AssemblyResult = AssemblyOutcome | AssemblyFailure | AssemblyUnknown

/** Source-owned group tokens and the principal key; never content hashes or measurements. */
export type PreparedInputKey = Readonly<{
  generation: SourceGeneration | null
  principal: PrincipalKey
  identity: Omit<AssemblyCall<unknown>, 'access'>
  tokens: Readonly<Record<Exclude<GroupName, 'identity'>, GroupToken>>
  rules: Readonly<{ compaction: Adoption; configDigest: string; representation: Adoption }>
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
