import { expect, it } from 'vitest'

it('the root entry exports the two categories, each with its contract and its point, the loading on the server and its two points', async () => {
  const root = (await import('@omne-harness/plugin-host-local')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'GUEST_FORMS_POINT',
    'PLUGIN_CATEGORY',
    'PLUGIN_PACKAGE_LIMITS',
    'PORTS_POINT',
    'SKIN_CATEGORY',
    'createKeptContents',
    'createServerSide',
    'guestFormsContract',
    'heldPlugins',
    'listedPlugins',
    'pluginBodyContract',
    'pluginCategoryDisplay',
    'pluginEffect',
    'pluginImpact',
    'pluginPlacement',
    'pluginPluginsPoint',
    'portsContract',
    'readHeldPart',
    'serverInstall',
    'skinBodyContract',
    'skinCategoryDisplay',
    'skinSkinsPoint',
  ])
})
