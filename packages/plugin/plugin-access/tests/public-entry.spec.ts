import { expect, it } from 'vitest'

it('the root entry exports the contribution, the reports in memory, and the protocol a plugin writes turned into a contribution', async () => {
  const root = (await import('@omne-harness/plugin-access')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'combineSources',
    'createPluginContribution',
    'createPluginReports',
    'guestProtocol',
  ])
})
