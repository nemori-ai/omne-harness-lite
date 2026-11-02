import { expect, it } from 'vitest'

it('the public entry exports the constructor and nothing that the SPEC keeps internal', async () => {
  const root = (await import('@omne-harness/server-entry')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(['ServerEntryConfigError', 'createServerEntry'])
  expect(typeof root.createServerEntry).toBe('function')
})
