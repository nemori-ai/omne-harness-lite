import { expect, it } from 'vitest'

it('publishes the reference doubles, their controls and the two contract suites in ./testing', async () => {
  const testing = (await import('@omne-harness/identity/testing')) as Record<string, unknown>
  expect(Object.keys(testing).sort()).toEqual(
    [
      'IDENTITY_CONTRACT_CASES',
      'IDENTITY_GOVERNANCE_CONTRACT_CASES',
      'adjustableInvitationTerms',
      'adjustableLoginTerms',
      'checkIdentityGovernanceContract',
      'checkIdentityOperationsContract',
      'inProcessIdentity',
      'inProcessIdentityOperations',
      'manualIdentityClock',
      'recordStoreFaults',
    ].sort(),
  )
})
