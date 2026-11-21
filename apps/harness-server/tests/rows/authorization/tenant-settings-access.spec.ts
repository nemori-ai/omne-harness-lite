import { describe, expect, it } from 'vitest'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import { inProcessPrincipalAuthority } from '@omne-harness/identity'
import type { TenantId } from '@omne-harness/legal-identity'
import { createTenantSettingsFace } from '../../../src/rows/governance/tenant-settings-service.ts'
import type { DecisionCards } from '@omne-harness/agent-contract'
import { fail, succeed } from '@omne-harness/operation-result'
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

type Reply = Awaited<ReturnType<DecisionCards<unknown>['read']>>
const said = { owner: 'human-intervention', record: 'reply/1', revision: '1', digest: 'said' }
const card = { owner: 'human-intervention', record: 'card/1', revision: '1', digest: 'card' }
const chosen = (option: string, evidence = said): Reply =>
  succeed({ kind: 'chosen', option, value: null, evidence })

function world(reply?: Reply | 'absent') {
  const reads: string[] = []
  const face = createTenantSettingsFace({
    ...(reply === undefined
      ? {}
      : {
          cards: () =>
            reply === 'absent'
              ? undefined
              : ({ read: async () => reply } as unknown as DecisionCards<unknown>),
        }),
    host: {
      async settings(tenantRef) {
        reads.push(`host.settings ${tenantRef}`)
        return undefined
      },
      async assets(tenantRef) {
        reads.push(`host.assets ${tenantRef}`)
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
  owner: { kind: 'asset', name: 'Shell' } as const,
  item: 'run',
})
const write = (principal: unknown, tenant: TenantId = A) => ({
  ...item(principal, tenant),
  operation: 'op',
  expectedRevision: '0',
})

describe('tenantSettings admission', () => {
  it.each([
    ['a system principal', system, A],
    ['a session work principal of another tenant', acting(B, 'session', 'ses_b'), A],
    ['the login principal of the tenant for another tenant', login, B],
    ['a hand-built copy of the login principal', { ...login }, A],
  ] as const)('denies %s on every method and reads nothing', async (_name, principal, tenant) => {
    const w = world()
    expect(await w.face.describe(item(principal, tenant))).toEqual({ kind: 'denied' })
    expect(
      await w.face.list({ principal, tenant, scope: { kind: 'asset' }, after: null, limit: 10 }),
    ).toEqual({
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

  const standing = (option = 'allow-always', principal: unknown = work) => ({
    kind: 'card-answer' as const,
    principal,
    card,
    source: said,
    option,
  })
  const setAuto = (principal: unknown) =>
    world(chosen('allow-always')).face.set({
      ...write(principal),
      value: { kind: 'permission', pick: 'auto' },
    })

  it('lets the work of a session read one item, and nothing else without a card answer', async () => {
    const w = world(chosen('allow-always'))
    expect(await w.face.describe(item(work))).toEqual({ kind: 'unavailable' })
    expect(w.reads).toHaveLength(1)
    expect(
      await w.face.list({
        principal: work,
        tenant: A,
        scope: { kind: 'asset' },
        after: null,
        limit: 10,
      }),
    ).toEqual({ kind: 'denied' })
    expect(await setAuto(work)).toEqual({ kind: 'denied' })
    expect(await w.face.clear(write(work))).toEqual({ kind: 'denied' })
    expect(await w.face.clear(write(standing()))).toEqual({ kind: 'denied' })
    expect(await w.face.describe(item(standing()))).toEqual({ kind: 'denied' })
    expect(w.reads).toHaveLength(1)
  })

  it('lets the work of a session set an item on the answer the card holds, read back from the card', async () => {
    expect(await setAuto(standing())).toEqual({ kind: 'unavailable' })
    const set = (reply: Reply | 'absent' | undefined, claimed = standing()) =>
      world(reply).face.set({ ...write(claimed), value: { kind: 'permission', pick: 'auto' } })
    expect(await set(chosen('allow-once'))).toEqual({ kind: 'denied' })
    expect(await set(chosen('allow-always', { ...said, digest: 'another' }))).toEqual({
      kind: 'denied',
    })
    expect(await set(succeed({ kind: 'pending' }))).toEqual({ kind: 'denied' })
    expect(await set(fail({ kind: 'unavailable' }) as Reply)).toEqual({ kind: 'unavailable' })
    expect(await set('absent')).toEqual({ kind: 'unavailable' })
    expect(await set(undefined)).toEqual({ kind: 'denied' })
    expect(await world().face.describe(item(work))).toEqual({ kind: 'denied' })
    expect(await set(chosen('allow-always'), standing('allow-always', login))).toEqual({
      kind: 'denied',
    })
  })
})
