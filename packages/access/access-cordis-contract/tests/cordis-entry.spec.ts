import { expect, it } from 'vitest'

it('exports the registry service, its key and defineAccessPlugin', async () => {
  const cordis = (await import('@omne-harness/access-cordis-contract/cordis')) as Record<
    string,
    unknown
  >
  expect(Object.keys(cordis).sort()).toEqual([
    'AccessRegistryService',
    'accessRegistryKey',
    'defineAccessPlugin',
  ])
  expect(cordis['accessRegistryKey']).toBe('accessRegistry')
})
