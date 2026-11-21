import { expect, it } from 'vitest'

it('the root entry exports only the usage/v1 contract', async () => {
  const root = (await import('@omne-harness/usage-protocol')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual(['usageProtocol'])
})
