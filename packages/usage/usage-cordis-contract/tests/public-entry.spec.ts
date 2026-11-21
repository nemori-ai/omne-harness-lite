import { expect, it } from 'vitest'

it('has types only at its root: the registry and its registrations', async () => {
  const root = (await import('@omne-harness/usage-cordis-contract')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual([])
})
