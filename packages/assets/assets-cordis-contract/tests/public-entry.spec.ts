import { expect, it } from 'vitest'

it('the root entry exports only the service key', async () => {
  const root = (await import('@omne-harness/assets-cordis-contract')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual(['assetCategoriesKey'])
  expect(root['assetCategoriesKey']).toBe('assetCategories')
})
