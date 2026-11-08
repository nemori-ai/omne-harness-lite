import { expect, it } from 'vitest'
import {
  governanceInstallationPrincipals,
  governanceInstallationPrincipalsKey,
} from '../../src/entry/governance-installation-principals.ts'
import { verifierOf } from '../../src/entry/principals.ts'
import { fixtureEnv, fixtureTenant } from './support.ts'

it('issues only the tenant installation role from the existing application authority', async () => {
  const fixture = fixtureEnv([governanceInstallationPrincipalsKey])
  try {
    await fixture.install(governanceInstallationPrincipals)
    const service = fixture
      .scopeOf(governanceInstallationPrincipalsKey)
      .get(governanceInstallationPrincipalsKey)
    const tenant = fixtureTenant('a')
    const principal = service?.forTenant(tenant)
    expect(principal).toMatchObject({
      kind: 'acting-for-tenant',
      actor: { component: 'governanceInstallationPrincipals' },
      tenant,
      work: { owner: 'harness.governance', work: 'installation' },
    })
    expect(await verifierOf(fixture.env).verify(principal)).toMatchObject({ kind: 'verified' })
    expect(await verifierOf(fixture.env).verify(structuredClone(principal))).toEqual({
      kind: 'rejected',
    })
    expect(fixture.root.get(governanceInstallationPrincipalsKey)).toBeUndefined()
    expect(service).not.toHaveProperty('issueSystem')
    expect(service).not.toHaveProperty('issueActingForTenant')
    await fixture.root.fiber.dispose()
    expect(service?.forTenant(tenant)).toBeUndefined()
  } finally {
    await fixture.root.fiber.dispose()
  }
})
