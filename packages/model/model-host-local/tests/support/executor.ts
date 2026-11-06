import { afterAll } from 'vitest'
import { createTiktokenExecutor, type TiktokenResources } from '@omne-harness/tokenizer-tiktoken'

export async function testExecutor(resources: readonly TiktokenResources[]) {
  const created = await createTiktokenExecutor({
    resources,
    limits: {
      workers: 1,
      maxLeases: 256,
      maxQueuedJobs: 32,
      maxQueuedBytes: 32 * 1024 * 1024,
      maxInputBytes: 8 * 1024 * 1024,
      maxLeaseQueuedJobs: 4,
      maxCacheBytes: 2 * 1024 * 1024,
      maxCacheEntries: 8192,
      maxLeaseCacheBytes: 256 * 1024,
      maxLeaseCacheEntries: 2048,
      maxPieceBytes: 4096,
      jobTimeoutMs: 10000,
      maxWorkerOldSpaceMb: 128,
      maxReplacementsPerMinute: 2,
      cancellationGraceMs: 25,
    },
  })
  if ('failure' in created) throw new Error(JSON.stringify(created.failure))
  afterAll(async () => {
    const closed = await created.ok.close()
    if ('failure' in closed) throw new Error(JSON.stringify(closed.failure))
  })
  return created.ok
}
