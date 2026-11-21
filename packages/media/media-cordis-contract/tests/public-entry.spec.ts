import { expect, it } from 'vitest'

it('the root entry carries no value: the services are in the cordis entry', async () => {
  const root = (await import('@omne-harness/media-cordis-contract')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual([])
})
