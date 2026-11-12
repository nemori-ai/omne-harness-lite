import { expect, it } from 'vitest'

it('exports the registry service and its key', async () => {
  const cordis = (await import('@omne-harness/access-cordis-contract/cordis')) as Record<
    string,
    unknown
  >
  expect(Object.keys(cordis).sort()).toEqual(['AccessRegistryService', 'accessRegistryKey'])
  expect(cordis['accessRegistryKey']).toBe('accessRegistry')
})
