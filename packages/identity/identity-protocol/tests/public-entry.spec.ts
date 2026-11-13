import { expect, it } from 'vitest'

it('the root entry exports the identity/v1 contract and nothing else', async () => {
  const root = (await import('@omne-harness/identity-protocol')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual(['identityProtocol'])
})
