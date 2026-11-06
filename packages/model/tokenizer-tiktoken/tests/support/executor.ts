import { afterEach } from 'vitest'
import {
  createTiktokenExecutor,
  type TiktokenExecutor,
  type TiktokenExecutorLimits,
  type TiktokenResources,
} from '../../src/index.ts'

export const limits: TiktokenExecutorLimits = {
  workers: 1,
  maxLeases: 16,
  maxQueuedJobs: 32,
  maxQueuedBytes: 2 ** 20,
  maxInputBytes: 2 ** 20,
  maxLeaseQueuedJobs: 8,
  maxCacheBytes: 65536,
  maxCacheEntries: 256,
  maxLeaseCacheBytes: 32768,
  maxLeaseCacheEntries: 128,
  maxPieceBytes: 4096,
  jobTimeoutMs: 10000,
  maxWorkerOldSpaceMb: 256,
  maxReplacementsPerMinute: 2,
  cancellationGraceMs: 25,
}
const executors: TiktokenExecutor[] = []
afterEach(async () => {
  await Promise.all(executors.splice(0).map(executor => executor.close()))
})
export async function executorOf(
  resources: readonly TiktokenResources[],
  overrides: Partial<TiktokenExecutorLimits> = {},
) {
  const created = await createTiktokenExecutor({ resources, limits: { ...limits, ...overrides } })
  if ('failure' in created) throw new Error(JSON.stringify(created.failure))
  executors.push(created.ok)
  return created.ok
}
export async function tokenizerOf(resources: TiktokenResources) {
  const executor = await executorOf([resources])
  const acquired = executor.acquire(resources.definition, new AbortController().signal)
  if ('failure' in acquired) throw new Error(JSON.stringify(acquired.failure))
  return acquired.ok.tokenizer
}
