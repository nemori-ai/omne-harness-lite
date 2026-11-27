import { expect, it } from 'vitest'

it('the cordis entry exports the plugin and the name of the inspections it provides', async () => {
  const cordis = (await import('@omne-harness/interface-access/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis).sort()).toEqual([
    'INTERFACE_INSPECTIONS',
    'createInterfaceAccessPlugin',
  ])
})
