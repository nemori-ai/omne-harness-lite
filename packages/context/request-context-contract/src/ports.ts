import type * as M from '@omne-harness/model-contract'
import type { CompactionContext, RecordEntryRef } from '@omne-harness/message'
import type { ContentBlock, BlockId } from '@omne-harness/content-block'
import type { Access, Adoption, ContextTarget } from './refs.js'
import type {
  AssemblyCall,
  AssemblyFailure,
  AssemblyResult,
  AssemblyUnknown,
  CompactionPlan,
  DeriveInput,
  HistoryCursor,
  HistoryEvidence,
  InvalidReason,
  PlanResult,
  ProjectedHistory,
  ConversionIndex,
  RepresentationChoice,
  StepResult,
  SummaryMaterial,
} from './values.js'
export type { HistoryRow } from './values.js'
import type { HistoryRow } from './values.js'
export type HistoryPage = Readonly<{ rows: readonly HistoryRow[]; next: HistoryCursor | null }>
type PortInvalid = Readonly<{ kind: 'invalid'; field: string; reason: InvalidReason }>
export type HistoryReadResult =
  | Readonly<{ kind: 'page'; page: HistoryPage }>
  | Readonly<{ kind: 'epoch-changed'; current: HistoryEvidence }>
  | Readonly<{ kind: 'denied' }>
  | PortInvalid
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type CompactionContextResult =
  | Readonly<{ kind: 'context'; value: CompactionContext; evidence: HistoryEvidence }>
  | Readonly<{ kind: 'epoch-changed'; current: HistoryEvidence }>
  | Readonly<{ kind: 'denied' }>
  | PortInvalid
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export interface HistorySource<P> {
  read(
    input: Readonly<{
      access: Access<P>
      evidence: HistoryEvidence
      cursor: HistoryCursor | null
      budgetBytes: number
    }>,
  ): Promise<HistoryReadResult>
  /** The incremental judgment window of CM-02 under the same evidence, entries without a message included. */
  compactionContext(
    input: Readonly<{ access: Access<P>; evidence: HistoryEvidence; coverTo: RecordEntryRef }>,
  ): Promise<CompactionContextResult>
}

export type ConversionIndexResult =
  | Readonly<{ kind: 'index'; entries: ConversionIndex }>
  | Readonly<{ kind: 'denied' }>
  | PortInvalid
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>
/** 读取接纳时固定的表示与来源（RQ-04「本成员只读取其合约结果」）。Model 契约没有这个读口，本成员本地定义，结果类型取 Model 的 `ConversionResult`（RQ-Q12）。 */
export interface ConversionResultSource<P> {
  read(
    input: Readonly<{ access: Access<P>; target: ContextTarget; blocks: readonly BlockId[] }>,
  ): Promise<ConversionIndexResult>
}

export type RetainBudget =
  | Readonly<{ kind: 'ratio'; retainRatio: string }>
  | Readonly<{ kind: 'tokens'; retainTokens: string }>
export type CompactionPolicy = Readonly<{
  retainBudget: RetainBudget
  retainPreference: 'newest-first' | 'most-referenced'
  /** 触发界线：窗口占用百分比（与 Model `ContextLimits.compactionTriggerPercent` 同口径）与可选 token 余量。 */
  triggerPercent: string | null
  headroomTokens: string | null
  trimFirst: boolean
  stepBound: string
}>

export type CompactionPlanDraft =
  | Readonly<{
      kind: 'draft'
      coverTo: RecordEntryRef
      retained: readonly RecordEntryRef[]
      bound: string
      shape: CompactionPlan['shape']
    }>
  | Readonly<{ kind: 'floor-exceeds-budget'; floor: readonly RecordEntryRef[]; budget: string }>
/** The measurement of one complete retained set; unavailable is never turned into zero or a huge number. */
export type RetentionMeasurement =
  | Readonly<{ kind: 'measured'; tokens: string }>
  | Readonly<{ kind: 'unknown'; diagnostic: string }>
  | AssemblyFailure
export interface CompactionPolicyPort {
  readonly identity: Adoption
  readonly config: CompactionPolicy
  configDigest(): string
  /** `measure` measures the given entries as one complete set; the policy never holds a lease. */
  plan(
    input: Readonly<{
      view: ProjectedHistory
      context: CompactionContext
      measure: (entries: readonly RecordEntryRef[]) => Promise<RetentionMeasurement>
      windowTokens: string
    }>,
  ): Promise<CompactionPlanDraft | AssemblyFailure | AssemblyUnknown>
  trim(material: SummaryMaterial, limits: Readonly<{ maxBlockBytes: string }>): SummaryMaterial
  summaryInstruction(material: SummaryMaterial): readonly ContentBlock[]
}

export type RepresentationPolicyConfig = Readonly<{
  preferences: Readonly<Record<M.ModelModality, readonly ('original' | 'derived' | 'transcript')[]>>
}>
export interface RepresentationPolicyPort {
  readonly identity: Adoption
  readonly config: RepresentationPolicyConfig
  choose(
    input: Readonly<{
      block: ContentBlock
      conversion: M.ConversionResult | null
      modalities: readonly M.ModelModality[]
    }>,
  ): RepresentationChoice['choice'] | 'none'
}

export type AssemblyPolicies = Readonly<{
  compaction: CompactionPolicyPort
  representation: RepresentationPolicyPort
}>
/** The operation group: each call carries only the call identity; the seven groups are read from sources (RQ-12, RQ-13). */
export interface AssemblyOperations<P> {
  assemble(call: AssemblyCall<P>): Promise<AssemblyResult>
  planCompaction(call: AssemblyCall<P>): Promise<PlanResult>
  deriveStep(input: DeriveInput<P>): Promise<StepResult>
  resume(call: AssemblyCall<P>): Promise<AssemblyResult>
}
