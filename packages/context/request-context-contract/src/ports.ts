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
export type RetentionMeasurement =
  | Readonly<{ kind: 'measured'; tokens: string }>
  | Readonly<{ kind: 'unknown'; diagnostic: string }>
  | AssemblyFailure
export interface CompactionPolicyPort {
  readonly identity: Adoption
  readonly config: CompactionPolicy
  configDigest(): string
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
export interface AssemblyOperations<P> {
  assemble(call: AssemblyCall<P>): Promise<AssemblyResult>
  planCompaction(call: AssemblyCall<P>): Promise<PlanResult>
  deriveStep(input: DeriveInput<P>): Promise<StepResult>
  resume(call: AssemblyCall<P>): Promise<AssemblyResult>
}
