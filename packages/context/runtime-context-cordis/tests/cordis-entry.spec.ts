import { expect, it } from 'vitest'
import { RuntimeContextService } from '@omne-harness/runtime-context-cordis-contract/cordis'

it('the cordis entry exports the concrete provider and the plugin factory', async () => {
  const cordis = (await import('@omne-harness/runtime-context-cordis/cordis')) as Record<
    string,
    unknown
  >
  expect(Object.keys(cordis).sort()).toEqual([
    'RuntimeContextProvider',
    'createRuntimeContextPlugin',
  ])
  const { RuntimeContextProvider, createRuntimeContextPlugin } =
    await import('@omne-harness/runtime-context-cordis/cordis')
  expect(RuntimeContextProvider.prototype).toBeInstanceOf(RuntimeContextService)
  expect(createRuntimeContextPlugin()).toBe(RuntimeContextProvider)
})
