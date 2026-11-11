import type { TokenizerDefinition } from '@omne-harness/model-contract'
import type { ModelTextTokenizer, TokenizationFailure } from '@omne-harness/model-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'
import type { TiktokenResources } from './resources.ts'

export type TiktokenExecutorLimits = Readonly<{
  workers: number
  maxLeases: number
  maxQueuedJobs: number
  maxQueuedBytes: number
  maxInputBytes: number
  maxLeaseQueuedJobs: number
  maxCacheBytes: number
  maxCacheEntries: number
  maxLeaseCacheBytes: number
  maxLeaseCacheEntries: number
  maxPieceBytes: number
  cancellationGraceMs: number
  jobTimeoutMs: number
  maxWorkerOldSpaceMb: number
  maxReplacementsPerMinute: number
}>
export type TiktokenLease = Readonly<{
  tokenizer: ModelTextTokenizer
  release(): Promise<Outcome<undefined, TokenizationFailure>>
}>
export interface TiktokenExecutor {
  acquire(
    definition: TokenizerDefinition,
    signal: AbortSignal,
  ): Outcome<TiktokenLease, TokenizationFailure>
  close(): Promise<Outcome<undefined, TokenizationFailure>>
  snapshot(): Readonly<{
    workers: number
    leases: number
    queuedJobs: number
    queuedBytes: number
    runningJobs: number
    cacheBytes: number
    cacheEntries: number
    pieceHits: number
    pieceMisses: number
    completedJobs: number
    failedJobs: number
    rejectedJobs: number
    replacements: number
    queueMs: number
    serviceMs: number
  }>
}
export type ExecutorInput = Readonly<{
  resources: readonly TiktokenResources[]
  limits: TiktokenExecutorLimits
}>
