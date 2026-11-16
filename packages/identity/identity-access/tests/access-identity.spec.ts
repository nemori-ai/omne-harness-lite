import type { LoginIdentity } from '@omne-harness/access-cordis-contract'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import { createAccessIdentity } from '@omne-harness/identity-access'
import { describe, expect, it } from 'vitest'
import {
  accept,
  createTeam,
  fixture,
  invite,
  removeMember,
  signIn,
  signUp,
  textOf,
  type Fixture,
} from './support.ts'

function port(f: Fixture) {
  return createAccessIdentity({
    operations: f.operations,
    governance: f.governance,
    issuer: f.authority.issuer,
  })
}

async function loginOf(identity: ReturnType<typeof port>, proof: string): Promise<LoginIdentity> {
  const result = await identity.identifyLogin(proof)
  if (result.outcome !== 'identified') throw new Error(`login not identified: ${result.outcome}`)
  return result.login
}

describe('createAccessIdentity', () => {
  it('identifies a valid login and issues the principal acting for its own tenant', async () => {
    const f = fixture()
    const identity = port(f)
    const alice = await signUp(f.operations, 'alice')

    const login = await loginOf(identity, alice.proof)
    const acting = await identity.actFor(login, alice.tenantText)

    expect(acting.outcome).toBe('issued')
    if (acting.outcome !== 'issued') return
    const principal = acting.principal as unknown as ActingForTenantPrincipal
    expect(principal.kind).toBe('acting-for-tenant')
    expect(textOf(principal.tenant)).toBe(alice.tenantText)
    expect(principal.work.owner).toBe('identity-login')
    expect(await f.authority.verifier.verify(principal)).toMatchObject({ kind: 'verified' })
  })

  it('denies a login proof identity does not recognise', async () => {
    const f = fixture()
    const identity = port(f)
    await signUp(f.operations, 'alice')

    expect(await identity.identifyLogin('not-a-login-proof')).toEqual({ outcome: 'denied' })
    expect(await identity.identifyLogin('')).toEqual({ outcome: 'denied' })
  })

  it("denies a target tenant whose account is not the login's account", async () => {
    const f = fixture()
    const identity = port(f)
    const alice = await signUp(f.operations, 'alice')
    const bob = await signUp(f.operations, 'bob')
    const login = await loginOf(identity, alice.proof)

    expect(await identity.actFor(login, bob.tenantText)).toEqual({ outcome: 'denied' })
    expect(await identity.actFor(login, 'not-a-tenant')).toEqual({ outcome: 'denied' })
  })

  it('answers basis-unavailable when identity or the issuer cannot answer', async () => {
    const f = fixture()
    const alice = await signUp(f.operations, 'alice')
    const throwing = createAccessIdentity({
      operations: {
        ...f.operations,
        recognizeLogin: async () => {
          throw new Error('store down')
        },
      },
      governance: f.governance,
      issuer: f.authority.issuer,
    })
    const unavailable = createAccessIdentity({
      operations: {
        ...f.operations,
        recognizeLogin: async () => ({ kind: 'basis-unavailable', diagnostic: 'clock' }),
      },
      governance: f.governance,
      issuer: f.authority.issuer,
    })
    const noIssuer = createAccessIdentity({
      operations: f.operations,
      governance: f.governance,
      issuer: {
        issueSystem: () => ({ failure: { field: 'component', reason: 'type' } }),
        issueActingForTenant: f.authority.issuer.issueActingForTenant,
      },
    })

    const refusingIssuer = createAccessIdentity({
      operations: f.operations,
      governance: f.governance,
      issuer: {
        issueSystem: f.authority.issuer.issueSystem,
        issueActingForTenant: () => ({ failure: { field: 'tenant', reason: 'unminted' } }),
      },
    })

    expect(await throwing.identifyLogin(alice.proof)).toEqual({ outcome: 'basis-unavailable' })
    const refusedLogin = await loginOf(refusingIssuer, alice.proof)
    expect(await refusingIssuer.actFor(refusedLogin, alice.tenantText)).toEqual({
      outcome: 'basis-unavailable',
    })
    expect(await unavailable.identifyLogin(alice.proof)).toEqual({ outcome: 'basis-unavailable' })
    const login = await loginOf(noIssuer, alice.proof)
    expect(await noIssuer.actFor(login, alice.tenantText)).toEqual({
      outcome: 'basis-unavailable',
    })
  })

  it('resumes from the tenant text and the login text the principal that actFor issues', async () => {
    const f = fixture()
    const identity = port(f)
    const alice = await signUp(f.operations, 'alice')
    const acting = await identity.actFor(await loginOf(identity, alice.proof), alice.tenantText)
    if (acting.outcome !== 'issued') throw new Error(`not issued: ${acting.outcome}`)
    const acted = acting.principal as unknown as ActingForTenantPrincipal

    const resumed = identity.resume(alice.tenantText, acted.work.work)

    expect(resumed).toEqual({ outcome: 'issued', principal: acted })
    if (resumed.outcome !== 'issued') return
    expect(resumed.principal).not.toBe(acting.principal)
    expect(await f.authority.verifier.verify(resumed.principal)).toMatchObject({ kind: 'verified' })
  })

  it('resumes the principal of a login that was revoked after it sent the request', async () => {
    const f = fixture()
    const identity = port(f)
    const alice = await signUp(f.operations, 'alice')
    const sending = await signIn(f.operations, 'alice')
    const acting = await identity.actFor(await loginOf(identity, sending.proof), alice.tenantText)
    if (acting.outcome !== 'issued') throw new Error(`not issued: ${acting.outcome}`)
    const acted = acting.principal as unknown as ActingForTenantPrincipal
    const keeper = await f.operations.recognizeLogin({ loginProof: alice.proof })
    const sender = await f.operations.recognizeLogin({ loginProof: sending.proof })
    if (keeper.kind !== 'recognized' || sender.kind !== 'recognized')
      throw new Error('fixture logins were not recognized')

    expect(await f.governance.revokeLogin({ login: keeper.login, target: sender.login })).toEqual({
      kind: 'succeeded',
    })
    expect(await identity.identifyLogin(sending.proof)).toEqual({ outcome: 'denied' })

    expect(identity.resume(alice.tenantText, acted.work.work)).toEqual({
      outcome: 'issued',
      principal: acted,
    })
  })

  it('denies a resume for text that is not a tenant, without calling the issuer', () => {
    const f = fixture()
    let issued = 0
    const identity = createAccessIdentity({
      operations: f.operations,
      governance: f.governance,
      issuer: {
        issueSystem: input => {
          issued += 1
          return f.authority.issuer.issueSystem(input)
        },
        issueActingForTenant: input => {
          issued += 1
          return f.authority.issuer.issueActingForTenant(input)
        },
      },
    })
    expect(identity.resume('not-a-tenant', 'login-text')).toEqual({ outcome: 'denied' })
    expect(issued).toBe(0)
  })

  it('answers basis-unavailable to a resume when the issuer cannot answer', async () => {
    const f = fixture()
    const alice = await signUp(f.operations, 'alice')
    const { issueSystem, issueActingForTenant } = f.authority.issuer
    const withIssuer = (issuer: Parameters<typeof createAccessIdentity>[0]['issuer']) =>
      createAccessIdentity({ operations: f.operations, governance: f.governance, issuer })
    const noSystem = withIssuer({
      issueSystem: () => ({ failure: { field: 'component', reason: 'type' } }),
      issueActingForTenant,
    })
    const refusing = withIssuer({
      issueSystem,
      issueActingForTenant: () => ({ failure: { field: 'tenant', reason: 'unminted' } }),
    })
    const throwing = withIssuer({
      issueSystem,
      issueActingForTenant: () => {
        throw new Error('issuer down')
      },
    })
    for (const identity of [noSystem, refusing, throwing])
      expect(identity.resume(alice.tenantText, 'login-text')).toEqual({
        outcome: 'basis-unavailable',
      })
  })

  it('reports a business access, and rejects when identity cannot take the report', async () => {
    const f = fixture()
    const alice = await signUp(f.operations, 'alice')
    const identity = port(f)
    const login = await loginOf(identity, alice.proof)
    await expect(identity.reportAccess(login)).resolves.toBeUndefined()

    const down = createAccessIdentity({
      operations: f.operations,
      governance: {
        ...f.governance,
        reportBusinessAccess: async () => ({ kind: 'basis-unavailable', diagnostic: 'down' }),
      },
      issuer: f.authority.issuer,
    })
    await expect(down.reportAccess(login)).rejects.toThrow()
  })
})

describe('actFor answers whether the login can act for the tenant now', () => {
  function withGovernance(
    f: Fixture,
    queryOwnMemberships: Fixture['governance']['queryOwnMemberships'],
  ) {
    const queried: unknown[] = []
    const identity = createAccessIdentity({
      operations: f.operations,
      governance: {
        ...f.governance,
        queryOwnMemberships: async input => {
          queried.push(input)
          return queryOwnMemberships(input)
        },
      },
      issuer: f.authority.issuer,
    })
    return { identity, queried }
  }

  it('does not read the memberships when the tenant is not of the login account or is not a tenant', async () => {
    const f = fixture()
    const alice = await signUp(f.operations, 'alice')
    const bob = await signUp(f.operations, 'bob')
    const { identity, queried } = withGovernance(f, f.governance.queryOwnMemberships)
    const login = await loginOf(identity, alice.proof)

    expect(await identity.actFor(login, bob.tenantText)).toEqual({ outcome: 'denied' })
    expect(await identity.actFor(login, 'not-a-tenant')).toEqual({ outcome: 'denied' })
    expect(queried).toEqual([])
  })

  it('answers basis-unavailable when reading the memberships throws', async () => {
    const f = fixture()
    const alice = await signUp(f.operations, 'alice')
    const { identity } = withGovernance(f, async () => {
      throw new Error('store down')
    })
    const login = await loginOf(identity, alice.proof)

    expect(await identity.actFor(login, alice.tenantText)).toEqual({ outcome: 'basis-unavailable' })
  })

  it('answers basis-unavailable when identity cannot answer the memberships', async () => {
    const f = fixture()
    const alice = await signUp(f.operations, 'alice')
    const { identity } = withGovernance(f, async () => ({
      kind: 'basis-unavailable',
      diagnostic: 'down',
    }))
    const login = await loginOf(identity, alice.proof)

    expect(await identity.actFor(login, alice.tenantText)).toEqual({ outcome: 'basis-unavailable' })
  })

  it('denies a login that identity no longer holds as valid', async () => {
    const f = fixture()
    const identity = port(f)
    const alice = await signUp(f.operations, 'alice')
    const login = await loginOf(identity, alice.proof)
    const own = await f.operations.recognizeLogin({ loginProof: alice.proof })
    if (own.kind !== 'recognized') throw new Error('fixture login was not recognized')

    expect(await f.governance.revokeLogin({ login: own.login, target: own.login })).toEqual({
      kind: 'succeeded',
    })

    expect(await identity.actFor(login, alice.tenantText)).toEqual({ outcome: 'denied' })
  })

  it('denies a tenant that the own membership list does not hold', async () => {
    const f = fixture()
    const identity = port(f)
    const alice = await signUp(f.operations, 'alice')
    const bob = await signUp(f.operations, 'bob')
    const team = await createTeam(f, alice)
    const joined = await accept(f, team, bob, await invite(f, team, 'bob'))
    const login = await loginOf(identity, bob.proof)
    expect((await identity.actFor(login, textOf(joined))).outcome).toBe('issued')
    const own = await f.operations.recognizeLogin({ loginProof: bob.proof })
    if (own.kind !== 'recognized') throw new Error('fixture login was not recognized')

    expect(
      await f.governance.switchCurrentTenant({
        login: own.login,
        actingTenant: own.tenant,
        tenant: joined,
      }),
    ).toMatchObject({ kind: 'succeeded' })
    expect(
      await f.governance.leaveOrganization({ login: own.login, actingTenant: joined }),
    ).toEqual({ kind: 'succeeded' })

    expect(await identity.actFor(login, textOf(joined))).toEqual({ outcome: 'denied' })
  })

  it('issues for a tenant of an organization the login belongs to', async () => {
    const f = fixture()
    const identity = port(f)
    const alice = await signUp(f.operations, 'alice')
    const bob = await signUp(f.operations, 'bob')
    const team = await createTeam(f, alice)
    const joined = await accept(f, team, bob, await invite(f, team, 'bob'))

    const acting = await identity.actFor(await loginOf(identity, bob.proof), textOf(joined))

    expect(acting.outcome).toBe('issued')
    if (acting.outcome !== 'issued') return
    const principal = acting.principal as unknown as ActingForTenantPrincipal
    expect(textOf(principal.tenant)).toBe(textOf(joined))
    expect(await f.authority.verifier.verify(principal)).toMatchObject({ kind: 'verified' })
  })

  it('follows the membership: a still valid login stops acting when removed from the organization and acts again when it rejoins', async () => {
    const f = fixture()
    const identity = port(f)
    const alice = await signUp(f.operations, 'alice')
    const bob = await signUp(f.operations, 'bob')
    const team = await createTeam(f, alice)
    const joined = await accept(f, team, bob, await invite(f, team, 'bob'))
    const login = await loginOf(identity, bob.proof)
    expect((await identity.actFor(login, textOf(joined))).outcome).toBe('issued')

    await removeMember(f, team, bob)

    expect(await identity.actFor(login, textOf(joined))).toEqual({ outcome: 'denied' })
    expect((await identity.actFor(login, bob.tenantText)).outcome).toBe('issued')

    await accept(f, team, bob, await invite(f, team, 'bob'))

    expect((await identity.actFor(login, textOf(joined))).outcome).toBe('issued')
  })
})
