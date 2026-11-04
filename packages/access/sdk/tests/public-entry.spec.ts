import { expect, it } from 'vitest'

it('exports exactly the client entries, and no protocol codec of the contract', async () => {
  const root = (await import('@omne-harness/sdk')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'RequestInvalidError',
    'createGovernanceClient',
    'createHttpTransport',
    'createSessionClient',
    'encodeAccountIdText',
    'encodeLoginStateIdText',
    'encodeOrganizationIdText',
    'parseTenantText',
    'readAccountIdText',
    'readLoginStateIdText',
    'readOrganizationIdText',
    'tenantText',
    'userTextMessage',
  ])
})
