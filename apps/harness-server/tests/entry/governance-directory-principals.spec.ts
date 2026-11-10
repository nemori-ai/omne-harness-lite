import { expect, it } from 'vitest'
import {
  governanceDirectoryPrincipals,
  governanceDirectoryPrincipalsKey,
} from '../../src/entry/governance-directory-principals.ts'
import { verifierOf } from '../../src/entry/principals.ts'
import { fixtureEnv, fixtureTenant } from './support.ts'

it('issues only the tenant directory role from the existing application authority', async () => {
  const fixture = fixtureEnv([governanceDirectoryPrincipalsKey])
  try {
    await fixture.install(governanceDirectoryPrincipals)
    const service = fixture
      .scopeOf(governanceDirectoryPrincipalsKey)
      .get(governanceDirectoryPrincipalsKey)
    const tenant = fixtureTenant('a')
    const principal = service?.forTenant(tenant)
    expect(principal).toMatchObject({
      kind: 'acting-for-tenant',
      actor: { component: 'governanceDirectoryPrincipals' },
      tenant,
      work: { owner: 'harness.governance', work: 'directory' },
    })
    expect(await verifierOf(fixture.env).verify(principal)).toMatchObject({ kind: 'verified' })
    expect(await verifierOf(fixture.env).verify(structuredClone(principal))).toEqual({
      kind: 'rejected',
    })
    expect(fixture.root.get(governanceDirectoryPrincipalsKey)).toBeUndefined()
    expect(service).not.toHaveProperty('issueSystem')
    expect(service).not.toHaveProperty('issueActingForTenant')
  } finally {
    await fixture.root.fiber.dispose()
  }
})
