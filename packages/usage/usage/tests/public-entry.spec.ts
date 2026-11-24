import { expect, it } from 'vitest'

it('exports the query service and the registry, nothing of Cordis', async () => {
  const root = (await import('@omne-harness/usage')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(['createUsage', 'createUsageSources'])
})
