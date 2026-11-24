import { expect, it } from 'vitest'

it('the cordis entry exports the module of the loader, named after the member', async () => {
  const cordis = await import('@omne-harness/plugin-ui/cordis')
  expect(Object.keys(cordis)).toEqual(['createPluginUiModule'])
  expect(cordis.createPluginUiModule().name).toBe('plugin-ui')
})
