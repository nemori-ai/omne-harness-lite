import { expect, it } from 'vitest'

it('the public entry exports the settings panel only', async () => {
  const root = (await import('@omne-harness/assets-ui')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual(['SettingsPanel'])
})
