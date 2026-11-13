// The entry's identity port (`AccessIdentity`) over the identity double and the in-process
// principal authority: recognising a login, issuing the principal for a login and a tenant, and
// reporting a business access. The rules are those of the server entry's identity steps.
import type { LoginIdentity } from '@omne-harness/access-cordis-contract'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import { createAccessIdentity } from '@omne-harness/identity-access'
import { describe, expect, it } from 'vitest'
import { fixture, signUp, textOf, type Fixture } from './support.ts'

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
