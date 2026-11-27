import { expect, it } from 'vitest'

it('the root entry exports the contribution and the reports in memory; how a protocol a plugin writes is made is the access layer\'s', async () => {
  const root = (await import('@omne-harness/plugin-access')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'combineSources',
    'createPluginContribution',
    'createPluginReports',
  ])
})
