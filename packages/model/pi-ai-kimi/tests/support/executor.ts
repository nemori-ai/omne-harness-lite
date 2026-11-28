import { afterAll } from 'vitest'
import { TEST_EXECUTOR_LIMITS } from '@omne-harness/pi-ai-transport/testing'
import { createTiktokenExecutor, type TiktokenResources } from '@omne-harness/tokenizer-tiktoken'

export async function testExecutor(resources: readonly TiktokenResources[]) {
  const created = await createTiktokenExecutor({
    resources,
    limits: TEST_EXECUTOR_LIMITS,
  })
  if ('failure' in created) throw new Error(JSON.stringify(created.failure))
  afterAll(async () => {
    const closed = await created.ok.close()
    if ('failure' in closed) throw new Error(JSON.stringify(closed.failure))
  })
  return created.ok
}
