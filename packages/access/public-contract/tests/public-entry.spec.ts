import { expect, it } from 'vitest'

it('exports the protocol codecs, the identity text codecs, the common contract and access/v1', async () => {
  const root = await import('@omne-harness/public-contract')
  expect(Object.keys(root).sort()).toEqual([
    'OUTCOMES',
    'accessProtocol',
    'defineProtocol',
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
    'ruleCodec',
  ])
})
