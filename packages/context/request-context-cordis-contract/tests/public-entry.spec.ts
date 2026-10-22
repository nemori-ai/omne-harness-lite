import { expect, it } from 'vitest'

it('root exposes no runtime values', async () => {
  const root = (await import('@omne-harness/request-context-cordis-contract')) as Record<
    string,
    unknown
  >
  expect(Object.keys(root)).toEqual([])
})
