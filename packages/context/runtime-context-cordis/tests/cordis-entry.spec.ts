import { expect, it } from 'vitest'

it('cordis entry exports only the plugin factory', async () => {
  const cordis = (await import('@omne-harness/runtime-context-cordis/cordis')) as Record<
    string,
    unknown
  >
  expect(Object.keys(cordis)).toEqual(['createRuntimeContextPlugin'])
})
