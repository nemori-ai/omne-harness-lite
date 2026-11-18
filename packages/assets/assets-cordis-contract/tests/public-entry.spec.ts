import { expect, it } from 'vitest'

it('the root entry exports only the service keys', async () => {
  const root = (await import('@omne-harness/assets-cordis-contract')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(['assetCategoriesKey', 'assetPublishingKey'])
  expect(root['assetCategoriesKey']).toBe('assetCategories')
  expect(root['assetPublishingKey']).toBe('assetPublishing')
})
