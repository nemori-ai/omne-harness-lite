import { describe, expect, it } from 'vitest'
import { tenantCodec, type TenantId as LegalTenantId } from '@omne-harness/legal-identity'
import { tenantIdSchema, type StandingRead } from '@omne-harness/notification-contract'
import type { StaticBlock, StaticRegistration } from '@omne-harness/runtime-context-contract'
import { createTestAuthorityPorts } from '@omne-harness/runtime-context-contract/testing'
import { createRuntimeContext } from '@omne-harness/runtime-context'
import { createStaticScopeHolder, staticScopeTenant } from '@omne-harness/static-scope-holder'
import { TENANT_SCOPE_KIND } from '@omne-harness/static-scope-holder/cordis'
import { withTenantScopeBindings } from '../../../src/entry/runtime-context-trust.ts'
import {
  DELIVERY_BLOCKED_KEY,
  createStandingItemsReader,
  standingContribution,
  standingItemsBinding,
} from '../../../src/rows/notification/standing.ts'

function legal(account: string): LegalTenantId {
  const parsed = tenantCodec.parse(
    JSON.stringify({
      organization: 'org_00000000000000000000000000',
      account: `acc_${account.padStart(26, '0')}`,
    }),
  )
  if (!parsed.ok) throw new Error('fixture: tenant')
  return parsed.value
}
const textOf = (tenant: LegalTenantId) => {
  const text = tenantCodec.encode(tenant)
  if (!text.ok) throw new Error('fixture: tenant text')
  return tenantIdSchema.parse(text.value)
}
const A = legal('1')
const B = legal('2')

const item = (id: string) => ({
  id,
  source: 'notification.system',
  type: 'delivery-blocked',
  subject: id,
  title: `blocked ${id}`,
  locator: null,
  since: '2026-11-18T00:00:00.000Z',
})

function world() {
  const blocked = new Map<string, StandingRead>([
    [textOf(A), { kind: 'ok', items: [item('a')] as never }],
  ])
  const own = standingContribution(async tenant => blocked.get(tenant) ?? { kind: 'ok', items: [] })
  const content: { current: StaticRegistration } = {
    current: { blocks: [...(own.blocks ?? [])], needs: [...(own.needs ?? [])] },
  }
  const ports = createTestAuthorityPorts<unknown>()
  const rc = createRuntimeContext<unknown>({
    trust: {
      authority: ports.authority,
      bindings: withTenantScopeBindings({ lookup: async () => ({ kind: 'unbound' }) }),
    },
    config: {},
  })
  const holder = createStaticScopeHolder<unknown>({
    kind: TENANT_SCOPE_KIND,
    runtime: rc,
    registration: () => content.current,
  })
  const there = { scope: true, principal: 'notification' as unknown }
  const standing = createStandingItemsReader<unknown>({
    scope: () => (there.scope ? holder : undefined),
    principal: async () => there.principal,
  })
  return { blocked, own, content, ports, standing, there, holder }
}

const other = (supply: StaticBlock['supply']): StaticBlock => ({
  declaration: {
    ...(world().own.blocks?.[0]?.declaration as StaticBlock['declaration']),
    key: 'probe.open-items',
  },
  supply,
})

describe('Notification reads standing items through the tenant-level scope (C14)', () => {
  it('reads the blocked destinations it published itself, for the tenant it asks for', async () => {
    const w = world()
    expect(await w.standing.read(textOf(A))).toEqual({ kind: 'ok', items: [item('a')] })
    expect(await w.standing.read(textOf(B))).toEqual({ kind: 'ok', items: [] })
    w.blocked.set(textOf(A), { kind: 'ok', items: [] })
    expect(await w.standing.read(textOf(A))).toEqual({ kind: 'ok', items: [] })
  })

  it('binds the scope of a tenant to that tenant, by the reference alone', async () => {
    const w = world()
    const scope = w.holder.scopeOf(A)
    expect(staticScopeTenant(TENANT_SCOPE_KIND, scope)).toEqual(A)
    const bindings = withTenantScopeBindings({ lookup: async () => ({ kind: 'unavailable' }) })
    expect(await bindings.lookup(scope)).toEqual({ kind: 'bound', tenant: A })
    expect(await bindings.lookup({ ...scope, ref: 'session-scope:x' as typeof scope.ref })).toEqual(
      {
        kind: 'unavailable',
      },
    )
  })

  it('reads missing, never no items, when its producer is not there', async () => {
    const w = world()
    w.content.current = { blocks: [], needs: [] }
    expect(await w.standing.read(textOf(A))).toEqual({ kind: 'missing' })
    w.content.current = { blocks: [], needs: [...(w.own.needs ?? [])] }
    expect(await w.standing.read(textOf(A))).toEqual({ kind: 'missing' })
  })

  it.each([
    ['cannot say', { kind: 'unknown' }, { kind: 'unknown' }],
    ['is refused its own store', { kind: 'refused' }, { kind: 'missing' }],
    ['finds its store missing', { kind: 'missing' }, { kind: 'missing' }],
  ] as const)('is not ok when the producer %s', async (_label, published, read) => {
    const w = world()
    w.blocked.set(textOf(A), published)
    expect(await w.standing.read(textOf(A))).toEqual(read)
  })

  it('reads the items of every block the assembly bound to the need, and none of them when one cannot be read', async () => {
    const w = world()
    let answer: Awaited<ReturnType<StaticBlock['supply']>> = { kind: 'value', value: [item('p')] }
    const probe = other(async () => answer)
    w.content.current = {
      blocks: [...(w.own.blocks ?? []), probe],
      needs: [...(w.own.needs ?? []), standingItemsBinding('probe.open-items')],
    }
    expect(await w.standing.read(textOf(A))).toEqual({
      kind: 'ok',
      items: [item('a'), item('p')],
    })
    answer = { kind: 'unavailable' }
    expect(await w.standing.read(textOf(A))).toEqual({ kind: 'missing' })
    answer = { kind: 'value', value: 'not a list' }
    expect(await w.standing.read(textOf(A))).not.toMatchObject({ kind: 'ok' })
  })

  it.each([
    [
      'the holder of the tenant-level scope is not there',
      (w: ReturnType<typeof world>) => {
        w.there.scope = false
      },
      'unknown',
    ],
    [
      'Notification cannot act for the tenant',
      (w: ReturnType<typeof world>) => {
        w.there.principal = null
      },
      'unknown',
    ],
    [
      'the authority refuses the reader',
      (w: ReturnType<typeof world>) =>
        w.ports.script(call => (call.face === 'reader' ? { kind: 'refused' } : undefined)),
      'refused',
    ],
    [
      'the authority cannot answer',
      (w: ReturnType<typeof world>) =>
        w.ports.script(call => (call.face === 'reader' ? { kind: 'unavailable' } : undefined)),
      'unknown',
    ],
  ] as const)('answers that it does not know when %s', async (_label, breakIt, kind) => {
    const w = world()
    expect(await w.standing.read(textOf(A))).toMatchObject({ kind: 'ok' })
    breakIt(w)
    expect(await w.standing.read(textOf(A))).toEqual({ kind })
  })

  it('answers unknown for a tenant text that is not a tenant', async () => {
    const w = world()
    expect(await w.standing.read('not-a-tenant' as never)).toEqual({ kind: 'unknown' })
  })

  it('names the block the standing type of the group is declared to bind', () => {
    expect(DELIVERY_BLOCKED_KEY).toBe('notification.delivery-blocked')
  })
})
