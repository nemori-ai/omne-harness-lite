import { expect, it } from 'vitest'

it('root entry exports the pure functions that have landed', async () => {
  const root = (await import('@omne-harness/session-adapters')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(['createSessionRuntimeContextTrust'])
  expect(typeof root['createSessionRuntimeContextTrust']).toBe('function')
})
