import { z } from 'zod'

const count = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)

export const modelTokenizersConfig = z.strictObject({
  workers: count,
  maxLeases: count,
  maxQueuedJobs: count,
  maxQueuedBytes: count,
  maxInputBytes: count,
  maxLeaseQueuedJobs: count,
  maxCacheBytes: count,
  maxCacheEntries: count,
  maxLeaseCacheBytes: count,
  maxLeaseCacheEntries: count,
  maxPieceBytes: count,
  jobTimeoutMs: count,
  maxWorkerOldSpaceMb: count,
  maxReplacementsPerMinute: count,
})
