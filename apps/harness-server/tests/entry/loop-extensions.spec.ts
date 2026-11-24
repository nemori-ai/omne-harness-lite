import { describe, expect, it } from 'vitest'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  ENABLED_EXTENSIONS_REQUEST,
  type EnabledExtensionsView,
} from '@omne-harness/loop-extension-contract'
import type { StaticRead, StaticScopeHolder } from '@omne-harness/runtime-context-contract'
import { createEnabledExtensions } from '../../src/entry/loop-extensions.ts'
import { SESSION_WORK_OWNER } from '../../src/rows/authorization/principals.ts'
import { SESSION_WORK_COMPONENT } from '../../src/rows/tool-runtime/session-work.ts'

const tenantOf = (account: string): TenantId => {
  const parsed = tenantCodec.parse(
    JSON.stringify({ organization: `org_${'a'.repeat(26)}`, account: `acc_${account.repeat(26)}` }),
  )
  if (!parsed.ok) throw new Error('fixture tenant')
  return parsed.value
}
const A = tenantOf('1')
const B = tenantOf('2')
const work = (tenant: TenantId, owner = SESSION_WORK_OWNER) => ({
  kind: 'acting-for-tenant',
  actor: { kind: 'system', component: SESSION_WORK_COMPONENT },
  tenant,
  work: { owner, work: 'session-1' },
})
const member = (capability: string, position: string) => ({
  capability,
  assetRef: `loop-extension/${capability}`,
  version: 'v1',
  declaration: {
    name: capability,
    position,
    power: 'observe',
    implementation: { kind: 'builtin', builtinName: capability },
  },
})
const view = {
  members: [member('late', 'before_action'), member('watch', 'before_model_call')],
  basis: { assets: '7', settings: 'seen:2' },
} as unknown as EnabledExtensionsView
const read = (entries: StaticRead['entries']): StaticRead => ({
  entries,
  missing: { blocks: [], needs: [] },
})
const value = (given: unknown) =>
  read([{ key: 'loop-extension.enabled', kind: 'value', value: given }] as never)

type Holder = Pick<StaticScopeHolder<unknown>, 'read'>

function portOf(answer: Awaited<ReturnType<Holder['read']>> | Error | 'no holder' | 'no reader') {
  const asked: unknown[] = []
  const holder: Holder = {
    async read(principal, tenant, request) {
      asked.push([principal, tenant, request])
      if (answer instanceof Error) throw answer
      return answer as Awaited<ReturnType<Holder['read']>>
    },
  }
  const port = createEnabledExtensions({
    scope: () => (answer === 'no holder' ? undefined : holder),
    principal: () => (answer === 'no reader' ? undefined : 'tenant-scope-reader'),
  })
  const at = (principal: unknown, tenant: TenantId) =>
    port.read({
      principal,
      tenant,
      execution: 'execution-1',
      position: 'before_model_call',
      dimension: null,
      purpose: 'main',
    } as never)
  return { at, asked }
}

describe('the Agent port of the tenant-enabled extensions', () => {
  it('reads the view of the tenant from the tenant-level scope and gives the members of the position, with the basis of the view', async () => {
    const { at, asked } = portOf({ ok: value(view) })
    const answer = await at(work(A), A)
    expect(answer).toMatchObject({
      ok: {
        members: [{ declaration: { name: 'watch' } }],
        basis: { owner: 'loop-extension', record: 'enabled-extensions', revision: '7/seen:2' },
      },
    })
    expect(asked).toEqual([['tenant-scope-reader', A, ENABLED_EXTENSIONS_REQUEST]])
  })

  it.each([
    ['a principal that is not the work of a session', { kind: 'system', component: 'x' }, A],
    ['the work of a session of another tenant', work(B), A],
    ['work that is not of a session', work(A, 'login'), A],
  ])('denies %s, and reads nothing', async (_case, principal, tenant) => {
    const { at, asked } = portOf({ ok: value(view) })
    expect(await at(principal, tenant)).toEqual({
      failure: { kind: 'denied', action: 'enabled-extensions' },
    })
    expect(asked).toEqual([])
  })

  it.each([
    ['the holder of the tenant-level scope is away', 'no holder' as const],
    ['nobody reads the tenant-level scope now', 'no reader' as const],
    ['the scope refuses the read', { failure: { kind: 'denied' as const } }],
    ['the scope is unavailable', { failure: { kind: 'unavailable' as const, diagnostic: 'x' } }],
    ['the block is not contributed', { ok: read([]) }],
    [
      'the block is unavailable',
      { ok: read([{ key: 'loop-extension.enabled', kind: 'unavailable' }] as never) },
    ],
    ['the block is not a view', { ok: value({ members: 'none' }) }],
    ['the read throws', new Error('boom')],
  ])('is unavailable, never an empty chain, when %s', async (_case, answer) => {
    const { at } = portOf(answer as never)
    expect(await at(work(A), A)).toMatchObject({
      failure: { kind: 'unavailable', owner: 'agentEnabledExtensions' },
    })
  })
})
