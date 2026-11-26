import { expect, it } from 'vitest'

it('the root entry exports only the goal/v1 contract', async () => {
  const root = (await import('@omne-harness/goal-protocol')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual(['goalProtocol'])
})
