import { describe, expect, it } from 'vitest'
import {
  noArguments,
  referenceSystemActionAuthorization,
  SYSTEM_ACTION_MATRIX,
  type SystemActionRequest,
} from '@omne-harness/authorization'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import { issueTenantDomainScanner } from '../../src/entry/tenant-domain-scanner.ts'
import { principalIssuer, verifierOf } from '../../src/entry/principals.ts'
import {
  MAINTENANCE_GRANTS,
  TENANT_DOMAIN_SCANNER_COMPONENT,
  releaseMaintenanceGrants,
} from '../../src/rows/authorization/index.ts'
import { fixtureEnv, fixtureTenant } from './support.ts'

describe('tenant domain scanner', () => {
  it('issues the entry principal and grants exactly enumeration, rejecting forged copies and every other purpose', async () => {
    const fixture = fixtureEnv([principalIssuerKey])
    await fixture.install(principalIssuer)
    const principal = issueTenantDomainScanner(fixture.env)
    expect(principal).toEqual({ kind: 'system', component: 'tenant-domain-scanner' })
    expect(MAINTENANCE_GRANTS[TENANT_DOMAIN_SCANNER_COMPONENT].purposes).toEqual([
      'enumerate-tenants',
    ])
    const verifier = verifierOf(fixture.env)
    expect(await verifier.verify(principal)).toMatchObject({ kind: 'verified' })
    const access = referenceSystemActionAuthorization({
      verifier,
      grants: releaseMaintenanceGrants(),
      clock: null,
    })
    for (const row of SYSTEM_ACTION_MATRIX) {
      const request: SystemActionRequest = {
        principal,
        scope: 'system',
        operation: row.operation,
        target:
          row.target === 'system'
            ? { kind: 'system', resource: { ...row.resource, key: 'registered-tenants' } }
            : {
                kind: 'tenant',
                tenant: fixtureTenant('a'),
                resource: { ...row.resource, key: 'k' },
              },
        arguments: noArguments(),
      }
      expect((await access.check(request)).kind, row.purpose).toBe(
        row.purpose === 'enumerate-tenants' ? 'allowed' : 'denied',
      )
      expect((await access.check({ ...request, principal: { ...principal } })).kind).toBe('denied')
    }
  })
  it('fails before an issuer is installed', async () => {
    const fixture = fixtureEnv([principalIssuerKey])
    expect(() => issueTenantDomainScanner(fixture.env)).toThrow(/principalIssuer/u)
  })
})
