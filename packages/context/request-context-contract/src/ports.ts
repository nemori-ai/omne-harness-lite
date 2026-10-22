import type * as M from '@omne-harness/model-contract'
import type { Message, RecordEntryRef } from '@omne-harness/message'
import type { ContentBlock, BlockId } from '@omne-harness/content-block'
import type { Access, Adoption, EpochId } from './refs.js'
import type {
  HistoryEvidence,
  CompactionPlan,
  SummaryMaterial,
  RepresentationChoice,
} from './values.js'
import type { ProjectedHistory } from './projection.js'
import type { ConversionIndex } from './representation.js'
export type HistoryRow = Readonly<{
  seq: number
  entry: RecordEntryRef
  message: Message
  bytes: string
  /** 前缀摘要：上一行摘要与本行摘要的链式散列（H3）。 */
  prefixDigest: string
}>
export type HistoryPage = Readonly<{ rows: readonly HistoryRow[]; next: number | null }>
export type HistoryReadResult =
  | Readonly<{ kind: 'page'; page: HistoryPage }>
  | Readonly<{ kind: 'epoch-changed'; current: HistoryEvidence }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{
      kind: 'invalid'
      reason: 'missing-scope' | 'missing-access' | 'unknown-epoch' | 'upper-out-of-range'
    }>
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type CompactionContextResult =
  | Readonly<{
      kind: 'context'
      value: import('@omne-harness/message').CompactionContext
      epoch: EpochId
    }>
  | Readonly<{ kind: 'epoch-changed'; current: HistoryEvidence }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'invalid'; reason: 'missing-scope' | 'missing-access' | 'unknown-epoch' }>
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export interface HistorySource<P> {
  read(
    evidence: HistoryEvidence,
    access: Access<P> | null,
    after: number | null,
    budgetBytes: number,
  ): Promise<HistoryReadResult>
  /** 【待决 RQ-Q11】覆盖范围内全部条目（含不带消息的条目）、范围之后的消息与未结工作集合。 */
  compactionContext(
    evidence: HistoryEvidence,
    access: Access<P> | null,
    coverTo: RecordEntryRef,
  ): Promise<CompactionContextResult>
}

export type ConversionIndexResult =
  | Readonly<{ kind: 'index'; entries: ConversionIndex }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>
/** 读取接纳时固定的表示与来源（RQ-04「本成员只读取其合约结果」）。Model 契约没有这个读口，本成员本地定义，结果类型取 Model 的 `ConversionResult`（RQ-Q12）。 */
export interface ConversionResultSource<P> {
  read(access: Access<P> | null, blocks: readonly BlockId[]): Promise<ConversionIndexResult>
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
export interface CompactionPolicyPort {
  readonly identity: Adoption
  readonly config: CompactionPolicy
  configDigest(): string
  plan(
    input: Readonly<{
      view: ProjectedHistory
      context: import('@omne-harness/message').CompactionContext
      measure: (entries: readonly RecordEntryRef[]) => string
      windowTokens: string
    }>,
  ): CompactionPlanDraft
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

/** Adapter-owned actual wire serialization size; no JSON estimate is substituted. */
export interface RequestSerializer {
  bytesOf(assembled: M.AssembledModelInput): string
}
