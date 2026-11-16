import type { Principal } from '@omne-harness/access-cordis-contract'
import {
  createAccessIdentity,
  createIdentityOperations,
  createMemberActing,
} from '@omne-harness/identity-access'
import { describe, expect, it } from 'vitest'
import { call, fixture, signUp, textOf, type Fixture, type SignedIn } from './support.ts'

function world(f: Fixture) {
  const identity = createAccessIdentity({
    operations: f.operations,
    governance: f.governance,
    issuer: f.authority.issuer,
  })
  const handlers = createIdentityOperations({
    operations: () => f.operations,
    governance: () => f.governance,
  })
  const loginOf = async (signed: SignedIn) => {
    const identified = await identity.identifyLogin(signed.proof)
    if (identified.outcome !== 'identified') throw new Error('fixture login not identified')
    return identified.login
  }
  const acting = async (signed: SignedIn, tenant: string): Promise<Principal> => {
    const issued = await identity.actFor(await loginOf(signed), tenant)
    if (issued.outcome !== 'issued') throw new Error(`principal not issued: ${issued.outcome}`)
    return issued.principal
  }
  return { identity, handlers, loginOf, acting }
}

async function removedFromTheTeam() {
  const f = fixture()
  const w = world(f)
  const alice = await signUp(f.operations, 'alice')
  const bob = await signUp(f.operations, 'bob')

  const created = await w.handlers['create-organization'](
    call(await w.acting(alice, alice.tenantText)),
    { createCallId: 'c-1', name: 'Team', governanceModelId: 'default-team' },
  )
  if (created.outcome !== 'succeeded') throw new Error(`team not created: ${created.outcome}`)
  const team = created.body.organizationId
  const switched = await w.handlers['switch-current-tenant'](
    call(await w.acting(alice, alice.tenantText)),
    { tenantId: created.body.tenantId },
  )
  if (switched.outcome !== 'succeeded') throw new Error(`alice did not switch: ${switched.outcome}`)
  const aliceInTeam = textOf(created.body.tenantId)

  const invite = async () => {
    const issued = await w.handlers['issue-member-invitation'](
      call(await w.acting(alice, aliceInTeam)),
      { invitedLoginIdentifier: 'bob' },
    )
    if (issued.outcome !== 'succeeded') throw new Error(`not invited: ${issued.outcome}`)
    return issued.body.invitationId
  }

  const first = await w.handlers['accept-member-invitation'](
    call(await w.acting(bob, bob.tenantText)),
    { invitationId: await invite(), expectedState: 'open' },
  )
  if (first.outcome !== 'succeeded') throw new Error(`bob did not join: ${first.outcome}`)
  const memberships = await w.handlers['query-own-memberships'](call(await w.loginOf(bob)), {})
  if (memberships.outcome !== 'succeeded') throw new Error('memberships not read')
  const inTeam = memberships.body.memberships.find(entry => entry.organizationId === team)
  if (inTeam === undefined) throw new Error('bob has no tenant in the team')
  const bobInTeam = textOf(inTeam.tenantId)
  const moved = await w.handlers['switch-current-tenant'](
    call(await w.acting(bob, bob.tenantText)),
    { tenantId: inTeam.tenantId },
  )
  if (moved.outcome !== 'succeeded') throw new Error(`bob did not switch: ${moved.outcome}`)

  const bobLogin = await f.operations.recognizeLogin({ loginProof: bob.proof })
  if (bobLogin.kind !== 'recognized') throw new Error('bob is not recognized')
  const removed = await w.handlers['remove-member'](call(await w.acting(alice, aliceInTeam)), {
    organizationId: team,
    accountId: bobLogin.account,
    expectedRole: 'member',
  })
  if (removed.outcome !== 'succeeded') throw new Error(`bob not removed: ${removed.outcome}`)

  return { f, w, bob, bobInTeam, team, invite }
}

describe('a login whose selection is a tenant it was removed from', () => {
  it('still gets the acting principal for that selection, while a business row is refused the same tenant', async () => {
    const { f, w, bob, bobInTeam } = await removedFromTheTeam()
    const login = await w.loginOf(bob)

    expect((await w.identity.actFor(login, bobInTeam)).outcome).toBe('issued')

    f.standing.answer('not-member')
    const member = createMemberActing({ identity: w.identity, standing: f.standing.source })
    expect(await member(login, bobInTeam)).toEqual({ outcome: 'denied' })
  })

  it('accepts a new invitation from that selection and is a member of the same tenant again', async () => {
    const { w, bob, bobInTeam, team, invite } = await removedFromTheTeam()
    const invitationId = await invite()

    const accepted = await w.handlers['accept-member-invitation'](
      call(await w.acting(bob, bobInTeam)),
      { invitationId, expectedState: 'open' },
    )

    expect(accepted).toEqual({ outcome: 'succeeded', body: { invitationId, state: 'accepted' } })
    const memberships = await w.handlers['query-own-memberships'](call(await w.loginOf(bob)), {})
    if (memberships.outcome !== 'succeeded') throw new Error('memberships not read')
    const again = memberships.body.memberships.find(entry => entry.organizationId === team)
    expect(again === undefined ? undefined : textOf(again.tenantId)).toBe(bobInTeam)
  })

  it('switches from that selection back to a tenant it is still a member of', async () => {
    const { w, bob, bobInTeam } = await removedFromTheTeam()

    const back = await w.handlers['switch-current-tenant'](call(await w.acting(bob, bobInTeam)), {
      tenantId: bob.tenant,
    })

    expect(back.outcome).toBe('succeeded')
    const current = await w.handlers['query-current-tenant'](call(await w.loginOf(bob)), {})
    expect(current).toEqual({ outcome: 'succeeded', body: { tenantId: bob.tenant } })
  })
})
