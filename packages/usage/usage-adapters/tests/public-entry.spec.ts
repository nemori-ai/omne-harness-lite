import { expect, it } from 'vitest'

it('exports the pure mappings, the two sources and the session scope, nothing of Cordis', async () => {
  const root = (await import('@omne-harness/usage-adapters')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'modelUsageFact',
    'modelUsageSource',
    'msBetween',
    'msOfDuration',
    'sessionUsageScope',
    'toolUsageFact',
    'toolUsageSource',
  ])
})
