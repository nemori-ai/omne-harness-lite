// The handlers of `identity/v1`: each calls the same public entry of identity that the server
// entry's governance location calls, and maps its result the same way. A domain service that is not
// there answers `basis-unavailable`.
import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import type { IdentityGovernance, IdentityOperations } from '@omne-harness/identity'
import { createAccessIdentity, createIdentityOperations } from '@omne-harness/identity-access'
import { describe, expect, it } from 'vitest'
import { call, fixture, signUp, type Fixture } from './support.ts'

type Overrides = Readonly<{
  operations?: Partial<IdentityOperations> | 'absent'
  governance?: Partial<IdentityGovernance> | 'absent'
}>

function handlers(f: Fixture, overrides: Overrides = {}) {
  const operations =
    overrides.operations === 'absent' ? undefined : { ...f.operations, ...overrides.operations }
  const governance =
    overrides.governance === 'absent' ? undefined : { ...f.governance, ...overrides.governance }
  return createIdentityOperations({ operations: () => operations, governance: () => governance })
}

function port(f: Fixture) {
  return createAccessIdentity({
    operations: f.operations,
    governance: f.governance,
    issuer: f.authority.issuer,
  })
}

async function loginOf(f: Fixture, proof: string): Promise<LoginIdentity> {
  const result = await port(f).identifyLogin(proof)
  if (result.outcome !== 'identified') throw new Error('fixture login not identified')
  return result.login
}

async function principalOf(f: Fixture, proof: string, tenant: string): Promise<Principal> {
  const result = await port(f).actFor(await loginOf(f, proof), tenant)
  if (result.outcome !== 'issued') throw new Error('fixture principal not issued')
  return result.principal
}

const ABSENT = { outcome: 'basis-unavailable' }
const credentials = { loginIdentifier: 'alice', credential: 'secret-of-alice' }

describe('register-and-activate', () => {
  it('answers the new account, organization and tenant', async () => {
    const f = fixture()
    const answer = await handlers(f)['register-and-activate'](call(undefined), credentials)
    expect(answer.outcome).toBe('succeeded')
    if (answer.outcome !== 'succeeded') return
    expect(Object.keys(answer.body).sort()).toEqual(['accountId', 'organizationId', 'tenantId'])
  })

  it('answers not-loginable for an identifier already registered', async () => {
    const f = fixture()
    await signUp(f.operations, 'alice')
    expect(await handlers(f)['register-and-activate'](call(undefined), credentials)).toEqual({
      outcome: 'not-loginable',
      body: {},
    })
  })

  it('answers basis-unavailable without the operations service', async () => {
    const f = fixture()
    const h = handlers(f, { operations: 'absent' })
    expect(await h['register-and-activate'](call(undefined), credentials)).toEqual(ABSENT)
  })
})

describe('issue-login', () => {
  it('answers the login with its proof and its login id', async () => {
    const f = fixture()
    await signUp(f.operations, 'alice')
    const answer = await handlers(f)['issue-login'](call(undefined), credentials)
    expect(answer.outcome).toBe('succeeded')
    if (answer.outcome !== 'succeeded') return
    expect(answer.body.loginIdentifier).toBe('alice')
    expect(answer.body.loginProof).not.toBe('')
    expect(answer.body.loginId).toBeDefined()
    expect(await port(f).identifyLogin(answer.body.loginProof)).toMatchObject({
      outcome: 'identified',
    })
  })

  it('answers uniform-auth-failure for a wrong credential', async () => {
    const f = fixture()
    await signUp(f.operations, 'alice')
    const body = { loginIdentifier: 'alice', credential: 'wrong' }
    expect(await handlers(f)['issue-login'](call(undefined), body)).toEqual({
      outcome: 'uniform-auth-failure',
    })
  })

  it('answers basis-unavailable when identity cannot answer, or is not there', async () => {
    const f = fixture()
    const down = handlers(f, {
      operations: { issueLogin: async () => ({ kind: 'basis-unavailable', diagnostic: 'down' }) },
    })
    expect(await down['issue-login'](call(undefined), credentials)).toEqual(ABSENT)
    const absent = handlers(f, { operations: 'absent' })
    expect(await absent['issue-login'](call(undefined), credentials)).toEqual(ABSENT)
  })
})

describe('revoke-login', () => {
  it('revokes another login of the same account, then answers no-change', async () => {
    const f = fixture()
    const first = await signUp(f.operations, 'alice')
    const second = await f.operations.issueLogin(credentials)
    if (second.kind !== 'succeeded') throw new Error('fixture login failed')
    const h = handlers(f)
    const login = await loginOf(f, first.proof)
    const body = { targetLoginId: second.login }

    expect(await h['revoke-login'](call(login), body)).toEqual({ outcome: 'succeeded', body: {} })
    expect(await h['revoke-login'](call(login), body)).toEqual({ outcome: 'no-change', body: {} })
  })

  it("answers not-visible for another account's login", async () => {
    const f = fixture()
    const alice = await signUp(f.operations, 'alice')
    await signUp(f.operations, 'bob')
    const bobs = await f.operations.issueLogin({
      loginIdentifier: 'bob',
      credential: 'secret-of-bob',
    })
    if (bobs.kind !== 'succeeded') throw new Error('fixture login failed')
    const login = await loginOf(f, alice.proof)
    expect(await handlers(f)['revoke-login'](call(login), { targetLoginId: bobs.login })).toEqual({
      outcome: 'not-visible',
      body: {},
    })
  })

  it('answers denied when identity denies the caller', async () => {
    const f = fixture()
    const alice = await signUp(f.operations, 'alice')
    const second = await f.operations.issueLogin(credentials)
    if (second.kind !== 'succeeded') throw new Error('fixture login failed')
    const login = await loginOf(f, alice.proof)
    const h = handlers(f, { governance: { revokeLogin: async () => ({ kind: 'denied' }) } })
    expect(await h['revoke-login'](call(login), { targetLoginId: second.login })).toEqual({
      outcome: 'denied',
    })
  })

  it('answers basis-unavailable without the governance service', async () => {
    const f = fixture()
    const alice = await signUp(f.operations, 'alice')
    const second = await f.operations.issueLogin(credentials)
    if (second.kind !== 'succeeded') throw new Error('fixture login failed')
    const login = await loginOf(f, alice.proof)
    const h = handlers(f, { governance: 'absent' })
    expect(await h['revoke-login'](call(login), { targetLoginId: second.login })).toEqual(ABSENT)
  })
})

describe('query-current-tenant', () => {
  it("answers the login's current tenant", async () => {
    const f = fixture()
    const alice = await signUp(f.operations, 'alice')
    const login = await loginOf(f, alice.proof)
    expect(await handlers(f)['query-current-tenant'](call(login), {})).toEqual({
      outcome: 'succeeded',
      body: { tenantId: alice.tenant },
    })
  })

  it('answers denied when identity denies the login', async () => {
    const f = fixture()
    const alice = await signUp(f.operations, 'alice')
    const login = await loginOf(f, alice.proof)
    const h = handlers(f, { governance: { queryCurrentTenant: async () => ({ kind: 'denied' }) } })
    expect(await h['query-current-tenant'](call(login), {})).toEqual({ outcome: 'denied' })
  })

  it('answers basis-unavailable without the governance service', async () => {
    const f = fixture()
    const alice = await signUp(f.operations, 'alice')
    const login = await loginOf(f, alice.proof)
    const h = handlers(f, { governance: 'absent' })
    expect(await h['query-current-tenant'](call(login), {})).toEqual(ABSENT)
  })
})

describe('query-own-memberships', () => {
  it('answers the memberships of the account, complete', async () => {
    const f = fixture()
    const alice = await signUp(f.operations, 'alice')
    const login = await loginOf(f, alice.proof)
    const answer = await handlers(f)['query-own-memberships'](call(login), {})
    expect(answer.outcome).toBe('succeeded')
    if (answer.outcome !== 'succeeded') return
    expect(answer.body.completeness).toBe('complete')
    expect(answer.body.memberships).toHaveLength(1)
    expect(answer.body.memberships[0]?.tenantId).toBe(alice.tenant)
    expect(typeof answer.body.memberships[0]?.role).toBe('string')
  })

  it('answers denied when identity denies the login', async () => {
    const f = fixture()
    const alice = await signUp(f.operations, 'alice')
    const login = await loginOf(f, alice.proof)
    const h = handlers(f, { governance: { queryOwnMemberships: async () => ({ kind: 'denied' }) } })
    expect(await h['query-own-memberships'](call(login), {})).toEqual({ outcome: 'denied' })
  })

  it('answers basis-unavailable without the governance service', async () => {
    const f = fixture()
    const alice = await signUp(f.operations, 'alice')
    const login = await loginOf(f, alice.proof)
    const h = handlers(f, { governance: 'absent' })
    expect(await h['query-own-memberships'](call(login), {})).toEqual(ABSENT)
  })
})

describe('switch-current-tenant', () => {
  it('passes the login and the acting tenant of the principal, and maps succeeded', async () => {
    const f = fixture()
    const alice = await signUp(f.operations, 'alice')
    const principal = await principalOf(f, alice.proof, alice.tenantText)
    const seen: unknown[] = []
    const h = handlers(f, {
      governance: {
        switchCurrentTenant: async input => {
          seen.push(input)
          return { kind: 'succeeded', tenant: input.tenant }
        },
      },
    })
    expect(await h['switch-current-tenant'](call(principal), { tenantId: alice.tenant })).toEqual({
      outcome: 'succeeded',
      body: { tenantId: alice.tenant },
    })
    const recognized = await f.operations.recognizeLogin({ loginProof: alice.proof })
    if (recognized.kind !== 'recognized') throw new Error('fixture login not recognized')
    expect(seen).toEqual([
      { login: recognized.login, actingTenant: alice.tenant, tenant: alice.tenant },
    ])
  })

  it('answers no-change for the tenant already selected', async () => {
    const f = fixture()
    const alice = await signUp(f.operations, 'alice')
    const principal = await principalOf(f, alice.proof, alice.tenantText)
    expect(
      await handlers(f)['switch-current-tenant'](call(principal), { tenantId: alice.tenant }),
    ).toEqual({ outcome: 'no-change', body: {} })
  })

  it('answers denied for a tenant the account is not a member of', async () => {
    const f = fixture()
    const alice = await signUp(f.operations, 'alice')
    const bob = await signUp(f.operations, 'bob')
    const principal = await principalOf(f, alice.proof, alice.tenantText)
    expect(
      await handlers(f)['switch-current-tenant'](call(principal), { tenantId: bob.tenant }),
    ).toEqual({ outcome: 'denied' })
  })

  it('answers basis-unavailable without the governance service', async () => {
    const f = fixture()
    const alice = await signUp(f.operations, 'alice')
    const principal = await principalOf(f, alice.proof, alice.tenantText)
    const h = handlers(f, { governance: 'absent' })
    expect(await h['switch-current-tenant'](call(principal), { tenantId: alice.tenant })).toEqual(
      ABSENT,
    )
  })
})
