import { expect, it } from 'vitest'

it('the root entry exports the factory and the default scheduling policy, and nothing else at runtime', async () => {
  const root = (await import('@omne-harness/session')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(['createSessionInstance', 'defaultSchedulingPolicy'])
  expect(typeof root.createSessionInstance).toBe('function')
})
