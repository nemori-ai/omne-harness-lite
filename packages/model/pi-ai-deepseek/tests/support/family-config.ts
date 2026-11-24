import { createTiktokenExecutor } from '@omne-harness/tokenizer-tiktoken'

import { createDeepSeekFamily } from '../../src/index.ts'
import { openAiTokenizerResources } from '@omne-harness/pi-ai-openai'

export async function openTestFamily() {
  const tokenizer = openAiTokenizerResources()
  const created = await createTiktokenExecutor({
    resources: [tokenizer],
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
  const family = createDeepSeekFamily({
    tokenizer,
    executor: created.ok,
    limits: {
      toolArguments: {
        maxBytes: 65536,
        maxDepth: 32,
        maxItems: 1024,
        maxMembers: 256,
        maxStringLength: 65536,
        maxNumberLength: 64,
      },
      maxReasoningText: 65536,
    },
    margin: {
      percent: '10',
      source: {
        owner: 'pi-ai-deepseek-tests',
        name: 'margin',
        revision: '1',
        digest: 'a'.repeat(64),
      },
    },
  })
  return {
    family,
    close: async () => {
      const closed = await created.ok.close()
      if ('failure' in closed) throw new Error(JSON.stringify(closed.failure))
    },
  }
}
