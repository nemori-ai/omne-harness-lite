import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import {
  inProcessPrincipalAuthority,
  type Principal,
  type PrincipalVerifier,
} from '@omne-harness/identity'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import type { TenantId } from '@omne-harness/legal-identity'
import type { SessionId } from '@omne-harness/session-contract'
import {
  decodeScopeRef,
  type AuthorityDecision,
  type Eligibility,
  type HolderAction,
  type HolderDecision,
  type ProducerAction,
  type RegistrationChange,
  type RuntimeContextAuthority,
  type ScopeRef,
} from '@omne-harness/runtime-context-contract'
import {
  RuntimeContextTrustService,
  runtimeContextTrustKey,
} from '@omne-harness/runtime-context-cordis-contract/cordis'
import { principalIssuer } from '../../src/entry/principals.ts'
import {
  createRuntimeContextAuthority,
  createRuntimeContextTrustModule,
  runtimeContextTrust,
  unavailableScopeBindings,
} from '../../src/entry/runtime-context-trust.ts'
import { createSessionScopeSource } from '../../src/entry/session-scope-source.ts'
import { fixtureEnv, fixtureTenant, got, okOf } from './support.ts'

const tenantA = fixtureTenant('a')
const tenantB = fixtureTenant('b')

function scopeOf(ref: string): ScopeRef {
  const decoded = decodeScopeRef({ ref })
  if ('failure' in decoded) throw new Error('fixture: scope')
  return decoded.ok
}
/** The shape Session mints (`decide-management.ts`): a one-way digest of tenant, session and generation. */
const scope = scopeOf(`session-scope:${'a'.repeat(64)}`)
const KEY = 'test.notes' as const
const PRODUCER = { producer: 'test-producer' }

function change(tenant: TenantId): RegistrationChange {
  return { kind: 'remove', scope, tenant, key: KEY, basedOn: 1, creating: false }
}

function eligibility(principal: unknown, tenant: TenantId): Eligibility<unknown> {
  return {
    id: { eligibility: 'e-1' },
    state: { kind: 'valid' },
    supersedes: null,
    scope: { ...scope },
    consumer: 'model',
    principal,
    tenant,
    keys: [KEY],
    bindings: [],
    registrationRevision: 1,
  }
}

/** Every holder action kind that names a tenant, for one tenant. */
function holderActions(principal: unknown, tenant: TenantId): readonly HolderAction<unknown>[] {
  const { id, state, ...material } = eligibility(principal, tenant)
  void id
  void state
  return [
    { kind: 'prepare', change: change(tenant) },
    {
      kind: 'commit',
      input: { kind: 'registration', commit: { commit: 'c-1' }, change: change(tenant) },
    },
    {
      kind: 'commit',
      input: {
        kind: 'step',
        commit: { commit: 'c-2' },
        tenant,
        stepCommit: { scope, step: { step: 's-1' }, committed: [], pending: [] },
        executionEnded: false,
      },
    },
    { kind: 'issue', material },
    {
      kind: 'begin-replay',
      scope,
      tenant,
      through: null,
      supersedes: null,
      previous: { checkpoint: null, registrationRevision: 0, end: null },
    },
    {
      kind: 'finish-replay',
      scope,
      tenant,
      replay: { replay: 'r-1' },
      through: null,
      material: { registrations: [], checkpoints: [], end: null },
      previous: { checkpoint: null, registrationRevision: 0, end: null },
      appliedCommits: [],
    },
  ]
}

function producerActions(tenant: TenantId): readonly ProducerAction[] {
  return [
    { kind: 'register', tenant, key: KEY, producer: PRODUCER },
    { kind: 'publish', scope, tenant, key: KEY, producer: PRODUCER },
    { kind: 'invalidate', scope, tenant, key: KEY, producer: PRODUCER },
    { kind: 'supply', scope, tenant, key: KEY, producer: PRODUCER },
    { kind: 'invalidate-tenant', tenant, key: KEY, producer: PRODUCER },
  ]
}

/** An authority with one verified acting principal of `component` for `tenant`. */
function authorityWithActing(
  component: string,
  tenant: TenantId,
  owner = 'session',
  work = 'ses_1',
) {
  const authority = inProcessPrincipalAuthority()
  const actor = okOf(authority.issuer.issueSystem({ component }), 'actor')
  const acting = okOf(
    authority.issuer.issueActingForTenant({
      actor,
      tenant,
      work: { owner, work },
    }),
    'acting principal',
  )
  return { authority, actor, acting }
}

/** The three faces, each asked once for the same tenant; every answer must have the same kind. */
async function kinds(
  authority: RuntimeContextAuthority<unknown>,
  principal: unknown,
  tenant: TenantId,
): Promise<Set<string>> {
  const seen = new Set<string>()
  for (const action of holderActions(principal, tenant))
    seen.add((await authority.holder(principal, action)).kind)
  for (const action of producerActions(tenant))
    seen.add((await authority.producer(principal, action)).kind)
  seen.add((await authority.reader(principal, eligibility(principal, tenant))).kind)
  return seen
}

describe('createRuntimeContextAuthority (the request-context-trust order)', () => {
  it('allows only the verified work principal of the scope session', async () => {
    const scopes = createSessionScopeSource({
      readOwnership: () => ({
        lookup: async () => ({
          kind: 'bound',
          tenant: tenantA,
          session: 'ses_1' as SessionId,
          generation: 'g1',
        }),
      }),
      readPrincipalBindings: () => ({
        read: async input => ({
          ok: {
            kind: 'bound',
            ...input,
            source: { owner: 'test', record: 'r', revision: '1', digest: 'd' },
          },
        }),
      }),
    })
    for (const [component, owner, work, expected] of [
      ['sessionWorkPrincipals', 'session', 'ses_1', 'authorized'],
      ['login', 'session', 'ses_1', 'refused'],
      ['sessionWorkPrincipals', 'other', 'ses_1', 'refused'],
      ['sessionWorkPrincipals', 'session', 'ses_2', 'refused'],
    ]) {
      const { authority, acting } = authorityWithActing(component!, tenantA, owner, work)
      const subject = createRuntimeContextAuthority({
        verifier: authority.verifier,
        scopeOwners: scopes.scopeOwners,
      })
      expect((await subject.reader(acting, eligibility(acting, tenantA))).kind).toBe(expected)
    }
  })

  it.each([
    { mismatch: 'principal', principalTenant: tenantB, scopeTenant: tenantA },
    { mismatch: 'scope ownership', principalTenant: tenantA, scopeTenant: tenantB },
  ])(
    'refuses a session reader when $mismatch differs from the eligibility tenant',
    async ({ principalTenant, scopeTenant }) => {
      const { authority, acting } = authorityWithActing('sessionWorkPrincipals', principalTenant)
      const scopes = createSessionScopeSource({
        readOwnership: () => ({
          lookup: async () => ({
            kind: 'bound',
            tenant: scopeTenant,
            session: 'ses_1' as SessionId,
            generation: 'g1',
          }),
        }),
        readPrincipalBindings: () => ({
          read: async () => ({
            ok: {
              kind: 'bound',
              tenant: scopeTenant,
              session: 'ses_1' as SessionId,
              source: { owner: 'test', record: 'r', revision: '1', digest: 'd' },
            },
          }),
        }),
      })
      expect(await scopes.scopeOwners.lookup(scope)).toMatchObject({
        kind: 'bound',
        tenant: scopeTenant,
        session: 'ses_1',
      })
      const subject = createRuntimeContextAuthority({
        verifier: authority.verifier,
        scopeOwners: scopes.scopeOwners,
      })
      expect(await subject.reader(acting, eligibility(acting, tenantA))).toEqual({
        kind: 'refused',
      })
    },
  )

  it('keeps missing and throwing ownership unavailable and captures the target before verification waits', async () => {
    const { authority, acting } = authorityWithActing('sessionWorkPrincipals', tenantA)
    const input = eligibility(acting, tenantA)
    expect(
      await createRuntimeContextAuthority({ verifier: authority.verifier }).reader(acting, input),
    ).toEqual({ kind: 'unavailable' })
    expect(
      await createRuntimeContextAuthority({
        verifier: authority.verifier,
        scopeOwners: {
          lookup: async () => {
            throw new Error('secret')
          },
        },
      }).reader(acting, input),
    ).toEqual({ kind: 'unavailable' })
    const pending = Promise.withResolvers<void>()
    const asked: string[] = []
    const subject = createRuntimeContextAuthority({
      verifier: {
        verify: async value => {
          await pending.promise
          return authority.verifier.verify(value)
        },
      },
      scopeOwners: {
        lookup: async target => {
          asked.push(target.ref)
          return { kind: 'unbound' }
        },
      },
    })
    const decision = subject.reader(acting, input)
    Reflect.set(input.scope, 'ref', 'changed')
    Reflect.set(input, 'tenant', tenantB)
    pending.resolve()
    expect(await decision).toEqual({ kind: 'refused' })
    expect(asked).toEqual([`session-scope:${'a'.repeat(64)}`])
  })
  it('preserves holder authorization but refuses producers and non-session readers', async () => {
    const { authority, acting } = authorityWithActing('session-ad03', tenantA)
    const subject = createRuntimeContextAuthority({ verifier: authority.verifier })
    for (const action of producerActions(tenantA))
      expect(await subject.producer(acting, action)).toEqual({ kind: 'refused' })
    for (const action of holderActions(acting, tenantA))
      expect((await subject.holder(acting, action)).kind).toBe('authorized')
    expect(await subject.reader(acting, eligibility(acting, tenantA))).toEqual({ kind: 'refused' })
    const decision = await subject.holder(acting, holderActions(acting, tenantA)[0]!)
    expect(decision.kind).toBe('authorized')
    if (decision.kind !== 'authorized') throw new Error('unreachable')
    expect(decision.principal).toBe(acting)
    expect(decision.current()).toBe(true)
  })

  it('refuses the principal of another tenant on every face: the tenant of the action is not its own', async () => {
    const { authority, acting } = authorityWithActing('session-ad03', tenantB)
    const subject = createRuntimeContextAuthority({ verifier: authority.verifier })
    expect(await kinds(subject, acting, tenantA)).toEqual(new Set(['refused']))
  })

  it('refuses a hand-built copy of an acting principal and a system principal before the tenant is read', async () => {
    const { authority, actor } = authorityWithActing('session-ad03', tenantA)
    const subject = createRuntimeContextAuthority({ verifier: authority.verifier })
    const forged: Principal = {
      kind: 'acting-for-tenant',
      actor,
      tenant: tenantA,
      work: { owner: 'session', work: 'ses_1' },
    }
    expect(await kinds(subject, forged, tenantA)).toEqual(new Set(['refused']))
    expect(await kinds(subject, actor, tenantA)).toEqual(new Set(['refused']))
    expect(await kinds(subject, 'not a principal', tenantA)).toEqual(new Set(['refused']))
  })

  it('refuses an action kind outside the table, and `revoke`, which names no tenant', async () => {
    const { authority, acting } = authorityWithActing('session-ad03', tenantA)
    const subject = createRuntimeContextAuthority({ verifier: authority.verifier })
    const unknownHolder = { kind: 'erase', tenant: tenantA } as unknown as HolderAction<unknown>
    const unknownProducer = { kind: 'rename', tenant: tenantA } as unknown as ProducerAction
    await expect(subject.holder(acting, unknownHolder)).resolves.toEqual({ kind: 'refused' })
    await expect(subject.producer(acting, unknownProducer)).resolves.toEqual({ kind: 'refused' })
    await expect(
      subject.holder(acting, { kind: 'revoke', eligibility: { eligibility: 'e-1' } }),
    ).resolves.toEqual({ kind: 'refused' })
  })

  it('answers unavailable when the verifier is down or throws, never refused or authorized, and reports no message', async () => {
    const { acting } = authorityWithActing('session-ad03', tenantA)
    const throwing: PrincipalVerifier = {
      verify: () => Promise.reject(new Error('verifier secret')),
    }
    const down: PrincipalVerifier = {
      verify: () => Promise.resolve({ kind: 'unavailable', diagnostic: 'verifier down' }),
    }
    const thrown = createRuntimeContextAuthority({ verifier: throwing })
    const decision = await thrown.producer(acting, producerActions(tenantA)[0]!)
    expect(decision).toEqual({ kind: 'unavailable' })
    expect(JSON.stringify(decision)).not.toContain('secret')
    expect(await kinds(createRuntimeContextAuthority({ verifier: down }), acting, tenantA)).toEqual(
      new Set(['unavailable']),
    )
  })
})

describe('the absent bindings port', () => {
  it('bindings: every scope, Session-shaped or forged, is unavailable; never bound, never unbound', async () => {
    await expect(unavailableScopeBindings.lookup(scope)).resolves.toEqual({ kind: 'unavailable' })
    await expect(unavailableScopeBindings.lookup(scopeOf('forged'))).resolves.toEqual({
      kind: 'unavailable',
    })
  })

  // The replay facts port is linked to `sessionReplayFacts`: runtime-context-replay-facts.spec.ts.
})

type Installed = Readonly<{
  trust: Context
  acting: Principal
  /** Loads a reader fiber on the trusted scope that asks one holder decision through the service. */
  reader(): Promise<Readonly<{ decision: HolderDecision<unknown>; dispose(): Promise<void> }>>
}>

async function installed(): Promise<Installed> {
  const fixture = fixtureEnv([runtimeContextTrustKey, principalIssuerKey])
  await fixture.install(principalIssuer)
  await fixture.install(runtimeContextTrust)
  const issuer = got(fixture.scopeOf(principalIssuerKey).get(principalIssuerKey), 'principalIssuer')
  const actor = okOf(issuer.issueSystem({ component: 'session-ad03' }), 'actor')
  const acting = okOf(
    issuer.issueActingForTenant({
      actor,
      tenant: tenantA,
      work: { owner: 'session', work: 'ses_1' },
    }),
    'acting principal',
  )
  const trust = fixture.scopeOf(runtimeContextTrustKey)
  expect(fixture.root.get(runtimeContextTrustKey)).toBeUndefined()
  return {
    trust,
    acting,
    async reader() {
      let asked: Promise<HolderDecision<unknown>> | undefined
      const fiber = trust.plugin({
        name: 'probe-reader',
        inject: [runtimeContextTrustKey],
        apply(ctx: Context) {
          const service = got(ctx.get(runtimeContextTrustKey), 'runtimeContextTrust')
          expect(service).toBeInstanceOf(RuntimeContextTrustService)
          asked = service.authority.holder(acting, holderActions(acting, tenantA)[0]!)
        },
      })
      await fiber
      if (asked === undefined) throw new Error('fixture: the reader did not ask')
      return { decision: await asked, dispose: () => fiber.dispose() }
    },
  }
}

describe('the installed `runtimeContextTrust`', () => {
  it('keeps an authorization stale when its reader retires during the ownership await', async () => {
    const fixture = fixtureEnv([runtimeContextTrustKey, principalIssuerKey])
    await fixture.install(principalIssuer)
    const issuer = got(fixture.scopeOf(principalIssuerKey).get(principalIssuerKey), 'issuer')
    const actor = okOf(issuer.issueSystem({ component: 'sessionWorkPrincipals' }), 'actor')
    const acting = okOf(
      issuer.issueActingForTenant({
        actor,
        tenant: tenantA,
        work: { owner: 'session', work: 'ses_1' },
      }),
      'acting',
    )
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const scopes = createSessionScopeSource({
      readOwnership: () => ({
        lookup: async () => {
          entered.resolve()
          await release.promise
          return { kind: 'bound', tenant: tenantA, session: 'ses_1' as SessionId, generation: 'g1' }
        },
      }),
      readPrincipalBindings: () => ({
        read: async input => ({
          ok: {
            kind: 'bound',
            ...input,
            source: { owner: 'test', record: 'r', revision: '1', digest: 'd' },
          },
        }),
      }),
    })
    await fixture.install(createRuntimeContextTrustModule(scopes))
    let asked: Promise<AuthorityDecision<unknown>> | undefined
    const fiber = fixture.scopeOf(runtimeContextTrustKey).plugin({
      name: 'pending-reader',
      inject: [runtimeContextTrustKey],
      apply(ctx: Context) {
        asked = ctx
          .get(runtimeContextTrustKey)!
          .authority.reader(acting, eligibility(acting, tenantA))
      },
    })
    await fiber
    await entered.promise
    await fiber.dispose()
    release.resolve()
    const decision = await asked
    if (decision?.kind !== 'authorized') throw new Error('expected authorized')
    expect(decision.current()).toBe(false)
  })
  it('is a subclass of the definition on the trusted scope only, and authorizes through the service', async () => {
    const { reader } = await installed()
    const { decision, dispose } = await reader()
    expect(decision.kind).toBe('authorized')
    if (decision.kind !== 'authorized') throw new Error('unreachable')
    expect(decision.current()).toBe(true)
    await dispose()
  })

  it('current: once the reading row fiber is disposed, its earlier answers are stale; another reader stays current', async () => {
    const { reader } = await installed()
    const first = await reader()
    const second = await reader()
    if (first.decision.kind !== 'authorized' || second.decision.kind !== 'authorized')
      throw new Error('fixture: not authorized')
    expect([first.decision.current(), second.decision.current()]).toEqual([true, true])
    await first.dispose()
    expect([first.decision.current(), second.decision.current()]).toEqual([false, true])
    await second.dispose()
    expect(second.decision.current()).toBe(false)
  })

  it('bindings through the service are unavailable, so a scope of another tenant is never answered as any tenant', async () => {
    const { trust } = await installed()
    const service = got(trust.get(runtimeContextTrustKey), 'runtimeContextTrust')
    await expect(service.bindings.lookup(scope)).resolves.toEqual({ kind: 'unavailable' })
  })
})
