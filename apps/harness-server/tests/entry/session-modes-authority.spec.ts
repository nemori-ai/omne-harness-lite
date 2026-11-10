import { expect, it } from 'vitest'
import { inProcessPrincipalAuthority } from '@omne-harness/identity'
import { createRuntimeContextAuthority } from '../../src/entry/runtime-context-trust.ts'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import type { SessionId } from '@omne-harness/session-contract'
import {
  sessionModesPrincipals,
  sessionModesPrincipalsKey,
} from '../../src/entry/session-modes-principals.ts'
import { sessionWorkIssuerOf, verifierOf } from '../../src/entry/principals.ts'
import { fixtureEnv, fixtureTenant, okOf } from './support.ts'

it('allows the issued tenant modes producer to register only its own publication', async () => {
  const { issuer, verifier } = inProcessPrincipalAuthority()
  const tenant = fixtureTenant('a')
  const actor = okOf(issuer.issueSystem({ component: 'sessionModesPrincipals' }), 'actor')
  const principal = okOf(
    issuer.issueActingForTenant({
      actor,
      tenant,
      work: { owner: 'harness.session-context', work: 'modes' },
    }),
    'principal',
  )
  const authority = createRuntimeContextAuthority({ verifier })
  const action = {
    kind: 'register' as const,
    tenant,
    key: 'session.modes' as const,
    producer: { producer: '@omne-harness/session-adapters/session.modes' },
  }
  expect(await authority.producer(principal, action)).toMatchObject({
    kind: 'authorized',
    principal,
  })
  expect(await authority.producer(structuredClone(principal), action)).toEqual({ kind: 'refused' })
  expect(await authority.producer(principal, { ...action, tenant: fixtureTenant('b') })).toEqual({
    kind: 'refused',
  })
  expect(await authority.producer(principal, { ...action, key: 'other.block' })).toEqual({
    kind: 'refused',
  })
  expect(
    await authority.producer(principal, { ...action, producer: { producer: 'other' } }),
  ).toEqual({ kind: 'refused' })
})

it('issues the narrow modes role and supplies with the confirmed Session work principal', async () => {
  const fixture = fixtureEnv([sessionModesPrincipalsKey])
  try {
    await fixture.install(sessionModesPrincipals)
    const service = fixture.scopeOf(sessionModesPrincipalsKey).get(sessionModesPrincipalsKey)
    const tenant = fixtureTenant('a')
    const session = 'ses_1' as SessionId
    const principal = service?.forTenant(tenant)
    expect(principal).toMatchObject({
      kind: 'acting-for-tenant',
      tenant,
      actor: { component: 'sessionModesPrincipals' },
      work: { owner: 'harness.session-context', work: 'modes' },
    })
    expect(fixture.root.get(sessionModesPrincipalsKey)).toBeUndefined()
    expect(service).not.toHaveProperty('issueSystem')
    const verifier = verifierOf(fixture.env)
    const scope = okOf(decodeScopeRef({ ref: 'scope:modes' }), 'scope')
    const owner = { kind: 'bound' as const, tenant, session, generation: '1' }
    const original = okOf(sessionWorkIssuerOf(fixture.env)({ tenant, session }), 'coordinator')
    const action = {
      kind: 'supply' as const,
      tenant,
      scope,
      key: 'session.modes' as const,
      producer: { producer: '@omne-harness/session-adapters/session.modes' },
    }
    const authority = createRuntimeContextAuthority({
      verifier,
      scopeOwners: { lookup: async () => owner },
      sessionWork: async input => {
        expect(input).toEqual({ actor: 'coordinator', tenant, session })
        return { ok: original }
      },
    })
    expect(await authority.producer(principal, action)).toMatchObject({
      kind: 'authorized',
      principal: original,
    })
    expect(await authority.producer(principal, { ...action, kind: 'publish' })).toMatchObject({
      kind: 'authorized',
      principal,
    })
    expect(await authority.producer(principal, { ...action, kind: 'invalidate' })).toMatchObject({
      kind: 'authorized',
      principal,
    })
    expect(
      await authority.producer(principal, {
        kind: 'invalidate-tenant',
        tenant,
        key: action.key,
        producer: action.producer,
      }),
    ).toMatchObject({ kind: 'authorized' })

    const wrongSession = okOf(
      sessionWorkIssuerOf(fixture.env)({ tenant, session: 'ses_other' }),
      'wrong coordinator',
    )
    const wrong = createRuntimeContextAuthority({
      verifier,
      scopeOwners: { lookup: async () => owner },
      sessionWork: async () => ({ ok: wrongSession }),
    })
    expect(await wrong.producer(principal, action)).toEqual({ kind: 'refused' })
    const absent = createRuntimeContextAuthority({
      verifier,
      scopeOwners: { lookup: async () => owner },
    })
    expect(await absent.producer(principal, action)).toEqual({ kind: 'unavailable' })
    const noScope = createRuntimeContextAuthority({ verifier })
    expect(await noScope.producer(principal, action)).toEqual({ kind: 'unavailable' })
    for (const ownership of [
      { ...owner, tenant: fixtureTenant('b') },
      { kind: 'unbound' as const },
    ]) {
      const foreign = createRuntimeContextAuthority({
        verifier,
        scopeOwners: { lookup: async () => ownership },
      })
      expect(await foreign.producer(principal, action)).toEqual({ kind: 'refused' })
    }
    for (const kind of ['unavailable', 'unknown'] as const) {
      const missing = createRuntimeContextAuthority({
        verifier,
        scopeOwners: { lookup: async () => ({ kind }) },
      })
      expect(await missing.producer(principal, action)).toEqual({ kind })
    }
    const failing = createRuntimeContextAuthority({
      verifier,
      scopeOwners: {
        lookup: async () => {
          throw new Error('private')
        },
      },
    })
    expect(await failing.producer(principal, action)).toEqual({ kind: 'unavailable' })
    await fixture.root.fiber.dispose()
    expect(service?.forTenant(tenant)).toBeUndefined()
  } finally {
    await fixture.root.fiber.dispose()
  }
})
