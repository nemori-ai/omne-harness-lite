import { expect, it } from 'vitest'

it('the root entry exports types only, so it has no runtime key until the runtime values land', async () => {
  const root = (await import('@omne-harness/model-contract')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual([])
})
