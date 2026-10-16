import { expect, it } from 'vitest'

it('root entry exports no values; the definitions are at ./cordis', async () => {
  const root = (await import('@omne-harness/tool-cordis-contract')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual([])
})
