import { expect, it, vi } from 'vitest'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import { inProcessPrincipalAuthority } from '@omne-harness/identity'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { TenantGovernanceHost } from '../../../src/rows/governance/tenant-host.ts'
import { createTenantSettingsFace } from '../../../src/rows/governance/tenant-settings-service.ts'
import { fixtureTenant, okOf } from '../../entry/support.ts'

type HostOptions = ConstructorParameters<typeof TenantGovernanceHost>[0]
type Assembly = ReturnType<HostOptions['prepare']>

const A = fixtureTenant('a')
const authority = inProcessPrincipalAuthority()
const system = okOf(authority.issuer.issueSystem({ component: 'server-entry' }), 'system')
const acting = (tenant: TenantId, owner: string, work: string): ActingForTenantPrincipal =>
  okOf(
    authority.issuer.issueActingForTenant({ actor: system, tenant, work: { owner, work } }),
    'acting',
  )
const login = acting(A, 'identity-login', 'lgn_a')
const work = acting(A, 'session', 'ses_a')
const encoded = tenantCodec.encode(A)
if (!encoded.ok) throw new Error('fixture: tenant text')
const TENANT = encoded.value

function world() {
  let registered = false
  const ensure = vi.fn(async () => {
    registered = true
    return { kind: 'ready' as const }
  })
  const read = vi.fn(async () => ({ kind: 'unavailable' as const }))
  const host = new TenantGovernanceHost({
    domains: {
      lookup: async () =>
        registered
          ? {
              kind: 'ready',
              domain: { scope: { kind: 'tenant', tenant: TENANT }, transactionDomain: 't' },
            }
          : { kind: 'unregistered' },
    },
    registration: () => ({ ensure }),
    prepare: () =>
      ({
        destination: {},
        settings: { read, writer: { write: vi.fn() } },
        open: async () => ({ kind: 'created', close: async () => ({ kind: 'closed' }) }),
      }) as unknown as Assembly,
  })
  const face = createTenantSettingsFace({
    host,
    scope: { deploymentId: 'deployment', logicalServiceId: 'service' },
    storage: { read: async () => ({ kind: 'unavailable' }) as never },
    release: () => undefined,
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
  return { face, ensure, read }
}

const listing = (principal: unknown) => ({
  principal,
  tenant: A,
  scope: { kind: 'asset' } as const,
  after: null,
  limit: 10,
})

it('registers the domain of a tenant that has no Session yet once the login of the tenant is admitted', async () => {
  const w = world()
  await w.face.list(listing(login))
  expect(w.ensure).toHaveBeenCalledWith({ tenant: TENANT })
  expect(w.read).toHaveBeenCalled()
})

it.each([
  ['a session work principal of the tenant', work],
  ['a system principal', system],
  ['a hand-built copy of the login principal', { ...login }],
] as const)('does not register the domain for %s', async (_name, principal) => {
  const w = world()
  expect(await w.face.list(listing(principal))).toEqual({ kind: 'denied' })
  expect(w.ensure).not.toHaveBeenCalled()
  expect(w.read).not.toHaveBeenCalled()
})
