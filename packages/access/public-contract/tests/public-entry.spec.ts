import { expect, it } from 'vitest'

it('exports the identity text codecs, the common contract, the user message and access/v1', async () => {
  const root = await import('@omne-harness/public-contract')
  expect(Object.keys(root).sort()).toEqual([
    'OUTCOMES',
    'accessProtocol',
    'defineProtocol',
    'encodeAccountIdText',
    'encodeLoginStateIdText',
    'encodeOrganizationIdText',
    'encodeTenantText',
    'guestContract',
    'guestContractData',
    'guestContractOfTree',
    'livesAt',
    'projectRule',
    'readAccountIdText',
    'readLoginStateIdText',
    'readOrganizationIdText',
    'readTenantText',
    'revisionOf',
    'ruleCodec',
  ])
})
