import type { LoginIdentity } from '@omne-harness/access-cordis-contract'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import { createAccessIdentity, createMemberActing } from '@omne-harness/identity-access'
import { describe, expect, it } from 'vitest'
import { fixture, signIn, signUp, textOf, type Fixture } from './support.ts'

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
      createAccessIdentity({
        operations: f.operations,
        governance: f.governance,
        issuer,
      })
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

describe('actFor issues for a tenant of the login account and leaves membership to the service the principal reaches', () => {
  it('issues for a tenant the standing calls not a member, and never reads the standing', async () => {
    const f = fixture()
    const identity = port(f)
    const alice = await signUp(f.operations, 'alice')
    const login = await loginOf(identity, alice.proof)
    f.standing.answer('not-member')

    const acting = await identity.actFor(login, alice.tenantText)

    expect(acting.outcome).toBe('issued')
    expect(f.standing.asked).toEqual([])
  })
})

describe('createMemberActing answers whether the login can act for a target tenant now', () => {
  async function actingLogin(f: Fixture) {
    const identity = port(f)
    const member = createMemberActing({ identity, standing: f.standing.source })
    const alice = await signUp(f.operations, 'alice')
    return { identity, member, alice, login: await loginOf(identity, alice.proof) }
  }

  it('does not read the standing when the tenant is not of the login account or is not a tenant', async () => {
    const f = fixture()
    const { member, login } = await actingLogin(f)
    const bob = await signUp(f.operations, 'bob')

    expect(await member(login, bob.tenantText)).toEqual({ outcome: 'denied' })
    expect(await member(login, 'not-a-tenant')).toEqual({ outcome: 'denied' })
    expect(f.standing.asked).toEqual([])
  })

  it('answers basis-unavailable when reading the standing throws', async () => {
    const f = fixture()
    const { member, alice, login } = await actingLogin(f)
    f.standing.answer('throws')

    expect(await member(login, alice.tenantText)).toEqual({ outcome: 'basis-unavailable' })
  })

  it('answers basis-unavailable when the standing is unavailable', async () => {
    const f = fixture()
    const { member, alice, login } = await actingLogin(f)
    f.standing.answer('unavailable')

    expect(await member(login, alice.tenantText)).toEqual({ outcome: 'basis-unavailable' })
  })

  it('denies a tenant the login account is not a member of', async () => {
    const f = fixture()
    const { member, alice, login } = await actingLogin(f)
    f.standing.answer('not-member')

    expect(await member(login, alice.tenantText)).toEqual({ outcome: 'denied' })
  })

  it('answers what the port answers once the standing says member: basis-unavailable when it cannot issue', async () => {
    const f = fixture()
    const { alice, login } = await actingLogin(f)
    const member = createMemberActing({
      identity: { actFor: async () => ({ outcome: 'basis-unavailable' }) },
      standing: f.standing.source,
    })

    expect(await member(login, alice.tenantText)).toEqual({ outcome: 'basis-unavailable' })
  })

  it('issues a verifiable principal for a member tenant, asking the standing about exactly that tenant', async () => {
    const f = fixture()
    const { member, alice, login } = await actingLogin(f)

    const acting = await member(login, alice.tenantText)

    expect(acting.outcome).toBe('issued')
    expect(f.standing.asked.map(textOf)).toEqual([alice.tenantText])
    if (acting.outcome !== 'issued') return
    const principal = acting.principal as unknown as ActingForTenantPrincipal
    expect(textOf(principal.tenant)).toBe(alice.tenantText)
    expect(await f.authority.verifier.verify(principal)).toMatchObject({ kind: 'verified' })
  })

  it('reads the standing on every call: the answer follows it and nothing is cached', async () => {
    const f = fixture()
    const { member, alice, login } = await actingLogin(f)

    expect((await member(login, alice.tenantText)).outcome).toBe('issued')
    f.standing.answer('not-member')
    expect(await member(login, alice.tenantText)).toEqual({ outcome: 'denied' })
    f.standing.answer('member')
    expect((await member(login, alice.tenantText)).outcome).toBe('issued')
    expect(f.standing.asked).toHaveLength(3)
  })

  it('still issues for a login revoked after it was identified: whether a login is still valid belongs to the entry pipeline', async () => {
    const f = fixture()
    const identity = port(f)
    const member = createMemberActing({ identity, standing: f.standing.source })
    const alice = await signUp(f.operations, 'alice')
    const sending = await signIn(f.operations, 'alice')
    const login = await loginOf(identity, sending.proof)
    const keeper = await f.operations.recognizeLogin({ loginProof: alice.proof })
    const sender = await f.operations.recognizeLogin({ loginProof: sending.proof })
    if (keeper.kind !== 'recognized' || sender.kind !== 'recognized')
      throw new Error('fixture logins were not recognized')

    expect(await f.governance.revokeLogin({ login: keeper.login, target: sender.login })).toEqual({
      kind: 'succeeded',
    })

    const acting = await member(login, alice.tenantText)
    expect(acting.outcome).toBe('issued')
    if (acting.outcome !== 'issued') return
    expect(await f.authority.verifier.verify(acting.principal)).toMatchObject({ kind: 'verified' })
    expect(await identity.identifyLogin(sending.proof)).toEqual({ outcome: 'denied' })
  })
})
