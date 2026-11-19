import { expect, it } from 'vitest'

it('the root entry exports only the service keys', async () => {
  const root = (await import('@omne-harness/assets-cordis-contract')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'assetCategoriesKey',
    'assetChangesKey',
    'assetManagementKey',
    'assetPublishingKey',
    'independentSettingsKey',
  ])
  expect(root['assetCategoriesKey']).toBe('assetCategories')
  expect(root['assetChangesKey']).toBe('assetChanges')
  expect(root['assetManagementKey']).toBe('assetManagement')
  expect(root['assetPublishingKey']).toBe('assetPublishing')
  expect(root['independentSettingsKey']).toBe('independentSettings')
})
