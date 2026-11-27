import { expect, it } from 'vitest'

it('the cordis entry exports the interface module', async () => {
  const cordis = (await import('@omne-harness/interface-ui/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis).sort()).toEqual(['createInterfaceUiModule'])
})
