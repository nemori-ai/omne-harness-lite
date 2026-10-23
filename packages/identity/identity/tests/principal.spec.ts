import { describe, expect, it } from 'vitest'
import {
  actingScopeEquals,
  systemScope,
  tenantScope,
  type TenantId,
} from '@omne-harness/legal-identity'
import {
  inProcessPrincipalAuthority,
  scopeOf,
  type ActingForTenantPrincipal,
  type SystemPrincipal,
} from '@omne-harness/identity'
import { ADMIN_ACCOUNT_TEXT, ORGANIZATION_TEXT, parsedTenant } from './support.ts'

const WORK = { owner: 'session', work: 'ses_1' } as const

function issuedSystem(authority = inProcessPrincipalAuthority()) {
  const actor = authority.issuer.issueSystem({ component: 'session-coordinator' })
  if ('failure' in actor) throw new Error('fixture actor did not issue')
  return { authority, actor: actor.ok }
}

describe('issuing a system principal', () => {
  it('gives a frozen principal that the same authority verifies', async () => {
    const { authority, actor } = issuedSystem()
    expect(actor).toEqual({ kind: 'system', component: 'session-coordinator' })
    expect(Object.isFrozen(actor)).toBe(true)
    await expect(authority.verifier.verify(actor)).resolves.toEqual({
      kind: 'verified',
      principal: actor,
    })
    expect(actingScopeEquals(scopeOf(actor), systemScope())).toBe(true)
  })

  it.each([
    ['a missing component', {}, 'type'],
    ['a component that is not text', { component: 7 }, 'type'],
    ['an empty component', { component: '' }, 'empty'],
  ])('refuses %s with %s', (_case, input, reason) => {
    const { authority } = issuedSystem()
    expect(authority.issuer.issueSystem(input as never)).toEqual({
      failure: { field: 'component', reason },
    })
  })
})

describe('issuing a principal that acts for a tenant', () => {
  it('keeps the actor, the tenant and the original work, and scopes to that tenant', async () => {
    const { authority, actor } = issuedSystem()
    const tenant = parsedTenant(ORGANIZATION_TEXT, ADMIN_ACCOUNT_TEXT)
    const issued = authority.issuer.issueActingForTenant({ actor, tenant, work: WORK })
    if ('failure' in issued) throw new Error('did not issue')
    const principal = issued.ok
    expect(principal).toEqual({ kind: 'acting-for-tenant', actor, tenant, work: WORK })
    expect(principal.tenant).toBe(tenant)
    expect(Object.isFrozen(principal)).toBe(true)
    expect(Object.isFrozen(principal.work)).toBe(true)
    await expect(authority.verifier.verify(principal)).resolves.toEqual({
      kind: 'verified',
      principal,
    })
    expect(actingScopeEquals(scopeOf(principal), tenantScope(tenant))).toBe(true)
  })

  it('refuses an actor that this authority did not issue', () => {
    const { authority } = issuedSystem()
    const other = issuedSystem().actor
    const copy: SystemPrincipal = { kind: 'system', component: 'session-coordinator' }
    const tenant = parsedTenant(ORGANIZATION_TEXT, ADMIN_ACCOUNT_TEXT)
    for (const actor of [other, copy]) {
      expect(authority.issuer.issueActingForTenant({ actor, tenant, work: WORK })).toEqual({
        failure: { field: 'actor', reason: 'unissued' },
      })
    }
  })

  it('refuses an acting principal as the actor', () => {
    const { authority, actor } = issuedSystem()
    const tenant = parsedTenant(ORGANIZATION_TEXT, ADMIN_ACCOUNT_TEXT)
    const acting = authority.issuer.issueActingForTenant({ actor, tenant, work: WORK })
    if ('failure' in acting) throw new Error('did not issue')
    expect(
      authority.issuer.issueActingForTenant({ actor: acting.ok as never, tenant, work: WORK }),
    ).toEqual({ failure: { field: 'actor', reason: 'unissued' } })
  })

  it('refuses a hand-built tenant', () => {
    const { authority, actor } = issuedSystem()
    const forged: TenantId = {
      name: 'TenantId',
      organization: { name: 'OrganizationId', text: ORGANIZATION_TEXT },
      account: { name: 'AccountId', text: ADMIN_ACCOUNT_TEXT },
    }
    expect(authority.issuer.issueActingForTenant({ actor, tenant: forged, work: WORK })).toEqual({
      failure: { field: 'tenant', reason: 'unminted' },
    })
  })

  it.each([
    ['an empty work owner', { owner: '', work: 'x' }, 'work.owner', 'empty'],
    ['an empty work', { owner: 'session', work: '' }, 'work.work', 'empty'],
    ['a work that is not text', { owner: 'session', work: 1 }, 'work.work', 'type'],
  ])('refuses %s', (_case, work, field, reason) => {
    const { authority, actor } = issuedSystem()
    const tenant = parsedTenant(ORGANIZATION_TEXT, ADMIN_ACCOUNT_TEXT)
    expect(authority.issuer.issueActingForTenant({ actor, tenant, work: work as never })).toEqual({
      failure: { field, reason },
    })
  })
})

describe('verifying', () => {
  it('rejects a hand-built copy, a principal of another authority, and non-objects', async () => {
    const { authority, actor } = issuedSystem()
    const tenant = parsedTenant(ORGANIZATION_TEXT, ADMIN_ACCOUNT_TEXT)
    const copy: ActingForTenantPrincipal = { kind: 'acting-for-tenant', actor, tenant, work: WORK }
    const other = issuedSystem().actor
    for (const value of [copy, other, null, undefined, 'system', { ...actor }]) {
      await expect(authority.verifier.verify(value)).resolves.toEqual({ kind: 'rejected' })
    }
  })

  it('does not accept a JSON round trip of an issued principal', async () => {
    const { authority, actor } = issuedSystem()
    const revived: unknown = JSON.parse(JSON.stringify(actor))
    await expect(authority.verifier.verify(revived)).resolves.toEqual({ kind: 'rejected' })
  })
})
