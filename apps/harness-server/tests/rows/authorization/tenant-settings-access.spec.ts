import { describe, expect, it } from 'vitest'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import { inProcessPrincipalAuthority } from '@omne-harness/identity'
import type { TenantId } from '@omne-harness/legal-identity'
import { createTenantSettingsFace } from '../../../src/rows/governance/tenant-settings-service.ts'
import { fixtureTenant, okOf } from '../../entry/support.ts'

const A = fixtureTenant('a')
const B = fixtureTenant('b')
const authority = inProcessPrincipalAuthority()
const system = okOf(authority.issuer.issueSystem({ component: 'server-entry' }), 'system')
function acting(tenant: TenantId, owner: string, work: string): ActingForTenantPrincipal {
  return okOf(
    authority.issuer.issueActingForTenant({ actor: system, tenant, work: { owner, work } }),
    'acting',
  )
}
const login = acting(A, 'identity-login', 'lgn_a')
const work = acting(A, 'session', 'ses_a')

function world() {
  const reads: string[] = []
  const face = createTenantSettingsFace({
    host: {
      async settings(tenantRef) {
        reads.push(`host.settings ${tenantRef}`)
        return undefined
      },
    },
    scope: { deploymentId: 'deployment', logicalServiceId: 'service' },
    storage: {
      read: async () => {
        reads.push('storage.read')
        throw new Error('no storage in this world')
      },
    },
    release: () => {
      reads.push('release')
      return undefined
    },
    identity: {
      verifier: authority.verifier,
      standing: {
        read: async () => ({
          kind: 'member',
          role: { role: 'member', model: { model: 'm', revision: '1' } },
          qualifications: [],
          evidence: { record: 'standing/test', revision: '1' },
        }),
      },
    },
    active: () => true,
  })
  return { face, reads }
}

const item = (principal: unknown, tenant: TenantId = A) => ({
  principal,
  tenant,
  asset: { name: 'Shell' },
  item: 'invoke',
})
const write = (principal: unknown, tenant: TenantId = A) => ({
  ...item(principal, tenant),
  operation: 'op',
  expectedRevision: '0',
})

describe('tenantSettings admission', () => {
  it.each([
    ['a session work principal of the tenant', work, A],
    ['a system principal', system, A],
    ['the login principal of the tenant for another tenant', login, B],
    ['a hand-built copy of the login principal', { ...login }, A],
  ] as const)('denies %s on every method and reads nothing', async (_name, principal, tenant) => {
    const w = world()
    expect(await w.face.describe(item(principal, tenant))).toEqual({ kind: 'denied' })
    expect(await w.face.list({ principal, tenant, after: null, limit: 10 })).toEqual({
      kind: 'denied',
    })
    expect(
      await w.face.set({
        ...write(principal, tenant),
        value: { kind: 'permission', pick: 'auto' },
      }),
    ).toEqual({ kind: 'denied' })
    expect(await w.face.clear(write(principal, tenant))).toEqual({ kind: 'denied' })
    expect(w.reads).toEqual([])
  })

  it('admits the login principal of the tenant, which then reads the runtime of its own tenant only', async () => {
    const w = world()
    expect(await w.face.describe(item(login))).toEqual({ kind: 'unavailable' })
    expect(w.reads).toHaveLength(1)
    expect(w.reads[0]).toMatch(/^host\.settings /)
  })
})
