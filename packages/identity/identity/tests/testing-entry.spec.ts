import { expect, it } from 'vitest'

it('publishes the reference double, its controls and the contract suite in ./testing', async () => {
  const testing = (await import('@omne-harness/identity/testing')) as Record<string, unknown>
  expect(Object.keys(testing).sort()).toEqual(
    [
      'IDENTITY_CONTRACT_CASES',
      'adjustableLoginTerms',
      'checkIdentityOperationsContract',
      'inProcessIdentityOperations',
      'manualIdentityClock',
    ].sort(),
  )
})
