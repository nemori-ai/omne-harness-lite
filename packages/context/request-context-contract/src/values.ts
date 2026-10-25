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

/** 历史上界：空历史没有任何行，不借用 -1。 */
export type HistoryUpper =
  | Readonly<{ kind: 'empty' }>
  | Readonly<{ kind: 'entry'; seq: HistorySequence }>
/** 组二：历史依据。一次组装内固定（H1）。 */
export type HistoryEvidence = Readonly<{
  target: ContextTarget
  epoch: EpochId
  upper: HistoryUpper
}>
/** 分页游标：带它所属的历史依据与已读到的序号。 */
export type HistoryCursor = Readonly<{ evidence: HistoryEvidence; after: HistorySequence }>
/** 编入租户的模型调用引用。 */
export type TenantModelCall = Readonly<{
  tenant: import('@omne-harness/legal-identity').TenantId
  call: M.ModelCallId
}>
/** 只有 assistant 消息可以带来源调用（J48）。 */
export type SourcedMessage =
  | Readonly<{
      message: Extract<Message, { role: 'assistant' }>
      sourceCall?: TenantModelCall
    }>
  | Readonly<{ message: Exclude<Message, { role: 'assistant' }>; sourceCall?: never }>

/** 组二：已可靠保存的新输入批。`saved` 为 null 即「新输入未保存」→ 无效（RQ-02）。 */
export type NewInputBatch = Readonly<{
  batch: BatchRef
  entries: readonly RecordEntryRef[]
  saved: DurableEvidence | null
}>

/** ④ 层与 ⑥ 层的块材料：按模型资格过滤后的当前值与前值，带变化频率（RQ-02 组三）。 */
export type BlockMaterial<K extends ContextBlockKey = ContextBlockKey> = Readonly<{
  key: K
  revision: BlockRevision
  value: BlockValue<K>
  previous: unknown | null
  volatility: BlockDescriptorBase<K, BlockValue<K>>['volatility']
}>

/** 最近一次完整读取的块材料：身份是作用域引用、资格身份、快照修订加锚点（S-03 `SnapshotReminder` 身份）。 */
export type SnapshotMaterial = Readonly<{
  scope: ScopeRef
  eligibility: EligibilityId
  revision: ViewRevision
  blocks: readonly BlockMaterial[]
}>

/** 组三：runtime context 读取结果。`read` 直接消费 RC 的封闭读取结果。 */
export type ContextReadGroup = Readonly<{
  scope: ScopeRef
  recipient: string
  read: SnapshotResult | ChangesResult
  /** 完整读取时是本次读到的；增量读取时是调用方保存的最近一次完整读取的材料；缺为无效。 */
  snapshot: SnapshotMaterial | null
  /** 每次读取另带的逐请求块当前值（RC-04）。 */
  perRequest: readonly BlockMaterial[]
  source: DurableEvidence
  coverage: DurableEvidence
}>

/** 组四：组装上下文，不透明键（RQ-02）。 */
export type AssemblyContext = Readonly<{
  scope: ScopeRef
  definition: string | null
  workspace: string | null
  keys: Readonly<Record<string, string>>
}>

/** 组四：一条贡献，有序段或变量（S-03 身份：名加作用域）。 */
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
/** 本作用域适用的贡献集合：全局层加本作用域层；`digest` 是段列表摘要，`generation` 是登记面实例代次（RQD 性质 2）。 */
export type PromptContributionSet = Readonly<{
  contributions: readonly PromptContribution[]
  digest: string
  generation: string | null
}>

/** 组五：选定模型。 */
export type SelectedModel = Readonly<{
  recipient: Readonly<{ route: string; model: string }>
  profile: M.ModelProfile
  parameters: readonly M.ParameterAdoption[]
  /** 为一次请求整体关闭回放（RQ-04）。 */
  replay: 'on' | 'off'
  toolsEvidence: DurableEvidence
  evidence: DurableEvidence
}>

/** 组六：一个本次合法可用的工具。 */
export type ToolAdoption = Readonly<{
  resident: boolean
  availability: T.ToolAvailability
  binding: Adoption
}>

/** 组七：条件证据的投影、扩展改写依据、上一次准备、调模型之前位置的经过。 */
export type ConditionsEvidence = Readonly<{ evidence: DurableEvidence; revision: string }>
export type AlterationEvidence = Readonly<{
  evidence: DurableEvidence
  /** 改写触及①至④已有内容，或只追加到⑤尾部（R8）。 */
  touches: 'existing-layers' | 'history-tail'
}>
export type PreviousPreparation = Readonly<{
  candidate: CandidateRef
  enteredCompaction: PlanId | null
  /** Previously computed content supplied by its owner; outcomes are always recomputed. */
  carried?: RequestCandidate
}>

/** 一次组装调用：组一，调用方不可变的身份与用途。 */
export type AssemblyCall<P> = Readonly<{
  access: Access<P>
  candidate: CandidateRef
  position: PositionRef
  purpose: RequestPurpose
}>

/**
 * 已稳定读取的七组材料的内部视图。它不是公开入口：操作组只经来源集合读出它（RQ-13）。
 */
export type AssemblyInput<P> = Readonly<{
  target: ContextTarget
  // 组一 调用身份与用途
  identity: Readonly<{
    access: Access<P>
    purpose: RequestPurpose
    position: PositionRef
    candidate: CandidateRef
  }>
  // 组二 历史与新输入
  history: HistoryEvidence
  inputs: NewInputBatch
  // 组三 runtime context 读取结果
  contextRead: ContextReadGroup
  adopted: AdoptedRequestFact | null
  transition: TransitionEvidence | null
  // 组四 系统提示词
  promptContributions: PromptContributionSet | null
  assembleContext: AssemblyContext
  // 组五 模型侧
  selection: SelectedModel
  // 组六 工具侧
  tools: readonly ToolAdoption[]
  // 组七 当前条件与本次经过
  conditions: ConditionsEvidence
  previous: PreviousPreparation | null
  alterations: readonly AlterationEvidence[]
  beforeModelCall: readonly PassageRef[] | null
}>

/** 七组的数据视图；第三组的已采用事实由本成员从窄采用来源填入。 */
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

/** 协调者随已采用事实保存并传回的被延续调用依据（J48）。 */
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

/** 当前已固定采用的请求：原覆盖证据加协调者保存的固定调用关联（RQ-14）。 */
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

/** 压缩转换依据：共同提交之后由调用方传入 `resume`（RQ-06）。 */
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

/** 一层锚点处的序号与前缀摘要（H3）。 */
export type LayerAnchor = Readonly<{
  layer: Extract<Layer, 'history-head' | 'snapshot-reminder' | 'history-body'>
  seq: HistorySequence
  prefixDigest: string
}>
/** 快照锚点：完整读取时的模型可见历史尾部（R4）。位置为空时前缀摘要为 null。 */
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
  /** 渲染成的提醒消息；没有稳定块时为 null。 */
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
  /** 按 Model 的形状交出的组装输入，供协调者直接交 `ModelRequestPreparation.prepare`。 */
  assembled: M.AssembledModelInput
  modality: M.ModalityRequirement | null
  /** The facts a later request compares before it declares `continues`; the coordinator adds the call and the commit when it fixes this candidate. */
  continuation: Omit<ContinuationBasis, 'call' | 'fixed'>
}>

/** 计划时冻结的压缩依据：可保存的数据值，不带读口、租约或句柄（RQ-06）。 */
export type CompactionBasis = Readonly<{
  target: ContextTarget
  history: HistoryEvidence
  context: import('@omne-harness/message').CompactionContext
  projected: ProjectedHistory
  selection: SelectedModel
  representation: Adoption
  continuation: ContinuationBasis | null
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
/** 摘要步；修剪在第一个摘要步之前完成，不是一步（J12）。 */
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
  /** 压缩记录及其确定性消息身份；真正提交归历史持有者。 */
  message: CompactionMessage
  /** 摘要与保留名单及覆盖范围一致的证明：`judgeCompaction` 通过时的上下文摘要。 */
  derivation: import('@omne-harness/message').CompactionDerivation
  /** 绑定原准备身份与每步消费依据的承诺；同一承诺只配一条压缩记录。 */
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
  /** The source set generation of a hosted operation group; `null` for a standalone group. */
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

export type ToolRoute = Readonly<{
  declared: string
  tool: Adoption
  binding: Adoption
  command: string | null
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
  /** 前缀摘要：上一行摘要与本行摘要的链式散列（H3）。 */
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
