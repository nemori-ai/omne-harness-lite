import { expect, it } from 'vitest'

it('exports the protocol codecs and the identity text codecs', async () => {
  const root = await import('@omne-harness/public-contract')
  expect(Object.keys(root).sort()).toEqual([
    'encodeAccountIdText',
    'encodeGovernanceRequest',
    'encodeGovernanceResponse',
    'encodeHitlRequest',
    'encodeHitlResponse',
    'encodeLoginStateIdText',
    'encodeOrganizationIdText',
    'encodeSessionRequest',
    'encodeSessionResponse',
    'encodeTenantText',
    'readAccountIdText',
    'readGovernanceRequest',
    'readGovernanceResponse',
    'readHitlRequest',
    'readHitlResponse',
    'readLoginStateIdText',
    'readOrganizationIdText',
    'readSessionRequest',
    'readSessionResponse',
    'readTenantText',
  ])
})
