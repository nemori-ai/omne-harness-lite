import { expect, it } from 'vitest'

it('exports the three usage services and their keys', async () => {
  const cordis = (await import('@omne-harness/usage-cordis-contract/cordis')) as Record<
    string,
    unknown
  >
  expect(Object.keys(cordis).sort()).toEqual([
    'UsageService',
    'UsageSessionScopeService',
    'UsageSourcesService',
    'usageKey',
    'usageSessionScopeKey',
    'usageSourcesKey',
  ])
  expect([cordis['usageKey'], cordis['usageSourcesKey'], cordis['usageSessionScopeKey']]).toEqual([
    'usage',
    'usageSources',
    'usageSessionScope',
  ])
})
