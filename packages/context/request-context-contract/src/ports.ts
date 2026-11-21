import type * as M from '@omne-harness/model-contract'
import type { CompactionContext, RecordEntryRef } from '@omne-harness/message'
import type { ContentBlock } from '@omne-harness/content-block'
import type { Access, Adoption } from './refs.js'
import type {
  AssemblyCall,
  AssemblyResult,
  HistoryCursor,
  HistoryEvidence,
  InvalidReason,
  RepresentationOption,
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
    input: Readonly<{
      access: Access<P>
      evidence: HistoryEvidence
      coverTo: RecordEntryRef | null
    }>,
  ): Promise<CompactionContextResult>
}

export type CompactionPolicy = Readonly<{
  triggerPercent: string | null
  headroomTokens: string | null
}>
export interface CompactionPolicyPort {
  readonly identity: Adoption
  readonly config: CompactionPolicy
  configDigest(): string
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
      /** The rows of the table this block can take with the model, in the order of the table. */
      available: readonly RepresentationOption[]
    }>,
  ): RepresentationOption | 'none'
}

export type AssemblyPolicies = Readonly<{
  compaction: CompactionPolicyPort
  representation: RepresentationPolicyPort
}>
export interface AssemblyOperations<P> {
  assemble(call: AssemblyCall<P>): Promise<AssemblyResult>
  resume(call: AssemblyCall<P>): Promise<AssemblyResult>
}
