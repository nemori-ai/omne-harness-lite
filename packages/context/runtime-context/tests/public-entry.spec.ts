import { expect, it } from 'vitest'

it('the root entry exports the one mechanism factory and its configuration resolver', async () => {
  const root = (await import('@omne-harness/runtime-context')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(
    ['RUNTIME_CONTEXT_DEFAULTS', 'createRuntimeContext', 'resolveRuntimeContextConfig'].sort(),
  )
})
