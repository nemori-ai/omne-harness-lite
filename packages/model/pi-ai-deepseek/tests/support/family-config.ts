import { TEST_DECODER_LIMITS, TEST_EXECUTOR_LIMITS } from '@omne-harness/pi-ai-transport/testing'
import { createTiktokenExecutor } from '@omne-harness/tokenizer-tiktoken'

import { createDeepSeekFamily } from '../../src/index.ts'
import { openAiTokenizerResources } from '@omne-harness/pi-ai-openai'

export async function openTestFamily() {
  const tokenizer = openAiTokenizerResources()
  const created = await createTiktokenExecutor({
    resources: [tokenizer],
    limits: TEST_EXECUTOR_LIMITS,
  })
  if ('failure' in created) throw new Error(JSON.stringify(created.failure))
  const family = createDeepSeekFamily({
    tokenizer,
    executor: created.ok,
    limits: TEST_DECODER_LIMITS,
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
