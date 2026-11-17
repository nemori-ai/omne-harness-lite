import { expect, it } from 'vitest'

it('the public entry exports the assets page, the settings note and the governance model only', async () => {
  const root = (await import('@omne-harness/assets-ui')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(['AssetsPage', 'SettingsNote', 'createGovernance'])
})
