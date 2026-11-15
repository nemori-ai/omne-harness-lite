import { expect, it } from 'vitest'

it('the public entry exports the policy parser and the decision only', async () => {
  const root = (await import('@omne-harness/retry')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(['decideRetry', 'parseRetryPolicy'])
})
