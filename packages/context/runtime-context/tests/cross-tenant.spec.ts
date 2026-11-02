import { describe, expect, it } from 'vitest'
import { tenantEquals } from '@omne-harness/legal-identity'
import type { TenantId } from '@omne-harness/legal-identity'
import type { AuthorityCall } from '@omne-harness/runtime-context-contract/testing'
import {
  firstBlock,
  harness,
  issue,
  open,
  producer,
  reader,
  register,
  scope,
  supplied,
  tenantA,
  tenantB,
} from './support.js'

// R5.4: another tenant's access to Runtime Context is refused inside the mechanism, before any
// source call. The test authority below answers like a real adapter: the caller's tenant is the
// tenant of the principal, so a principal of tenant B acting on tenant A is refused.
function tenantOfPrincipal(principal: string): TenantId {
  return principal.startsWith('b:') ? tenantB : tenantA
}
function targetTenant(call: AuthorityCall<string>): TenantId | undefined {
  if (call.face === 'reader') return call.eligibility.tenant
  if (call.face === 'producer') return call.action.tenant
  switch (call.action.kind) {
    case 'issue':
      return call.action.material.tenant
    case 'prepare':
      return call.action.change.tenant
    case 'begin-replay':
    case 'finish-replay':
      return call.action.tenant
    default:
      return undefined
  }
}

describe('cross-tenant access', () => {
  it('another tenant cannot issue, register or publish on a scope of tenant A, and no callback runs', async () => {
    const h = harness()
    const a = scope('tenant-a/session/1')
    await open(h, a, tenantA)
    const handle = await producer(h, tenantA, 'test.value')
    await register(h, a, tenantA, 'test.value')
    expect((await handle.publish({ scope: a, tenant: tenantA, value: 1 })).kind).toBe('published')
    h.ports.script(call =>
      tenantEquals(tenantOfPrincipal(call.principal), targetTenant(call) ?? tenantA)
        ? undefined
        : { kind: 'refused' },
    )
    let suppliedCalls = 0
    const issued = await h.rc.issueEligibility('b:holder', {
      supersedes: null,
      scope: a,
      consumer: 'model',
      principal: 'b:reader',
      tenant: tenantA,
      keys: ['test.value'],
      bindings: [],
      registrationRevision: 0,
    })
    expect(issued).toEqual({ kind: 'refused', reason: 'unauthorized' })
    const registered = await h.rc.registerProducer('b:producer', {
      key: 'test.other',
      tenant: tenantA,
      producer: { producer: 'intruder' },
      declaration: supplied('test.other'),
      scoped: false,
      supply: async () => {
        suppliedCalls++
        return { kind: 'value', value: 2 }
      },
    })
    expect(registered).toEqual({ kind: 'refused', reason: 'unauthorized' })
    // A tenant B handle publishing into tenant A's scope: the handle tenant differs from the input.
    h.ports.script(undefined)
    const intruder = await producer(h, tenantB, 'test.value', { name: 'intruder' })
    const published = await intruder.publish({ scope: a, tenant: tenantA, value: 9 })
    expect(published).toEqual({ kind: 'refused', reason: 'unauthorized' })
    // Same tenant on the handle and the input, but the trusted binding says the scope is tenant A's.
    const sameTenantInput = await intruder.publish({ scope: a, tenant: tenantB, value: 9 })
    expect(sameTenantInput).toEqual({ kind: 'refused', reason: 'unauthorized' })
    expect(JSON.stringify([issued, registered, published, sameTenantInput])).not.toContain('acc_')
    expect(suppliedCalls).toBe(0)
    const owner = await reader(h, await issue(h, a, tenantA, ['test.value']))
    expect(await firstBlock(owner)).toEqual({ kind: 'value', value: 1 })
  })

  it('a reader is refused once the trusted binding no longer names the eligibility tenant', async () => {
    const h = harness()
    const a = scope('tenant-a/session/2')
    await open(h, a, tenantA)
    const handle = await producer(h, tenantA, 'test.value')
    await register(h, a, tenantA, 'test.value')
    await handle.publish({ scope: a, tenant: tenantA, value: 1 })
    const r = await reader(h, await issue(h, a, tenantA, ['test.value']))
    expect(await firstBlock(r)).toEqual({ kind: 'value', value: 1 })
    // The binding source answers another tenant: the read is unauthorized and discloses nothing,
    // even though the value is still in the projection and in the read cache.
    h.ports.bind(a, tenantB)
    expect(await r.snapshot()).toEqual({ kind: 'refused', reason: 'unauthorized' })
    expect(await r.read([{ key: 'test.value', need: 'value' }])).toEqual({
      kind: 'refused',
      reason: 'unauthorized',
    })
  })

  it('an eligibility for another tenant on an existing scope is not issued', async () => {
    const h = harness()
    const a = scope('tenant-a/session/3')
    await open(h, a, tenantA)
    await producer(h, tenantA, 'test.value')
    await register(h, a, tenantA, 'test.value')
    // A faulty binding source rebinds the scope: the recorded tenant conflicts with the trusted fact.
    h.ports.bind(a, tenantB)
    const issued = await h.rc.issueEligibility('holder', {
      supersedes: null,
      scope: a,
      consumer: 'model',
      principal: 'reader',
      tenant: tenantB,
      keys: ['test.value'],
      bindings: [],
      registrationRevision: 0,
    })
    expect(issued).toEqual({ kind: 'refused', reason: 'unauthorized' })
  })
})
