import { expect, it } from 'vitest'

it('exports the registry service, the in-process calls service, their keys and defineAccessPlugin', async () => {
  const cordis = (await import('@omne-harness/access-cordis-contract/cordis')) as Record<
    string,
    unknown
  >
  expect(Object.keys(cordis).sort()).toEqual([
    'AccessCallsService',
    'AccessRegistryService',
    'accessCallsKey',
    'accessRegistryKey',
    'defineAccessPlugin',
  ])
  expect(cordis['accessRegistryKey']).toBe('accessRegistry')
  expect(cordis['accessCallsKey']).toBe('accessCalls')
})
