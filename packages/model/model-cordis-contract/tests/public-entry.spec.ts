import { expect, it } from 'vitest'

it('the root entry exports no value: the contract types are erased and Cordis values live in ./cordis', async () => {
  const root = (await import('@omne-harness/model-cordis-contract')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual([])
})
