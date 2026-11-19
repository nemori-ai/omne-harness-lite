import { expect, it } from 'vitest'

it('exports the holder factory and the two pure functions of the reference', async () => {
  const root = (await import('@omne-harness/static-scope-holder')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'createStaticScopeHolder',
    'staticScopeOf',
    'staticScopeTenant',
  ])
})
