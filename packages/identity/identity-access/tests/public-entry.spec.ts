import { expect, it } from 'vitest'

it('the root entry exports the identity port and the identity/v1 handlers', async () => {
  const root = (await import('@omne-harness/identity-access')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'ENTRY_COMPONENT',
    'createAccessIdentity',
    'createIdentityOperations',
  ])
})
