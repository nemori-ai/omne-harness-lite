import { expect, it } from 'vitest'

it('the root entry exports the views, the publisher of the block, the builtin registry, the implementations and the command host', async () => {
  const root: Record<string, unknown> = await import('@omne-harness/loop-extension-host-local')
  expect(Object.keys(root).sort()).toEqual([
    'createBuiltinExtensions',
    'createCommandHost',
    'createEnabledExtensionsPublisher',
    'createEnabledExtensionsViews',
    'createExtensionImplementations',
  ])
})

it('the cordis entry exports the plugin alone', async () => {
  const cordis: Record<string, unknown> =
    await import('@omne-harness/loop-extension-host-local/cordis')
  expect(Object.keys(cordis)).toEqual(['loopExtensionPlugin'])
})
