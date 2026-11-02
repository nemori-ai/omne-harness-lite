import { expect, it } from 'vitest'

it('exports exactly the client entries, and no codec or identity entry of the contract', async () => {
  const root = (await import('@omne-harness/sdk')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'RequestInvalidError',
    'createGovernanceClient',
    'createHttpTransport',
    'createSessionClient',
    'parseTenantText',
    'tenantText',
    'userTextMessage',
  ])
})
