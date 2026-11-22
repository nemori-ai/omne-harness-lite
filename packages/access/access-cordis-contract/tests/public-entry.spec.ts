import { expect, it } from 'vitest'

it('exports the change observation and nothing else at run time', async () => {
  const root = (await import('@omne-harness/access-cordis-contract')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(['createChangeObservation'])
})
