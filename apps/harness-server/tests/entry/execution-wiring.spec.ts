import { expect, it } from 'vitest'
import {
  executionEnvironmentAuthorityKey,
  executionRecoveryAuthorityKey,
  executionScopeBindingKey,
} from '@omne-harness/execution-environment-cordis-contract/cordis'
import { createRecoveryAccess } from '@omne-harness/execution-environment-contract'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import { runtimeContextTrustKey } from '@omne-harness/runtime-context-cordis-contract/cordis'
import {
  sessionPrincipalBindingsKey,
  sessionScopeLookupKey,
  sessionScopeOwnersKey,
} from '@omne-harness/session-cordis-contract/cordis'
import { entryObjects } from '../../src/entry/index.ts'
import {
  executionAuthorities,
  scopedRuntimeContextTrust,
} from '../../src/entry/execution-wiring.ts'
import { principalIssuer } from '../../src/entry/principals.ts'
import { fixtureEnv, fixtureTenant, got, okOf } from './support.ts'

const tenant = fixtureTenant('a')
const tenantB = fixtureTenant('b')
const scope = okOf(decodeScopeRef({ ref: 'wiring-scope' }), 'scope')

it('registers the runtime-context narrowing and the three execution modules once each', () => {
  const names = entryObjects.map(module => module.name)
  expect(new Set(names).size).toBe(names.length)
  for (const key of [
    runtimeContextTrustKey,
    executionEnvironmentAuthorityKey,
    executionScopeBindingKey,
    executionRecoveryAuthorityKey,
  ])
    expect(names.filter(name => name === key)).toHaveLength(1)
  expect(executionAuthorities.map(module => module.name)).toEqual([
    executionEnvironmentAuthorityKey,
    executionScopeBindingKey,
    executionRecoveryAuthorityKey,
  ])
})

it('answers unavailable for scope bindings and recovery while sessionScopeLookup and AD-15 have no provider', async () => {
  const keys = [
    principalIssuerKey,
    runtimeContextTrustKey,
    executionEnvironmentAuthorityKey,
    executionScopeBindingKey,
    executionRecoveryAuthorityKey,
    sessionPrincipalBindingsKey,
  ]
  const fixture = fixtureEnv(keys)
  fixture.scopeOf(sessionPrincipalBindingsKey).provide(sessionPrincipalBindingsKey, {
    read: async (input: { tenant: typeof tenant; session: string }) => ({
      ok: {
        kind: 'bound',
        ...input,
        source: { owner: 'test', record: 'r1', revision: '1', digest: 'd' },
      },
    }),
  })
  await fixture.install(principalIssuer)
  await fixture.install(scopedRuntimeContextTrust)
  for (const module of executionAuthorities) await fixture.install(module)

  const bindings = got(
    fixture.scopeOf(executionScopeBindingKey).get(executionScopeBindingKey),
    'execution bindings',
  )
  expect(await bindings.lookup(scope)).toEqual({ kind: 'unavailable' })
  const trust = got(
    fixture.scopeOf(runtimeContextTrustKey).get(runtimeContextTrustKey),
    'runtime context trust',
  )
  expect(await trust.bindings.lookup(scope)).toEqual({ kind: 'unavailable' })
  const recovery = got(
    fixture.scopeOf(executionRecoveryAuthorityKey).get(executionRecoveryAuthorityKey),
    'execution recovery',
  )
  expect(await recovery.authorizeRecovery(createRecoveryAccess(), scope, [])).toBe('unavailable')
})

async function wired() {
  const fixture = fixtureEnv([
    principalIssuerKey,
    runtimeContextTrustKey,
    executionEnvironmentAuthorityKey,
    executionScopeBindingKey,
    executionRecoveryAuthorityKey,
    sessionPrincipalBindingsKey,
    sessionScopeLookupKey,
    sessionScopeOwnersKey,
  ])
  fixture.scopeOf(sessionPrincipalBindingsKey).provide(sessionPrincipalBindingsKey, {
    read: async (input: { tenant: typeof tenant; session: string }) => ({
      ok: {
        kind: 'bound',
        ...input,
        source: { owner: 'test', record: 'r1', revision: '1', digest: 'd' },
      },
    }),
  })
  await fixture.install(principalIssuer)
  await fixture.install(scopedRuntimeContextTrust)
  for (const module of executionAuthorities) await fixture.install(module)
  const bindings = got(
    fixture.scopeOf(executionScopeBindingKey).get(executionScopeBindingKey),
    'execution bindings',
  )
  const trust = got(
    fixture.scopeOf(runtimeContextTrustKey).get(runtimeContextTrustKey),
    'runtime context trust',
  )
  return { fixture, bindings, trust }
}

const lookupAs = (owner: typeof tenant, session: string) => ({
  lookup: async () => ({ kind: 'known', tenant: owner, session, generation: 'g1' }),
})

it('reads the scope owner from the trusted sessionScopeLookup: the binding is bound to its tenant', async () => {
  const { fixture, bindings, trust } = await wired()
  fixture.scopeOf(sessionScopeLookupKey).provide(sessionScopeLookupKey, lookupAs(tenant, 'ses-a'))
  expect(await bindings.lookup(scope)).toEqual({ kind: 'bound', tenant })
  expect(await trust.bindings.lookup(scope)).toEqual({ kind: 'bound', tenant })
})

it('does not read a same-name sessionScopeLookup on the root: a scope of tenant A is never bound to tenant B (R2-D189 B1)', async () => {
  const { fixture, bindings, trust } = await wired()
  fixture.root.provide(sessionScopeLookupKey, lookupAs(tenantB, 'ses-b'))
  expect(await bindings.lookup(scope)).toEqual({ kind: 'unavailable' })
  expect(await trust.bindings.lookup(scope)).toEqual({ kind: 'unavailable' })
  fixture.scopeOf(sessionScopeLookupKey).provide(sessionScopeLookupKey, lookupAs(tenant, 'ses-a'))
  expect(await bindings.lookup(scope)).toEqual({ kind: 'bound', tenant })
})

const ownersAs = (owner: typeof tenant, session: string) => ({
  lookup: async () => ({ ok: { kind: 'owned', tenant: owner, session, generation: '1' } }),
})
const unknownLookup = { lookup: async () => ({ kind: 'unknown' }) }

it('reads the durable owner when the in-process index has not seen the scope, as after a restart', async () => {
  const { fixture, bindings, trust } = await wired()
  fixture.scopeOf(sessionScopeLookupKey).provide(sessionScopeLookupKey, unknownLookup)
  expect(await bindings.lookup(scope)).toEqual({ kind: 'unknown' })
  fixture.scopeOf(sessionScopeOwnersKey).provide(sessionScopeOwnersKey, ownersAs(tenant, 'ses-a'))
  expect(await bindings.lookup(scope)).toEqual({ kind: 'bound', tenant })
  expect(await trust.bindings.lookup(scope)).toEqual({ kind: 'bound', tenant })
})

it('reads the durable owner when the index is absent, and never a same-name owner source on the root', async () => {
  const { fixture, bindings } = await wired()
  fixture.root.provide(sessionScopeOwnersKey, ownersAs(tenantB, 'ses-b'))
  expect(await bindings.lookup(scope)).toEqual({ kind: 'unavailable' })
  fixture.scopeOf(sessionScopeOwnersKey).provide(sessionScopeOwnersKey, ownersAs(tenant, 'ses-a'))
  expect(await bindings.lookup(scope)).toEqual({ kind: 'bound', tenant })
})
