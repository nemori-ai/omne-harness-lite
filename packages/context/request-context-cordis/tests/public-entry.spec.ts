import { expect, it } from 'vitest'

it('the root entry exports nothing', async () => {
  const root = (await import('@omne-harness/request-context-cordis')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual([])
})
