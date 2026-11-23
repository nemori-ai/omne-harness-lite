import { expect, it } from 'vitest'

it('the root entry exports the category, its contract and its point', async () => {
  const root = (await import('@omne-harness/plugin-host-local')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'PLUGIN_CATEGORY',
    'PLUGIN_PACKAGE_LIMITS',
    'pluginBodyContract',
    'pluginCategoryDisplay',
    'pluginPluginsPoint',
  ])
})
