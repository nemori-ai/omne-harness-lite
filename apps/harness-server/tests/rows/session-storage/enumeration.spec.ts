import {
  noArguments,
  referenceSystemActionAuthorization,
  type MaintenanceGrantSource,
} from '@omne-harness/authorization'
import { inProcessPrincipalAuthority, type PrincipalVerifier } from '@omne-harness/identity'
import type { TenantDomainAccess } from '@omne-harness/sql-contract'
import { expect, test, vi } from 'vitest'
import { createTenantEnumeration } from '../../../src/rows/session-storage/enumeration.ts'

const authority = inProcessPrincipalAuthority()
const issued = authority.issuer.issueSystem({ component: 'test-scanner' })
if (!('ok' in issued)) throw new Error('test principal issuance failed')
const principal = issued.ok
// Explicit test grant. This is not the release grant table or a release assembly test.
const grants: MaintenanceGrantSource = {
  read: async () => ({
    kind: 'found',
    grant: {
      source: 'test',
      record: 'enumerator',
      revision: '1',
      purposes: ['enumerate-tenants'],
      generation: '1',
      revoked: false,
    },
  }),
}
function fixture(
  verifier: PrincipalVerifier = authority.verifier,
  source: MaintenanceGrantSource | null = grants,
) {
  const snapshot = vi.fn<TenantDomainAccess['snapshot']>(async () => ({
    kind: 'ready',
    value: {
      revision: '2',
      entries: [
        {
          tenant: 'tenant-a',
          domain: { scope: { kind: 'tenant', tenant: 'tenant-a' }, transactionDomain: 'domain-a' },
        },
        {
          tenant: 'tenant-b',
          domain: { scope: { kind: 'tenant', tenant: 'tenant-b' }, transactionDomain: 'domain-b' },
        },
      ],
    },
  }))
  const authorization = referenceSystemActionAuthorization({
    verifier,
    grants: source,
    clock: null,
  })
  const check = vi.fn(authorization.check)
  return { snapshot, check, domains: createTenantEnumeration({ check }, { snapshot }) }
}

test('an issued principal with the enumeration grant gets exactly one complete snapshot', async () => {
  const { domains, snapshot, check } = fixture()
  expect(await domains.enumerate({ principal })).toEqual({
    kind: 'ready',
    revision: '2',
    entries: [
      {
        tenant: 'tenant-a',
        domain: { scope: { kind: 'tenant', tenant: 'tenant-a' }, transactionDomain: 'domain-a' },
      },
      {
        tenant: 'tenant-b',
        domain: { scope: { kind: 'tenant', tenant: 'tenant-b' }, transactionDomain: 'domain-b' },
      },
    ],
  })
  expect(snapshot).toHaveBeenCalledTimes(1)
  expect(check).toHaveBeenCalledWith({
    principal,
    scope: 'system',
    operation: { owner: 'tenant-domains', name: 'enumerate' },
    target: {
      kind: 'system',
      resource: { owner: 'tenant-domains', kind: 'registered-tenants', key: 'deployment' },
    },
    arguments: noArguments(),
  })
})

test('unissued and ungranted principals cannot read the directory', async () => {
  const { domains, snapshot } = fixture()
  expect(await domains.enumerate({ principal: { ...principal } })).toEqual({ kind: 'denied' })
  expect(await domains.enumerate({ principal: 'test-scanner' })).toEqual({ kind: 'denied' })
  const ungranted = fixture(authority.verifier, { read: async () => ({ kind: 'none' }) })
  expect(await ungranted.domains.enumerate({ principal })).toEqual({ kind: 'denied' })
  expect(snapshot).not.toHaveBeenCalled()
  expect(ungranted.snapshot).not.toHaveBeenCalled()
})

test('missing or throwing dependencies stay unavailable and do not disclose exception text', async () => {
  const missing = fixture(authority.verifier, null)
  const throwing = fixture({
    verify: async () => {
      throw new Error('secret exception')
    },
  })
  for (const item of [missing, throwing]) {
    const result = await item.domains.enumerate({ principal })
    expect(result).toMatchObject({ kind: 'unavailable' })
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(item.snapshot).not.toHaveBeenCalled()
  }
  const failed = fixture()
  failed.snapshot.mockRejectedValueOnce(new Error('secret snapshot'))
  expect(await failed.domains.enumerate({ principal })).toEqual({
    kind: 'unavailable',
    diagnostic: 'tenant domain enumeration failed; exception details are not reported',
  })
  failed.snapshot.mockResolvedValueOnce({
    kind: 'unavailable',
    diagnostic: 'directory unavailable',
  })
  expect(await failed.domains.enumerate({ principal })).toEqual({
    kind: 'unavailable',
    diagnostic: 'directory unavailable',
  })
})
