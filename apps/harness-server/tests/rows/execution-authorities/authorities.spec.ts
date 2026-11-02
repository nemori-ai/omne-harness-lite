import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { createEnvironmentRegistry } from '@omne-harness/execution-environment'
import {
  acquisitionRef,
  commandFacility,
  createRecoveryAccess,
  originRef,
  type EnvironmentAction,
  type RecoveryAuthority,
  type RecoveryAccess,
} from '@omne-harness/execution-environment-contract'
import { createScriptedEnvironmentProvider } from '@omne-harness/execution-environment-contract/testing'
import {
  ExecutionEnvironmentAuthorityService,
  ExecutionRecoveryAuthorityService,
  ExecutionScopeBindingService,
  executionEnvironmentAuthorityKey,
  executionRecoveryAuthorityKey,
  executionScopeBindingKey,
} from '@omne-harness/execution-environment-cordis-contract/cordis'
import { inProcessPrincipalAuthority, type PrincipalVerifier } from '@omne-harness/identity'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import {
  decodeScopeRef,
  type ScopeBinding,
  type ScopeBindingSource,
  type ScopeRef,
  type AuthorityDecision,
} from '@omne-harness/runtime-context-contract'
import type { SessionId } from '@omne-harness/session-contract'
import {
  createExecutionAuthorityModules,
  EntryExecutionEnvironmentAuthority,
  EntryExecutionRecoveryAuthority,
  EntryExecutionScopeBinding,
} from '../../../src/entry/execution-authorities.ts'
import { createSessionScopeSource } from '../../../src/entry/session-scope-source.ts'
import { principalIssuer } from '../../../src/entry/principals.ts'
import { fixtureEnv, fixtureTenant, got, okOf } from '../../entry/support.ts'

const tenant = fixtureTenant('a')
const otherTenant = fixtureTenant('b')
const scope = okOf(decodeScopeRef({ ref: 'scope-a' }), 'scope')

function identity() {
  const authority = inProcessPrincipalAuthority()
  const actor = okOf(authority.issuer.issueSystem({ component: 'test-worker' }), 'actor')
  const principal = okOf(
    authority.issuer.issueActingForTenant({ actor, tenant, work: { owner: 'test', work: 'w1' } }),
    'principal',
  )
  return { ...authority, actor, principal }
}

function originalAt(scope: ScopeRef) {
  return {
    tenant,
    scope,
    acquisition: acquisitionRef('a1'),
    origin: originRef('o1'),
    placement: {
      kind: 'placement' as const,
      binding: { kind: 'host_machine' as const },
      provider: { name: 'test', generation: 'g1', version: 'v1' },
      quotaDomain: 'test',
      continuity: { kind: 'not_guaranteed' as const },
      requirement: {
        allowedBindings: [{ kind: 'host_machine' as const }],
        facilities: ['command' as const],
        isolation: [],
      },
    },
  }
}

it('installs all three definition subclasses and combines real identity, shared scope facts and Registry', async () => {
  const keys = [
    principalIssuerKey,
    executionEnvironmentAuthorityKey,
    executionScopeBindingKey,
    executionRecoveryAuthorityKey,
  ]
  const fixture = fixtureEnv(keys)
  await fixture.install(principalIssuer)
  const issuer = got(fixture.scopeOf(principalIssuerKey).get(principalIssuerKey), 'issuer')
  const actor = okOf(issuer.issueSystem({ component: 'worker' }), 'actor')
  const principal = okOf(
    issuer.issueActingForTenant({ actor, tenant, work: { owner: 'test', work: '1' } }),
    'principal',
  )
  let bound = true
  const scopes = createSessionScopeSource({
    readOwnership: () => ({
      lookup: async () =>
        bound
          ? { kind: 'bound', tenant, session: 'ses_1' as SessionId, generation: 'g1' }
          : { kind: 'unbound' },
    }),
    readPrincipalBindings: () => ({
      read: async input => ({
        ok: {
          kind: 'bound',
          ...input,
          source: { owner: 'test', record: 'r1', revision: '1', digest: 'd' },
        },
      }),
    }),
  })
  const access = createRecoveryAccess()
  const modules = createExecutionAuthorityModules({
    readBindings: () => scopes.bindings,
    readRecovery: () => ({
      authorizeRecovery: async offered => (offered === access ? 'authorized' : 'notAuthorized'),
    }),
  })
  for (const module of modules) await fixture.install(module)
  const authority = got(
    fixture.scopeOf(executionEnvironmentAuthorityKey).get(executionEnvironmentAuthorityKey),
    'authority',
  )
  const bindings = got(
    fixture.scopeOf(executionScopeBindingKey).get(executionScopeBindingKey),
    'bindings',
  )
  const recovery = got(
    fixture.scopeOf(executionRecoveryAuthorityKey).get(executionRecoveryAuthorityKey),
    'recovery',
  )
  expect(authority).toBeInstanceOf(ExecutionEnvironmentAuthorityService)
  expect(bindings).toBeInstanceOf(ExecutionScopeBindingService)
  expect(recovery).toBeInstanceOf(ExecutionRecoveryAuthorityService)
  for (const key of keys) expect(fixture.root.get(key)).toBeUndefined()
  const registry = createEnvironmentRegistry({ authority, bindings, recovery })
  registry.registerFacility(commandFacility)
  registry.registerProvider(createScriptedEnvironmentProvider())
  const input = {
    scope,
    requirement: {
      allowedBindings: [{ kind: 'host_machine' as const }],
      facilities: ['command' as const],
      isolation: [],
    },
  }
  expect((await registry.resolvePlacement({ principal, tenant }, input)).kind).toBe('placement')
  const otherPrincipal = okOf(
    issuer.issueActingForTenant({ actor, tenant: otherTenant, work: { owner: 'test', work: '2' } }),
    'other principal',
  )
  expect(
    await registry.resolvePlacement({ principal: otherPrincipal, tenant }, input),
  ).toMatchObject({ kind: 'rejected', reason: 'notAuthorized' })
  expect(await registry.resolvePlacement({ principal, tenant: otherTenant }, input)).toMatchObject({
    kind: 'rejected',
    reason: 'notAuthorized',
  })
  bound = false
  expect(await registry.resolvePlacement({ principal, tenant }, input)).toMatchObject({
    kind: 'rejected',
    reason: 'notAuthorized',
  })
  expect(await registry.releaseScope(scope, createRecoveryAccess())).toMatchObject({
    kind: 'rejected',
    reason: 'notAuthorized',
  })
  expect(await registry.releaseScope(scope, access)).toMatchObject({ kind: 'recovered' })
  await registry.close()
})

it('checks every action tenant and scope, preserves source states, and fails closed on identity failures', async () => {
  const issued = identity()
  let verifier: PrincipalVerifier | undefined = issued.verifier
  let binding: ScopeBinding = { kind: 'bound', tenant }
  let bindings: ScopeBindingSource | undefined = { lookup: async () => binding }
  const subject = new EntryExecutionEnvironmentAuthority(new Context(), {
    readVerifier: () => verifier,
    readBindings: () => bindings,
  })
  const access = { principal: issued.principal, tenant }
  expect(
    await subject.authorize(
      { principal: { ...issued.principal }, tenant },
      { kind: 'resolve', scope },
    ),
  ).toEqual({ kind: 'refused' })
  const original = originalAt(scope)
  const actions: EnvironmentAction[] = [
    { kind: 'resolve', scope },
    { kind: 'describe', scope },
    { kind: 'inspect', tenant, acquisition: acquisitionRef('a1') },
    { kind: 'acquire', original },
    { kind: 'inspect-original', original },
  ]
  for (const action of actions) {
    expect((await subject.authorize(access, action)).kind).toBe('authorized')
    expect(await subject.authorize({ principal: issued.actor, tenant }, action)).toEqual({
      kind: 'refused',
    })
    expect(await subject.authorize({ ...access, tenant: otherTenant }, action)).toEqual({
      kind: 'refused',
    })
  }
  for (const kind of ['acquire', 'inspect-original'] as const)
    expect(
      await subject.authorize(access, { kind, original: { ...original, tenant: otherTenant } }),
    ).toEqual({ kind: 'refused' })
  expect(
    await subject.authorize(access, {
      kind: 'inspect',
      tenant: otherTenant,
      acquisition: acquisitionRef('a1'),
    }),
  ).toEqual({ kind: 'refused' })
  for (const [kind, expected] of [
    ['unbound', 'refused'],
    ['unavailable', 'unavailable'],
    ['unknown', 'unknown'],
  ] as const) {
    binding = { kind }
    expect((await subject.authorize(access, { kind: 'describe', scope })).kind).toBe(expected)
  }
  binding = { kind: 'bound', tenant: otherTenant }
  expect(await subject.authorize(access, { kind: 'resolve', scope })).toEqual({ kind: 'refused' })
  bindings = undefined
  expect(await subject.authorize(access, { kind: 'resolve', scope })).toEqual({
    kind: 'unavailable',
  })
  bindings = {
    lookup: async () => {
      throw new Error('secret')
    },
  }
  expect(await subject.authorize(access, { kind: 'resolve', scope })).toEqual({
    kind: 'unavailable',
  })
  for (verifier of [
    undefined,
    { verify: async () => ({ kind: 'unavailable' as const, diagnostic: 'secret' }) },
    {
      verify: async () => {
        throw new Error('secret')
      },
    },
  ])
    expect(
      await subject.authorize(access, {
        kind: 'inspect',
        tenant,
        acquisition: acquisitionRef('a1'),
      }),
    ).toEqual({ kind: 'unavailable' })
})

describe.each(['acquire', 'inspect-original'] as const)('%s original scope', kind => {
  it.each([
    { state: 'unbound', binding: { kind: 'unbound' }, expected: 'refused' },
    {
      state: 'another tenant',
      binding: { kind: 'bound', tenant: otherTenant },
      expected: 'refused',
    },
    { state: 'missing source', binding: undefined, expected: 'unavailable' },
  ] as const)('returns $expected when the binding is $state', async ({ binding, expected }) => {
    const issued = identity()
    const originalScope = okOf(decodeScopeRef({ ref: 'scope-original' }), 'original scope')
    const asked: string[] = []
    const source: ScopeBindingSource | undefined =
      binding === undefined
        ? undefined
        : {
            lookup: async target => {
              asked.push(target.ref)
              return binding
            },
          }
    const subject = new EntryExecutionEnvironmentAuthority(new Context(), {
      readVerifier: () => issued.verifier,
      readBindings: () => source,
    })
    expect(
      await subject.authorize(
        { principal: issued.principal, tenant },
        { kind, original: originalAt(originalScope) },
      ),
    ).toEqual({ kind: expected })
    expect(asked).toEqual(binding === undefined ? [] : [originalScope.ref])
  })
})

it('retires only the reader generation, including an authorization awaiting its verifier', async () => {
  const issued = identity()
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  let wait = false
  const root = new Context()
  new EntryExecutionEnvironmentAuthority(root, {
    readVerifier: () => ({
      verify: async value => {
        if (wait) {
          entered.resolve()
          await release.promise
        }
        return issued.verifier.verify(value)
      },
    }),
    readBindings: () => undefined,
  })
  async function reader() {
    let pending: Promise<AuthorityDecision<unknown>> | undefined
    const fiber = root.plugin({
      name: 'reader',
      inject: [executionEnvironmentAuthorityKey],
      apply(ctx: Context) {
        pending = ctx
          .get(executionEnvironmentAuthorityKey)!
          .authorize(
            { principal: issued.principal, tenant },
            { kind: 'inspect', tenant, acquisition: acquisitionRef('a1') },
          )
      },
    })
    await fiber
    return { fiber, pending: got(pending, 'pending decision') }
  }
  const first = await reader()
  const second = await reader()
  const a = await first.pending
  const b = await second.pending
  if (a.kind !== 'authorized' || b.kind !== 'authorized') throw new Error('expected authorization')
  expect([a.current(), b.current()]).toEqual([true, true])
  await first.fiber.dispose()
  expect([a.current(), b.current()]).toEqual([false, true])
  wait = true
  const late = await reader()
  await entered.promise
  await late.fiber.dispose()
  release.resolve()
  const c = await late.pending
  if (c.kind !== 'authorized') throw new Error('expected authorization')
  expect(c.current()).toBe(false)
  await second.fiber.dispose()
  expect([a.current(), b.current(), c.current()]).toEqual([false, false, false])
})

it('delegates recovery on every call, never treats a branded access as a grant', async () => {
  let source: RecoveryAuthority | undefined
  const subject = new EntryExecutionRecoveryAuthority(new Context(), () => source)
  const allowed = createRecoveryAccess()
  const other = createRecoveryAccess()
  const seen: RecoveryAccess[] = []
  expect(await subject.authorizeRecovery(allowed, scope, [])).toBe('unavailable')
  source = {
    authorizeRecovery: async access => {
      seen.push(access)
      return access === allowed ? 'authorized' : 'notAuthorized'
    },
  }
  expect(await subject.authorizeRecovery(other, scope, [])).toBe('notAuthorized')
  expect(await subject.authorizeRecovery(allowed, scope, [])).toBe('authorized')
  expect(seen).toEqual([other, allowed])
  source = { authorizeRecovery: async () => 'unavailable' }
  expect(await subject.authorizeRecovery(allowed, scope, [])).toBe('unavailable')
  source = {
    authorizeRecovery: async () => {
      throw new Error('secret')
    },
  }
  expect(await subject.authorizeRecovery(allowed, scope, [])).toBe('unavailable')
  source = { authorizeRecovery: async () => 'invalid' as 'authorized' }
  expect(await subject.authorizeRecovery(allowed, scope, [])).toBe('unavailable')
  source = undefined
  expect(await subject.authorizeRecovery(allowed, scope, [])).toBe('unavailable')
})

it('keeps production module defaults unavailable for scope and recovery', async () => {
  const fixture = fixtureEnv([
    principalIssuerKey,
    executionEnvironmentAuthorityKey,
    executionScopeBindingKey,
    executionRecoveryAuthorityKey,
  ])
  for (const module of createExecutionAuthorityModules()) await fixture.install(module)
  expect(
    await fixture.scopeOf(executionScopeBindingKey).get(executionScopeBindingKey)!.lookup(scope),
  ).toEqual({ kind: 'unavailable' })
  expect(
    await fixture
      .scopeOf(executionRecoveryAuthorityKey)
      .get(executionRecoveryAuthorityKey)!
      .authorizeRecovery(createRecoveryAccess(), scope, []),
  ).toBe('unavailable')
  let source: ScopeBindingSource | undefined
  const bindings = new EntryExecutionScopeBinding(new Context(), () => source)
  for (const kind of ['unbound', 'unavailable', 'unknown'] as const) {
    source = { lookup: async () => ({ kind }) }
    expect(await bindings.lookup(scope)).toEqual({ kind })
  }
  source = { lookup: async () => ({ kind: 'bound', tenant }) }
  expect(await bindings.lookup(scope)).toEqual({ kind: 'bound', tenant })
  source = {
    lookup: async () => {
      throw new Error('secret')
    },
  }
  expect(await bindings.lookup(scope)).toEqual({ kind: 'unavailable' })
})
