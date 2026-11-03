// `requestContextTrust`（验收 4、DP5-C2、DP5-C3、R2-D202）：登记授权默认拒绝，核验器先于一切，三个租户逐一比较；
// 发行名单只有会话格：会话工作主体只为自己的会话、以发行固定的 agent-context owner 做 register。
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
import { AGENT_CONTEXT_OWNER } from '../../src/assembly/agent-context-owner.ts'
import { ENTRY_COMPONENTS, principalIssuer } from '../../src/entry/principals.ts'
import type {
  SessionScopeOwnership,
  SessionScopeOwnershipSource,
} from '../../src/entry/session-scope-source.ts'
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

/** A scope ownership source that answers one fixed ownership, and counts the lookups. */
function ownedAs(answer: SessionScopeOwnership) {
  let asked = 0
  const source: SessionScopeOwnershipSource = {
    lookup: () => {
      asked++
      return Promise.resolve(answer)
    },
  }
  return { source, asked: () => asked }
}

describe('the session cell of the release list (R2-D202)', () => {
  const { authority, acting } = authorityWithActing(ENTRY_COMPONENTS.sessionWork, tenantA)
  const bound = (tenant: TenantId, session: string): SessionScopeOwnership => ({
    kind: 'bound',
    tenant,
    session: session as never,
    generation: '1',
  })
  const check = (
    owned: SessionScopeOwnershipSource | undefined,
    patch: Partial<{ owner: Adoption; action: 'register' | 'replace'; principal: Principal }> = {},
  ) =>
    createRegistrationAuthority({
      verifier: authority.verifier,
      grants: REGISTRATION_ALLOW_LIST,
      ...(owned === undefined ? {} : { scopeOwners: owned }),
    }).check({
      access: { principal: patch.principal ?? acting, tenant: tenantA },
      target: target(tenantA),
      owner: patch.owner ?? AGENT_CONTEXT_OWNER,
      action: patch.action ?? 'register',
    })

  it('allows the session work principal to register for the scope of its own session', async () => {
    await expect(check(ownedAs(bound(tenantA, 'ses_1')).source)).resolves.toEqual({
      kind: 'allowed',
    })
  })

  it('denies a scope of another session or another tenant, and an unbound scope', async () => {
    for (const answer of [
      bound(tenantA, 'ses_2'),
      bound(tenantB, 'ses_1'),
      { kind: 'unbound' } as const,
    ])
      await expect(check(ownedAs(answer).source)).resolves.toEqual({ kind: 'denied' })
  })

  it('denies another owner and replace before it reads the scope', async () => {
    const owned = ownedAs(bound(tenantA, 'ses_1'))
    await expect(check(owned.source, { owner: OWNER })).resolves.toEqual({ kind: 'denied' })
    await expect(check(owned.source, { action: 'replace' })).resolves.toEqual({ kind: 'denied' })
    expect(owned.asked()).toBe(0)
  })

  it('denies a principal of the same component whose work is not a session', async () => {
    const actor = okOf(
      authority.issuer.issueSystem({ component: ENTRY_COMPONENTS.sessionWork }),
      'actor',
    )
    const other = okOf(
      authority.issuer.issueActingForTenant({
        actor,
        tenant: tenantA,
        work: { owner: 'other-work', work: 'ses_1' },
      }),
      'acting principal',
    )
    await expect(
      check(ownedAs(bound(tenantA, 'ses_1')).source, { principal: other }),
    ).resolves.toEqual({ kind: 'denied' })
  })

  it('keeps an unknown or unreadable ownership as it is, and answers unavailable without the source', async () => {
    await expect(check(ownedAs({ kind: 'unknown' }).source)).resolves.toEqual({ kind: 'unknown' })
    await expect(check(ownedAs({ kind: 'unavailable' }).source)).resolves.toMatchObject({
      kind: 'unavailable',
    })
    await expect(check(undefined)).resolves.toMatchObject({ kind: 'unavailable' })
  })
})

describe('registrationAuthority (DP5-C2 order)', () => {
  it('ships one cell (R2-D202): only the session work principal, for the release agent-context owner, to register; others are denied', async () => {
    expect(REGISTRATION_ALLOW_LIST).toEqual([
      {
        component: 'sessionWorkPrincipals',
        owners: [AGENT_CONTEXT_OWNER.owner],
        actions: ['register'],
        ownSession: true,
      },
    ])
    expect(Object.isFrozen(REGISTRATION_ALLOW_LIST)).toBe(true)
    expect(Object.isFrozen(REGISTRATION_ALLOW_LIST[0])).toBe(true)
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
