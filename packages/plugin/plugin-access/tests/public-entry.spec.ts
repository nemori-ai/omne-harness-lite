import { expect, it } from 'vitest'

it('the root entry exports the contribution and the reports in memory', async () => {
  const root = (await import('@omne-harness/plugin-access')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'combineSources',
    'createPluginContribution',
    'createPluginReports',
  ])
})
