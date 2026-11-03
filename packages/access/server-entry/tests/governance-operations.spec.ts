// The eighteen governed operations of the governance location (identity spec F2, F3): steps 4 and 6
// here, the rest through identity's governance port, every port outcome mapped to its public
// outcome, body and status code; a uniform `denied` and `not-visible`; the two classes of port
// rejection; and diagnostics without a proof, credential, login identifier or login id.
import { afterEach, describe, expect, it } from 'vitest'
import type { IdentityGovernance, IdentityOperations } from '@omne-harness/identity'
import { parseDuration } from '@omne-harness/utc-instant'
import {
  GOVERNANCE_PATH,
  IDLE_PERIOD,
  anotherLogin,
  governance,
  governed,
  login,
  send,
  startFixture,
  type Fixture,
  type HttpReply,
  type Login,
} from './support/harness.ts'

let fixture: Fixture | undefined
afterEach(async () => {
  await fixture?.stop()
  fixture = undefined
})

type Json = Readonly<{
  protocolVersion: string
  messageId: string
  outcome: string
  body: Record<string, unknown>
}>

function json(reply: HttpReply): Json {
  return reply.json as Json
}

/** Sends one governed message of `who`. `acting` null leaves the acting tenant out. */
function call(
  who: Login,
  operation: string,
  body: unknown,
  acting: string | null = who.tenantText,
  messageId = 'm-1',
): Promise<HttpReply> {
  if (fixture === undefined) throw new Error('no fixture')
  return send(fixture.port, GOVERNANCE_PATH, {
    body: governed(who, operation, body, acting, messageId),
  })
}

/** Asserts the status code and the outcome, and returns the body. */
function expectAnswer(
  reply: HttpReply,
  status: number,
  outcome: string,
  label: string,
): Record<string, unknown> {
  expect({ status: reply.status, outcome: json(reply).outcome }, label).toEqual({ status, outcome })
  return json(reply).body
}

const MODEL = 'default-team'
const UNKNOWN_LOGIN = 'lgn_abcdefghjkmnpqrstvwxyz2345'

/** A login acting for another tenant: the same proof, the tenant it switched to. */
function actingAs(who: Login, tenantText: string): Login {
  return { ...who, tenantText }
}

describe('organizations, current tenant and invitations', () => {
  it('maps every outcome of the organization, tenant and invitation operations', async () => {
    fixture = await startFixture()
    const alice = await login(fixture, 'alice')
    const bob = await login(fixture, 'bob')

    // create-organization and its recall.
    const create = { createCallId: 'c-1', name: 'Team', governanceModelId: MODEL }
    const created = expectAnswer(
      await call(alice, 'create-organization', create),
      200,
      'succeeded',
      'create',
    )
    expect(Object.keys(created).sort()).toEqual(['organizationId', 'tenantId'])
    const team = created.organizationId as string
    const aliceTeam = created.tenantId as string
    expect(
      expectAnswer(await call(alice, 'create-organization', create), 200, 'succeeded', 'replay'),
    ).toEqual(created)
    expect(
      expectAnswer(
        await call(alice, 'create-organization', { ...create, name: 'Other' }),
        409,
        'conflict',
        'create conflict',
      ),
    ).toEqual({})
    expectAnswer(
      await call(alice, 'create-organization', {
        createCallId: 'c-2',
        name: 'Team',
        governanceModelId: 'other-model',
      }),
      403,
      'denied',
      'unknown model',
    )
    const recall = { targetCreateCallId: 'c-1', name: 'Team', governanceModelId: MODEL }
    expect(
      expectAnswer(
        await call(alice, 'query-create-organization', recall, null),
        200,
        'succeeded',
        'recall',
      ),
    ).toEqual(created)
    expectAnswer(
      await call(alice, 'query-create-organization', { ...recall, name: 'Other' }, null),
      409,
      'conflict',
      'recall conflict',
    )
    const unknownRecall = await call(
      alice,
      'query-create-organization',
      { ...recall, targetCreateCallId: 'c-9' },
      null,
    )
    expect(expectAnswer(unknownRecall, 500, 'unknown', 'recall unknown')).toEqual({})
    expect(unknownRecall.headers.connection).not.toBe('close')

    // switch-current-tenant and query-current-tenant.
    expect(
      expectAnswer(
        await call(alice, 'switch-current-tenant', { tenantId: aliceTeam }),
        200,
        'succeeded',
        'switch',
      ),
    ).toEqual({ tenantId: aliceTeam })
    const stale = await call(alice, 'switch-current-tenant', { tenantId: aliceTeam })
    expect(expectAnswer(stale, 403, 'denied', 'switch with the old acting tenant')).toEqual({})
    const aliceT = actingAs(alice, aliceTeam)
    expect(
      expectAnswer(
        await call(aliceT, 'switch-current-tenant', { tenantId: aliceTeam }),
        200,
        'no-change',
        'switch to the same',
      ),
    ).toEqual({})
    expect(
      expectAnswer(await call(alice, 'query-current-tenant', {}, null), 200, 'succeeded', 'cur'),
    ).toEqual({ tenantId: aliceTeam })

    // issue-member-invitation.
    const issued = expectAnswer(
      await call(aliceT, 'issue-member-invitation', { invitedLoginIdentifier: 'bob' }),
      200,
      'succeeded',
      'issue',
    )
    expect(Object.keys(issued).sort()).toEqual(['expiresAt', 'invitationId', 'state'])
    expect(issued.state).toBe('open')
    const first = issued.invitationId as string
    expectAnswer(
      await call(aliceT, 'issue-member-invitation', { invitedLoginIdentifier: 'nobody' }),
      404,
      'not-visible',
      'issue to nobody',
    )
    expectAnswer(
      await call(aliceT, 'issue-member-invitation', {
        invitedLoginIdentifier: 'bob',
        duration: 'P1D',
      }),
      403,
      'denied',
      'a duration that is not SI seconds',
    )
    const second = expectAnswer(
      await call(aliceT, 'issue-member-invitation', {
        invitedLoginIdentifier: 'bob',
        duration: 'PT60S',
      }),
      200,
      'succeeded',
      'issue with a duration',
    ).invitationId as string
    expectAnswer(
      await call(alice, 'issue-member-invitation', { invitedLoginIdentifier: 'bob' }),
      403,
      'denied',
      'issue with an acting tenant that is not the selection',
    )

    // The three invitation reads.
    const received = expectAnswer(
      await call(bob, 'query-received-invitations', {}, null),
      200,
      'succeeded',
      'received',
    )
    expect(received.completeness).toBe('complete')
    const items = received.invitations as Record<string, unknown>[]
    expect(items.map(item => item.invitationId).sort()).toEqual([first, second].sort())
    expect(Object.keys(items[0] ?? {}).sort()).toEqual([
      'expiresAt',
      'invitationId',
      'invitedAccountId',
      'organizationId',
      'state',
    ])
    expect(items[0]?.organizationId).toBe(team)
    expect(items[0]?.invitedAccountId).toBe(bob.accountText)
    const issuedList = expectAnswer(
      await call(aliceT, 'query-issued-invitations', {}),
      200,
      'succeeded',
      'issued list',
    )
    expect((issuedList.invitations as unknown[]).length).toBe(2)
    expectAnswer(
      await call(bob, 'query-issued-invitations', {}),
      403,
      'denied',
      'issued list of a personal organization',
    )
    const one = expectAnswer(
      await call(bob, 'query-invitation', { invitationId: first }),
      200,
      'succeeded',
      'one invitation',
    )
    expect(one.state).toBe('open')
    expect(one.invitationId).toBe(first)
    expectAnswer(
      await call(bob, 'query-invitation', { invitationId: 'inv-none' }),
      404,
      'not-visible',
      'an unknown invitation',
    )

    // Accept, reject and withdraw, and their replays.
    const disposition = (invitationId: string) => ({ invitationId, expectedState: 'open' })
    expect(
      expectAnswer(
        await call(bob, 'accept-member-invitation', disposition(first)),
        200,
        'succeeded',
        'accept',
      ),
    ).toEqual({ invitationId: first, state: 'accepted' })
    expect(
      expectAnswer(
        await call(bob, 'accept-member-invitation', disposition(first)),
        200,
        'no-change',
        'accept again',
      ),
    ).toEqual({ invitationId: first, state: 'accepted' })
    expect(
      expectAnswer(
        await call(bob, 'reject-member-invitation', disposition(second)),
        200,
        'succeeded',
        'reject',
      ),
    ).toEqual({ invitationId: second, state: 'rejected' })
    expectAnswer(
      await call(alice, 'accept-member-invitation', disposition(second), aliceTeam),
      403,
      'denied',
      'accept by an account that was not invited',
    )
    const third = expectAnswer(
      await call(aliceT, 'issue-member-invitation', { invitedLoginIdentifier: 'bob' }),
      200,
      'succeeded',
      'issue a third',
    ).invitationId as string
    expect(
      expectAnswer(
        await call(aliceT, 'withdraw-member-invitation', disposition(third)),
        200,
        'succeeded',
        'withdraw',
      ),
    ).toEqual({ invitationId: third, state: 'withdrawn' })
    expect(
      expectAnswer(
        await call(bob, 'accept-member-invitation', disposition(third)),
        200,
        'no-change',
        'accept a withdrawn invitation',
      ),
    ).toEqual({ invitationId: third, state: 'withdrawn' })
    expectAnswer(
      await call(bob, 'withdraw-member-invitation', disposition('inv-none')),
      404,
      'not-visible',
      'withdraw an unknown invitation',
    )
  })
})

describe('memberships and member changes', () => {
  it('maps every outcome of the membership reads, leave, remove and change-role', async () => {
    fixture = await startFixture()
    const alice = await login(fixture, 'alice')
    const bob = await login(fixture, 'bob')
    const created = json(
      await call(alice, 'create-organization', {
        createCallId: 'c-1',
        name: 'Team',
        governanceModelId: MODEL,
      }),
    ).body
    const team = created.organizationId as string
    const aliceTeam = created.tenantId as string
    await call(alice, 'switch-current-tenant', { tenantId: aliceTeam })
    const aliceT = actingAs(alice, aliceTeam)
    const invitation = json(
      await call(aliceT, 'issue-member-invitation', { invitedLoginIdentifier: 'bob' }),
    ).body.invitationId as string
    await call(bob, 'accept-member-invitation', { invitationId: invitation, expectedState: 'open' })

    const memberships = expectAnswer(
      await call(bob, 'query-own-memberships', {}, null),
      200,
      'succeeded',
      'own memberships',
    )
    expect(memberships.completeness).toBe('complete')
    const rows = memberships.memberships as Record<string, unknown>[]
    expect(rows.map(row => Object.keys(row).sort())).toEqual([
      ['organizationId', 'role', 'tenantId'],
      ['organizationId', 'role', 'tenantId'],
    ])
    const inTeam = rows.find(row => row.organizationId === team)
    expect(inTeam?.role).toBe('member')
    const bobTeam = inTeam?.tenantId as string
    expect(rows.find(row => row.tenantId === bob.tenantText)?.role).toBe('super-admin')

    const members = expectAnswer(
      await call(aliceT, 'query-organization-members', { organizationId: team }),
      200,
      'succeeded',
      'members',
    )
    expect(members.completeness).toBe('complete')
    expect(
      (members.members as Record<string, unknown>[]).map(member => [member.accountId, member.role]),
    ).toEqual(
      expect.arrayContaining([
        [alice.accountText, 'super-admin'],
        [bob.accountText, 'member'],
      ]),
    )
    expectAnswer(
      await call(bob, 'query-organization-members', { organizationId: team, includeRemoved: true }),
      403,
      'denied',
      'removed members for an ordinary member',
    )
    expectAnswer(
      await call(aliceT, 'query-organization-members', {
        organizationId: 'org_abcdefghjkmnpqrstvwxyz2345',
      }),
      404,
      'not-visible',
      'members of an organization never joined',
    )

    const change = {
      organizationId: team,
      accountId: bob.accountText,
      expectedRole: 'super-admin',
      targetRole: 'member',
    }
    expect(
      expectAnswer(await call(aliceT, 'change-member-role', change), 409, 'conflict', 'stale role'),
    ).toEqual({})
    expectAnswer(
      await call(aliceT, 'change-member-role', { ...change, targetRole: 'owner' }),
      403,
      'denied',
      'a role the model does not have',
    )
    expect(
      expectAnswer(
        await call(aliceT, 'change-member-role', {
          ...change,
          expectedRole: 'member',
          targetRole: 'super-admin',
        }),
        200,
        'succeeded',
        'change role',
      ),
    ).toEqual({})
    expectAnswer(
      await call(aliceT, 'leave-organization', {}),
      200,
      'succeeded',
      'leave while another super-admin stays',
    )
    const bobT = actingAs(bob, bobTeam)
    await call(bob, 'switch-current-tenant', { tenantId: bobTeam })
    expectAnswer(await call(bobT, 'leave-organization', {}), 403, 'denied', 'last super-admin')
    expectAnswer(
      await call(bob, 'leave-organization', {}, bob.tenantText),
      403,
      'denied',
      'leave with an acting tenant that is not the selection',
    )
    expectAnswer(
      await call(bobT, 'remove-member', {
        organizationId: team,
        accountId: alice.accountText,
        expectedRole: 'super-admin',
      }),
      404,
      'not-visible',
      'remove a member that already left',
    )
  })

  it('removes a member, and a removed member is denied, not told the organization does not exist', async () => {
    fixture = await startFixture()
    const alice = await login(fixture, 'alice')
    const bob = await login(fixture, 'bob')
    const created = json(
      await call(alice, 'create-organization', {
        createCallId: 'c-1',
        name: 'Team',
        governanceModelId: MODEL,
      }),
    ).body
    const team = created.organizationId as string
    const aliceT = actingAs(alice, created.tenantId as string)
    await call(alice, 'switch-current-tenant', { tenantId: aliceT.tenantText })
    const invitation = json(
      await call(aliceT, 'issue-member-invitation', { invitedLoginIdentifier: 'bob' }),
    ).body.invitationId as string
    await call(bob, 'accept-member-invitation', { invitationId: invitation, expectedState: 'open' })
    const remove = { organizationId: team, accountId: bob.accountText, expectedRole: 'member' }
    expect(
      expectAnswer(await call(aliceT, 'remove-member', remove), 200, 'succeeded', 'remove'),
    ).toEqual({})
    expectAnswer(
      await call(bob, 'query-organization-members', { organizationId: team }),
      403,
      'denied',
      'a removed member reads the members',
    )
  })
})

describe('logins', () => {
  it('lists the valid logins without a proof and revokes one, the same answer for a foreign or unknown target', async () => {
    fixture = await startFixture()
    const alice = await login(fixture, 'alice')
    const alice2 = await anotherLogin(fixture, alice)
    const bob = await login(fixture, 'bob')

    const listed = await call(alice, 'query-own-valid-logins', {}, null)
    const list = expectAnswer(listed, 200, 'succeeded', 'own logins')
    expect(list.completeness).toBe('complete')
    const logins = list.logins as Record<string, unknown>[]
    expect(logins.map(item => item.loginId).sort()).toEqual([alice.loginId, alice2.loginId].sort())
    expect(logins.map(item => Object.keys(item).sort())).toEqual([
      ['idleDeadline', 'issuedAt', 'loginId', 'maxDeadline'],
      ['idleDeadline', 'issuedAt', 'loginId', 'maxDeadline'],
    ])
    expect(listed.text).not.toContain(alice.loginProof)
    expect(listed.text).not.toContain(alice2.loginProof)
    expect(listed.text).not.toContain(alice.credential)

    expect(
      expectAnswer(
        await call(alice, 'revoke-login', { targetLoginId: alice2.loginId }, null),
        200,
        'succeeded',
        'revoke',
      ),
    ).toEqual({})
    expect(
      expectAnswer(
        await call(alice, 'revoke-login', { targetLoginId: alice2.loginId }, null),
        200,
        'no-change',
        'revoke again',
      ),
    ).toEqual({})
    expectAnswer(
      await call(alice2, 'query-current-tenant', {}, null),
      403,
      'denied',
      'the revoked login',
    )
    expectAnswer(
      await call(alice2, 'revoke-login', { targetLoginId: alice.loginId }, null),
      403,
      'denied',
      'a revoked initiator',
    )
    expectAnswer(
      await call(alice, 'query-current-tenant', {}, null),
      200,
      'succeeded',
      'the other login is kept',
    )
    expect(
      (
        json(await call(alice, 'query-own-valid-logins', {}, null)).body.logins as Record<
          string,
          unknown
        >[]
      ).map(item => item.loginId),
    ).toEqual([alice.loginId])
    // Bob's login is still valid: the foreign target was not touched.
    expectAnswer(
      await call(bob, 'revoke-login', { targetLoginId: alice.loginId }, null),
      404,
      'not-visible',
      'foreign',
    )
    expectAnswer(await call(bob, 'query-current-tenant', {}, null), 200, 'succeeded', 'bob kept')
  })
})

describe('not-visible-uniform', () => {
  it('gives byte-identical not-visible answers for an unknown object and one that belongs to another account', async () => {
    fixture = await startFixture()
    const alice = await login(fixture, 'alice')
    const bob = await login(fixture, 'bob')
    const carol = await login(fixture, 'carol')
    const foreignLogin = await call(alice, 'revoke-login', { targetLoginId: bob.loginId }, null)
    const unknownLogin = await call(alice, 'revoke-login', { targetLoginId: UNKNOWN_LOGIN }, null)
    expect(foreignLogin.status).toBe(404)
    expect(foreignLogin.text).toBe(unknownLogin.text)
    expect(foreignLogin.headers['content-length']).toBe(unknownLogin.headers['content-length'])
    // Control: the same account's own target is visible, so the answer differs.
    const own = await call(alice, 'revoke-login', { targetLoginId: alice.loginId }, null)
    expect(own.status).toBe(200)

    // An invitation between two other accounts and an unknown one.
    const created = json(
      await call(bob, 'create-organization', {
        createCallId: 'c-1',
        name: 'Team',
        governanceModelId: MODEL,
      }),
    ).body
    const bobT = actingAs(bob, created.tenantId as string)
    await call(bob, 'switch-current-tenant', { tenantId: bobT.tenantText })
    const invitation = json(
      await call(bobT, 'issue-member-invitation', { invitedLoginIdentifier: 'carol' }),
    ).body.invitationId as string
    const dave = await login(fixture, 'dave')
    const foreignInvitation = await call(dave, 'query-invitation', { invitationId: invitation })
    const unknownInvitation = await call(dave, 'query-invitation', { invitationId: 'inv-none' })
    expect(foreignInvitation.status).toBe(404)
    expect(foreignInvitation.text).toBe(unknownInvitation.text)
    // Control: the invited account sees it.
    expect((await call(carol, 'query-invitation', { invitationId: invitation })).status).toBe(200)
    // Unknown invited identifier and an organization never joined: the same not-visible bytes.
    const unknownInvitee = await call(bobT, 'issue-member-invitation', {
      invitedLoginIdentifier: 'nobody',
    })
    expect(unknownInvitee.text).toBe(unknownInvitation.text)
  })
})

describe('denied is uniform', () => {
  it('answers byte-identical denied, apart from messageId, whatever the reason', async () => {
    fixture = await startFixture()
    const alice = await login(fixture, 'alice')
    const alice2 = await anotherLogin(fixture, alice)
    const bob = await login(fixture, 'bob')
    await call(alice, 'revoke-login', { targetLoginId: alice2.loginId }, null)
    const invite = { invitedLoginIdentifier: 'bob' }
    const cases: readonly (readonly [string, Promise<HttpReply>])[] = [
      [
        'missing proof',
        send(fixture.port, GOVERNANCE_PATH, {
          body: governance(
            'issue-member-invitation',
            invite,
            { actingTenant: alice.tenantText },
            'd-1',
          ),
        }),
      ],
      [
        'empty proof',
        send(fixture.port, GOVERNANCE_PATH, {
          body: governance(
            'issue-member-invitation',
            invite,
            { loginProof: '', actingTenant: alice.tenantText },
            'd-2',
          ),
        }),
      ],
      [
        'forged proof',
        call(
          { ...alice, loginProof: 'forged' },
          'issue-member-invitation',
          invite,
          alice.tenantText,
          'd-3',
        ),
      ],
      ['revoked login', call(alice2, 'issue-member-invitation', invite, alice.tenantText, 'd-4')],
      [
        'acting tenant is not the selection',
        call(alice, 'issue-member-invitation', invite, bob.tenantText, 'd-5'),
      ],
      ['personal organization', call(alice, 'issue-member-invitation', invite, undefined, 'd-6')],
      [
        'a duration that does not parse',
        call(alice, 'issue-member-invitation', { ...invite, duration: 'soon' }, undefined, 'd-7'),
      ],
      ['another operation', call(alice2, 'query-own-memberships', {}, null, 'd-8')],
    ]
    const replies = await Promise.all(cases.map(([, reply]) => reply))
    const normalized = replies.map((reply, index) => {
      expect(reply.status, cases[index]?.[0]).toBe(403)
      return reply.text.replace(`"messageId":"d-${index + 1}"`, '"messageId":"X"')
    })
    expect(new Set(normalized).size).toBe(1)
    expect(JSON.parse(normalized[0] ?? '')).toEqual({
      protocolVersion: 'governance-public/1',
      messageId: 'X',
      outcome: 'denied',
      body: {},
    })
    const lengths = new Set(replies.map(reply => reply.headers['content-length']))
    expect(lengths.size).toBe(1)
  })

  it('answers denied after the login expired, and never refreshes it with a governance read', async () => {
    fixture = await startFixture()
    const alice = await login(fixture, 'alice')
    const idle = parseDuration(IDLE_PERIOD)
    if (!idle.ok) throw new Error('idle period did not parse')
    const half = parseDuration('PT400S')
    if (!half.ok) throw new Error('half did not parse')
    fixture.clock.advanceBy(half.value)
    expectAnswer(await call(alice, 'query-current-tenant', {}, null), 200, 'succeeded', 'in time')
    fixture.clock.advanceBy(half.value)
    // 800 s since issue and only governance reads in between: the 600 s idle period has passed.
    expectAnswer(await call(alice, 'query-current-tenant', {}, null), 403, 'denied', 'expired')
  })
})

describe('steps 4 and 6 before the port', () => {
  it('reaches the port only with a recognized login whose selection is the acting tenant', async () => {
    const reached: string[] = []
    fixture = await startFixture({
      governance: (base): IdentityGovernance => ({
        ...base,
        issueMemberInvitation: input => {
          reached.push(input.actingTenant.account.text)
          return base.issueMemberInvitation(input)
        },
      }),
    })
    const alice = await login(fixture, 'alice')
    const bob = await login(fixture, 'bob')
    const invite = { invitedLoginIdentifier: 'bob' }
    const forged = await call({ ...alice, loginProof: 'forged' }, 'issue-member-invitation', invite)
    const otherActing = await call(alice, 'issue-member-invitation', invite, bob.tenantText)
    expect([forged.status, otherActing.status]).toEqual([403, 403])
    expect(reached).toEqual([])
    // Control: the selection as acting tenant reaches the port, which answers for the personal organization.
    const own = await call(alice, 'issue-member-invitation', invite)
    expect(own.status).toBe(403)
    expect(reached).toEqual([alice.accountText])
  })

  it('denies an acting tenant of the same account in another organization, before the port', async () => {
    const reached: string[] = []
    fixture = await startFixture({
      governance: (base): IdentityGovernance => ({
        ...base,
        issueMemberInvitation: input => {
          reached.push(input.actingTenant.organization.text)
          return base.issueMemberInvitation(input)
        },
      }),
    })
    const alice = await login(fixture, 'alice')
    await login(fixture, 'bob')
    const created = json(
      await call(alice, 'create-organization', {
        createCallId: 'c-1',
        name: 'Team',
        governanceModelId: MODEL,
      }),
    ).body
    const teamTenant = created.tenantId as string
    // The selection is still the personal tenant: the team tenant of the same account is not it.
    const invite = { invitedLoginIdentifier: 'bob' }
    const refused = await call(alice, 'issue-member-invitation', invite, teamTenant, 'm-r')
    expect(expectAnswer(refused, 403, 'denied', 'same account, other organization')).toEqual({})
    expect(reached).toEqual([])
    // Control: after the switch the same acting tenant reaches the port and succeeds.
    await call(alice, 'switch-current-tenant', { tenantId: teamTenant })
    const accepted = await call(alice, 'issue-member-invitation', invite, teamTenant)
    expectAnswer(accepted, 200, 'succeeded', 'after the switch')
    expect(reached).toEqual([created.organizationId])
  })
})

describe('the governance port fails', () => {
  it('answers 503 basis-unavailable when the login recognition throws', async () => {
    fixture = await startFixture({
      identity: (base): IdentityOperations => ({
        registerAndActivate: input => base.registerAndActivate(input),
        issueLogin: input => base.issueLogin(input),
        recognizeLogin: () => Promise.reject(new Error('login store exploded')),
      }),
    })
    const alice = await login(fixture, 'alice')
    const reply = await call(alice, 'query-own-memberships', {}, null)
    expect(expectAnswer(reply, 503, 'basis-unavailable', 'recognition throws')).toEqual({})
  })

  it('keeps identity basis-unavailable, and a list answers it with no array', async () => {
    fixture = await startFixture()
    const alice = await login(fixture, 'alice')
    fixture.faults.makeUnavailable('organizations', 'store down')
    const reply = await call(alice, 'query-own-memberships', {}, null)
    expect(expectAnswer(reply, 503, 'basis-unavailable', 'store down')).toEqual({})
    fixture.faults.restore()
    expectAnswer(await call(alice, 'query-own-memberships', {}, null), 200, 'succeeded', 'restored')
  })

  it('answers unknown with a body to a rejected create-organization, an empty 500 to the others', async () => {
    fixture = await startFixture({
      governance: (base): IdentityGovernance => ({
        ...base,
        createOrganization: () => Promise.reject(new Error('commit lost')),
        switchCurrentTenant: () => Promise.reject(new Error('commit lost')),
      }),
    })
    const alice = await login(fixture, 'alice')
    const create = await call(alice, 'create-organization', {
      createCallId: 'c-1',
      name: 'Team',
      governanceModelId: MODEL,
    })
    expect(expectAnswer(create, 500, 'unknown', 'create rejected')).toEqual({})
    expect(create.headers.connection).not.toBe('close')
    const switched = await call(alice, 'switch-current-tenant', { tenantId: alice.tenantText })
    expect(switched.status).toBe(500)
    expect(switched.body.byteLength).toBe(0)
    expect(switched.headers.connection).toBe('close')
  })

  it('answers basis-unavailable, not an empty list, when the port lists no valid login', async () => {
    fixture = await startFixture({
      governance: (base): IdentityGovernance => ({
        ...base,
        queryOwnValidLogins: () => Promise.resolve({ kind: 'succeeded', logins: [] }),
      }),
    })
    const alice = await login(fixture, 'alice')
    const reply = await call(alice, 'query-own-valid-logins', {}, null)
    expect(expectAnswer(reply, 503, 'basis-unavailable', 'empty list')).toEqual({})
  })

  it('answers basis-unavailable to a governed operation when no governance port is wired', async () => {
    fixture = await startFixture({ governance: () => undefined })
    const alice = await login(fixture, 'alice')
    expect(
      expectAnswer(
        await call(alice, 'query-current-tenant', {}, null),
        503,
        'basis-unavailable',
        'no port',
      ),
    ).toEqual({})
    // The login is still checked first: a bad proof is denied, not basis-unavailable.
    expectAnswer(
      await call({ ...alice, loginProof: 'forged' }, 'query-current-tenant', {}, null),
      403,
      'denied',
      'no port, bad proof',
    )
  })
})

describe('diagnostics-no-secret', () => {
  it('writes no proof, credential, login identifier or login id into a diagnostic', async () => {
    let failing = false
    fixture = await startFixture({
      governance: (base): IdentityGovernance => ({
        ...base,
        queryOwnValidLogins: input =>
          failing
            ? Promise.reject(new Error(`exploded for ${input.login.text}`))
            : base.queryOwnValidLogins(input),
        createOrganization: input =>
          failing
            ? Promise.reject(new Error(`exploded for ${input.login.text}`))
            : base.createOrganization(input),
      }),
    })
    const identifier = 'IDENT-MARKER-4b1d'
    const credential = 'CREDENTIAL-MARKER-77e0'
    const alice = await login(fixture, identifier, credential)
    const alice2 = await anotherLogin(fixture, alice)
    const replies: HttpReply[] = []
    replies.push(await call(alice, 'query-own-valid-logins', {}, null))
    replies.push(await call(alice, 'revoke-login', { targetLoginId: alice2.loginId }, null))
    replies.push(await call(alice2, 'query-current-tenant', {}, null))
    fixture.faults.makeUnavailable('organizations', `down for ${alice.loginProof}`)
    replies.push(await call(alice, 'query-own-memberships', {}, null))
    fixture.faults.restore()
    failing = true
    replies.push(await call(alice, 'query-own-valid-logins', {}, null))
    replies.push(
      await call(alice, 'create-organization', {
        createCallId: 'c-1',
        name: 'Team',
        governanceModelId: MODEL,
      }),
    )
    failing = false
    const diagnostics = JSON.stringify(fixture.diagnostics)
    expect(fixture.diagnostics.length).toBeGreaterThan(0)
    for (const secret of [
      alice.loginProof,
      alice2.loginProof,
      credential,
      identifier,
      alice.loginId,
      alice2.loginId,
    ])
      expect(diagnostics).not.toContain(secret)
    expect(diagnostics).not.toMatch(/lgn_[0-9a-z]{26}/)
    // Control: the search sees a login id where the protocol places it.
    expect(replies[0]?.text).toContain(alice.loginId)
  })
})
