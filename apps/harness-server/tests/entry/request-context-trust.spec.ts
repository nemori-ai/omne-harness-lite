// `requestContextTrust`（验收 4、DP5-C2、DP5-C3）：登记授权默认拒绝，核验器先于一切，三个租户逐一比较；
// 主体绑定给经核验主体的稳定键。经服务键与导出的工厂调用。
import { describe, expect, it } from 'vitest'
import {
  inProcessPrincipalAuthority,
  type Principal,
  type PrincipalVerifier,
} from '@omne-harness/identity'
import type { Adoption } from '@omne-harness/exchange-refs'
import type { ContextTarget } from '@omne-harness/request-context-contract'
import { createAssemblyFixture } from '@omne-harness/request-context-contract/testing'
import {
  RequestContextTrustService,
  requestContextTrustKey,
} from '@omne-harness/request-context-cordis-contract/cordis'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import type { TenantId } from '@omne-harness/legal-identity'
import {
  REGISTRATION_ALLOW_LIST,
  createPrincipalBinding,
  createRegistrationAuthority,
  requestContextTrust,
  type RegistrationGrant,
} from '../../src/entry/request-context-trust.ts'
import { principalIssuer } from '../../src/entry/principals.ts'
import { fixtureEnv, fixtureTenant, got, okOf } from './support.ts'

const tenantA = fixtureTenant('a')
const tenantB = fixtureTenant('b')
const OWNER: Adoption = { owner: 'session-adapters', name: 'ad04', revision: '1', digest: 'd' }
const { scope } = createAssemblyFixture().target
const target = (tenant: TenantId): ContextTarget => ({ tenant, scope })

function authorityWithActing(component: string, tenant: TenantId) {
  const authority = inProcessPrincipalAuthority()
  const actor = authority.issuer.issueSystem({ component })
  if ('failure' in actor) throw new Error('fixture actor')
  const acting = authority.issuer.issueActingForTenant({
    actor: actor.ok,
    tenant,
    work: { owner: 'session', work: 'ses_1' },
  })
  if ('failure' in acting) throw new Error('fixture acting principal')
  return { authority, actor: actor.ok, acting: acting.ok }
}

const GRANT: RegistrationGrant = {
  component: 'session-ad04',
  owners: ['session-adapters'],
  actions: ['register'],
}

describe('registrationAuthority (DP5-C2 order)', () => {
  it('ships with an empty allow list in wave 1 (DP5-C3): the installed service never allows', async () => {
    expect(REGISTRATION_ALLOW_LIST).toEqual([])
    expect(Object.isFrozen(REGISTRATION_ALLOW_LIST)).toBe(true)
    const fixture = fixtureEnv([requestContextTrustKey, principalIssuerKey])
    await fixture.install(principalIssuer)
    await fixture.install(requestContextTrust)
    const trust = got(
      fixture.scopeOf(requestContextTrustKey).get(requestContextTrustKey),
      'requestContextTrust',
    )
    expect(trust).toBeInstanceOf(RequestContextTrustService)
    expect(fixture.root.get(requestContextTrustKey)).toBeUndefined()
    const issuer = got(
      fixture.scopeOf(principalIssuerKey).get(principalIssuerKey),
      'principalIssuer',
    )
    const actor = okOf(issuer.issueSystem({ component: 'session-ad04' }), 'actor')
    const acting = okOf(
      issuer.issueActingForTenant({
        actor,
        tenant: tenantA,
        work: { owner: 'session', work: 'ses_1' },
      }),
      'acting principal',
    )
    for (const action of ['register', 'replace'] as const) {
      await expect(
        trust.registrationAuthority.check({
          access: { principal: acting, tenant: tenantA },
          target: target(tenantA),
          owner: OWNER,
          action,
        }),
      ).resolves.toEqual({ kind: 'denied' })
      await expect(
        trust.registrationAuthority.check({
          access: { principal: actor, tenant: tenantA },
          target: target(tenantA),
          owner: OWNER,
          action,
        }),
      ).resolves.toEqual({ kind: 'denied' })
    }
  })

  it('answers unavailable when the verifier throws or is unavailable, never denied or allowed', async () => {
    const { acting } = authorityWithActing('session-ad04', tenantA)
    const throwing: PrincipalVerifier = {
      verify: () => Promise.reject(new Error('verifier secret')),
    }
    const down: PrincipalVerifier = {
      verify: () => Promise.resolve({ kind: 'unavailable', diagnostic: 'verifier down' }),
    }
    const input = {
      access: { principal: acting, tenant: tenantA },
      target: target(tenantA),
      owner: OWNER,
      action: 'register' as const,
    }
    const thrown = await createRegistrationAuthority({ verifier: throwing, grants: [GRANT] }).check(
      input,
    )
    expect(thrown).toMatchObject({ kind: 'unavailable' })
    expect(JSON.stringify(thrown)).not.toContain('secret')
    await expect(
      createRegistrationAuthority({ verifier: down, grants: [GRANT] }).check(input),
    ).resolves.toEqual({
      kind: 'unavailable',
      diagnostic: 'verifier down',
    })
  })

  it('denies a rejected principal, a system principal and a hand-built acting principal before any grant is read', async () => {
    const { authority, actor } = authorityWithActing('session-ad04', tenantA)
    const check = createRegistrationAuthority({ verifier: authority.verifier, grants: [GRANT] })
    const forged: Principal = {
      kind: 'acting-for-tenant',
      actor,
      tenant: tenantA,
      work: { owner: 'session', work: 'ses_1' },
    }
    const common = { target: target(tenantA), owner: OWNER, action: 'register' as const }
    await expect(
      check.check({ access: { principal: forged, tenant: tenantA }, ...common }),
    ).resolves.toEqual({ kind: 'denied' })
    await expect(
      check.check({ access: { principal: actor, tenant: tenantA }, ...common }),
    ).resolves.toEqual({ kind: 'denied' })
  })

  it('denies when any one of the three tenants differs, and allows only when all agree and the grant lists the cell', async () => {
    const { authority, acting } = authorityWithActing('session-ad04', tenantA)
    const check = createRegistrationAuthority({ verifier: authority.verifier, grants: [GRANT] })
    const allowed = {
      access: { principal: acting, tenant: tenantA },
      target: target(tenantA),
      owner: OWNER,
      action: 'register' as const,
    }
    await expect(check.check(allowed)).resolves.toEqual({ kind: 'allowed' })
    await expect(
      check.check({ ...allowed, access: { principal: acting, tenant: tenantB } }),
    ).resolves.toEqual({ kind: 'denied' })
    await expect(check.check({ ...allowed, target: target(tenantB) })).resolves.toEqual({
      kind: 'denied',
    })
    const other = authorityWithActing('session-ad04', tenantB)
    const otherCheck = createRegistrationAuthority({
      verifier: other.authority.verifier,
      grants: [GRANT],
    })
    await expect(
      otherCheck.check({
        access: { principal: other.acting, tenant: tenantA },
        target: target(tenantA),
        owner: OWNER,
        action: 'register',
      }),
    ).resolves.toEqual({ kind: 'denied' })
  })

  it('denies a component, an owner or an action outside the grant cell', async () => {
    const { authority, acting } = authorityWithActing('session-ad05', tenantA)
    const input = {
      access: { principal: acting, tenant: tenantA },
      target: target(tenantA),
      owner: OWNER,
      action: 'register' as const,
    }
    await expect(
      createRegistrationAuthority({ verifier: authority.verifier, grants: [GRANT] }).check(input),
    ).resolves.toEqual({
      kind: 'denied',
    })
    const own = authorityWithActing('session-ad04', tenantA)
    const check = createRegistrationAuthority({ verifier: own.authority.verifier, grants: [GRANT] })
    await expect(
      check.check({
        ...input,
        access: { principal: own.acting, tenant: tenantA },
        action: 'replace',
      }),
    ).resolves.toEqual({
      kind: 'denied',
    })
    await expect(
      check.check({
        ...input,
        access: { principal: own.acting, tenant: tenantA },
        owner: { ...OWNER, owner: 'someone-else' },
      }),
    ).resolves.toEqual({ kind: 'denied' })
  })
})

describe('principalBinding', () => {
  it('keys a verified acting principal stably, differently per tenant and per work, and denies a copy', async () => {
    const { authority, acting, actor } = authorityWithActing('server-entry', tenantA)
    const binding = createPrincipalBinding({ verifier: authority.verifier })
    const first = await binding.key({ principal: acting, tenant: tenantA })
    const second = await binding.key({ principal: acting, tenant: tenantA })
    expect(first).toMatchObject({ kind: 'value' })
    expect(first).toEqual(second)
    const otherWork = authority.issuer.issueActingForTenant({
      actor,
      tenant: tenantA,
      work: { owner: 'session', work: 'ses_2' },
    })
    if ('failure' in otherWork) throw new Error('fixture')
    const third = await binding.key({ principal: otherWork.ok, tenant: tenantA })
    expect(third).toMatchObject({ kind: 'value' })
    expect(third).not.toEqual(first)
    const copy: Principal = { ...acting }
    await expect(binding.key({ principal: copy, tenant: tenantA })).resolves.toEqual({
      kind: 'denied',
    })
    await expect(binding.key({ principal: acting, tenant: tenantB })).resolves.toEqual({
      kind: 'denied',
    })
    await expect(binding.key({ principal: actor, tenant: tenantA })).resolves.toMatchObject({
      kind: 'value',
    })
    expect(JSON.stringify(first)).not.toContain('ses_1')
  })

  it('answers unavailable when the verifier cannot answer', async () => {
    const binding = createPrincipalBinding({
      verifier: { verify: () => Promise.reject(new Error('x')) },
    })
    await expect(
      binding.key({ principal: { kind: 'system', component: 'c' }, tenant: tenantA }),
    ).resolves.toMatchObject({
      kind: 'unavailable',
    })
  })

  it('is reachable through the installed service', async () => {
    const fixture = fixtureEnv([requestContextTrustKey, principalIssuerKey])
    await fixture.install(principalIssuer)
    await fixture.install(requestContextTrust)
    const trust = got(
      fixture.scopeOf(requestContextTrustKey).get(requestContextTrustKey),
      'requestContextTrust',
    )
    const issuer = got(
      fixture.scopeOf(principalIssuerKey).get(principalIssuerKey),
      'principalIssuer',
    )
    const actor = okOf(issuer.issueSystem({ component: 'probe' }), 'actor')
    await expect(
      trust.principalBinding.key({ principal: actor, tenant: tenantA }),
    ).resolves.toMatchObject({ kind: 'value' })
  })
})
