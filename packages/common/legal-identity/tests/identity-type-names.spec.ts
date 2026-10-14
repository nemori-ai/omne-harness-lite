import { expect, it } from 'vitest'
import { IDENTITY_TYPE_NAMES } from '@omne-harness/legal-identity'

it('publishes the identity type names and keeps login identifiers out of that list', () => {
  expect([...IDENTITY_TYPE_NAMES]).toEqual([
    'AccountId',
    'OrganizationId',
    'LoginStateId',
    'TenantId',
    'ScopeLayerIdentity',
  ])
  expect(IDENTITY_TYPE_NAMES).not.toContain('LoginIdentifier')
})
