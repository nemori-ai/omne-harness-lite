import { expect, it } from 'vitest'

it('the public entry exports the constructor and nothing that the SPEC keeps internal', async () => {
  const root = (await import('@omne-harness/server-entry')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'ServerEntryConfigError',
    'createAccessRegistry',
    'createServerEntry',
    'settleCall',
    'systemClock',
  ])
  expect(typeof root.createServerEntry).toBe('function')
})

it('the Cordis entry adds the registry provider to the definition name mapping', async () => {
  const cordis = (await import('@omne-harness/server-entry/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis)).toContain('AccessRegistryProvider')
})
