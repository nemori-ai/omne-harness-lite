import { expect, it } from 'vitest'

it('the root entry exports only the plugin/v1 contract', async () => {
  const root = (await import('@omne-harness/plugin-protocol')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual(['pluginProtocol'])
})
