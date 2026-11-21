import { expect, it } from 'vitest'

it('the root entry exports nothing: the services are on the cordis entry', async () => {
  const root = (await import('@omne-harness/workspace-cordis-contract')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual([])
})
