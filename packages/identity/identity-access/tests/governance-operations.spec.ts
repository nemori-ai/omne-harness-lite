// The governed operations of `identity/v1` beyond the first six: each calls the same governance
// method as the server entry's governance location, with the login (and acting tenant) of the
// caller, and maps each of its outcomes the same way. The operations this deployment declares not
// provided answer `stage-not-provided`.
import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import type { IdentityGovernance } from '@omne-harness/identity'
import { createAccessIdentity, createIdentityOperations } from '@omne-harness/identity-access'
import { identityProtocol } from '@omne-harness/identity-protocol'
import { parseInstant } from '@omne-harness/utc-instant'
import { describe, expect, it } from 'vitest'
import { call, fixture, textOf } from './support.ts'

type Method = keyof IdentityGovernance

async function setUp() {
  const f = fixture()
  const credentials = { loginIdentifier: 'alice', credential: 'secret-of-alice' }
  const registered = await f.operations.registerAndActivate(credentials)
  if (registered.kind !== 'succeeded') throw new Error('fixture registration failed')
  const issued = await f.operations.issueLogin(credentials)
  if (issued.kind !== 'succeeded') throw new Error('fixture login failed')
  const port = createAccessIdentity({
    operations: f.operations,
    governance: f.governance,
    issuer: f.authority.issuer,
  })
  const identified = await port.identifyLogin(issued.loginProof)
  if (identified.outcome !== 'identified') throw new Error('fixture login not identified')
  const acting = await port.actFor(identified.login, textOf(registered.tenant))
  if (acting.outcome !== 'issued') throw new Error('fixture principal not issued')
  const at = parseInstant('2026-11-20T00:00:00Z')
  if (!at.ok) throw new Error('fixture instant')
  return {
    f,
    login: identified.login,
    principal: acting.principal,
    loginId: issued.login,
    account: registered.account,
    organization: registered.organization,
    tenant: registered.tenant,
    at: at.value,
  }
}

type World = Awaited<ReturnType<typeof setUp>>

/** Handlers whose governance port answers `outcome` from `method` and records the input. */
function stubbed(w: World, method: Method, outcome: unknown) {
  const seen: unknown[] = []
  const governance = {
    ...w.f.governance,
    [method]: async (input: unknown) => {
      seen.push(input)
      return outcome
    },
  } as IdentityGovernance
  const handlers = createIdentityOperations({
    operations: () => w.f.operations,
    governance: () => governance,
  })
  return { handlers, seen }
}

type Case = Readonly<{
  operation: string
  method: Method
  principal: 'login' | 'acting'
  body: (w: World) => unknown
  /** The input the port must receive besides `login` (and `actingTenant`). */
  input: (w: World) => Record<string, unknown>
  /** Each domain outcome and the answer it maps to. */
  outcomes: (w: World) => readonly (readonly [unknown, unknown])[]
}>

const denied = [{ kind: 'denied' }, { outcome: 'denied' }] as const
const unavailable = [
  { kind: 'basis-unavailable', diagnostic: 'x' },
  { outcome: 'basis-unavailable' },
] as const
const notVisible = [{ kind: 'not-visible' }, { outcome: 'not-visible', body: {} }] as const
const conflict = [{ kind: 'conflict' }, { outcome: 'conflict', body: {} }] as const

function invitation(w: World) {
  return {
    domain: {
      invitation: 'inv-1',
      state: 'open',
      expiresAt: w.at,
      organization: w.organization,
      invitedAccount: w.account,
    },
    wire: {
      invitationId: 'inv-1',
      state: 'open',
      expiresAt: w.at,
      organizationId: w.organization,
      invitedAccountId: w.account,
    },
  }
}

function disposition(operation: string, method: Method, state: string): Case {
  return {
    operation,
    method,
    principal: 'acting',
    body: () => ({ invitationId: 'inv-1', expectedState: 'open' }),
    input: () => ({ invitation: 'inv-1', expectedState: 'open' }),
    outcomes: () => [
      [
        { kind: 'succeeded', invitation: 'inv-1', state },
        { outcome: 'succeeded', body: { invitationId: 'inv-1', state } },
      ],
      [
        { kind: 'no-change', invitation: 'inv-1', state: 'expired' },
        { outcome: 'no-change', body: { invitationId: 'inv-1', state: 'expired' } },
      ],
      denied,
      notVisible,
      unavailable,
    ],
  }
}

const CASES: readonly Case[] = [
  {
    operation: 'query-own-valid-logins',
    method: 'queryOwnValidLogins',
    principal: 'login',
    body: () => ({}),
    input: () => ({}),
    outcomes: w => [
      [
        {
          kind: 'succeeded',
          logins: [{ login: w.loginId, issuedAt: w.at, maxDeadline: w.at, idleDeadline: w.at }],
        },
        {
          outcome: 'succeeded',
          body: {
            logins: [{ loginId: w.loginId, issuedAt: w.at, maxDeadline: w.at, idleDeadline: w.at }],
            completeness: 'complete',
          },
        },
      ],
      // The list holds at least the calling login; an empty one is not an answer.
      [{ kind: 'succeeded', logins: [] }, { outcome: 'basis-unavailable' }],
      denied,
      unavailable,
    ],
  },
  {
    operation: 'query-received-invitations',
    method: 'queryReceivedInvitations',
    principal: 'login',
    body: () => ({}),
    input: () => ({}),
    outcomes: w => [
      [
        { kind: 'succeeded', invitations: [invitation(w).domain] },
        {
          outcome: 'succeeded',
          body: { invitations: [invitation(w).wire], completeness: 'complete' },
        },
      ],
      denied,
      unavailable,
    ],
  },
  {
    operation: 'query-create-organization',
    method: 'queryCreateOrganization',
    principal: 'login',
    body: () => ({ targetCreateCallId: 'c-1', name: 'Team', governanceModelId: 'team' }),
    input: () => ({ createCallId: 'c-1', name: 'Team', governanceModelId: 'team' }),
    outcomes: w => [
      [
        { kind: 'succeeded', organization: w.organization, tenant: w.tenant },
        { outcome: 'succeeded', body: { organizationId: w.organization, tenantId: w.tenant } },
      ],
      [{ kind: 'unknown', diagnostic: 'x' }, { outcome: 'unknown' }],
      conflict,
      denied,
      unavailable,
    ],
  },
  {
    operation: 'issue-member-invitation',
    method: 'issueMemberInvitation',
    principal: 'acting',
    body: () => ({ invitedLoginIdentifier: 'bob' }),
    input: () => ({ invitedLoginIdentifier: 'bob' }),
    outcomes: w => [
      [
        { kind: 'succeeded', invitation: 'inv-1', state: 'open', expiresAt: w.at },
        { outcome: 'succeeded', body: { invitationId: 'inv-1', state: 'open', expiresAt: w.at } },
      ],
      denied,
      notVisible,
      unavailable,
    ],
  },
  disposition('accept-member-invitation', 'acceptMemberInvitation', 'accepted'),
  disposition('reject-member-invitation', 'rejectMemberInvitation', 'rejected'),
  disposition('withdraw-member-invitation', 'withdrawMemberInvitation', 'withdrawn'),
  {
    operation: 'query-invitation',
    method: 'queryInvitation',
    principal: 'acting',
    body: () => ({ invitationId: 'inv-1' }),
    input: () => ({ invitation: 'inv-1' }),
    outcomes: w => [
      [
        { kind: 'succeeded', invitation: invitation(w).domain },
        { outcome: 'succeeded', body: invitation(w).wire },
      ],
      denied,
      notVisible,
      unavailable,
    ],
  },
  {
    operation: 'query-issued-invitations',
    method: 'queryIssuedInvitations',
    principal: 'acting',
    body: () => ({}),
    input: () => ({}),
    outcomes: w => [
      [
        { kind: 'succeeded', invitations: [invitation(w).domain] },
        {
          outcome: 'succeeded',
          body: { invitations: [invitation(w).wire], completeness: 'complete' },
        },
      ],
      denied,
      unavailable,
    ],
  },
  {
    operation: 'query-organization-members',
    method: 'queryOrganizationMembers',
    principal: 'acting',
    body: w => ({ organizationId: w.organization, includeRemoved: true }),
    input: w => ({ organization: w.organization, includeRemoved: true }),
    outcomes: w => [
      [
        { kind: 'succeeded', members: [{ account: w.account, role: { role: 'admin' } }] },
        {
          outcome: 'succeeded',
          body: { members: [{ accountId: w.account, role: 'admin' }], completeness: 'complete' },
        },
      ],
      denied,
      notVisible,
      unavailable,
    ],
  },
  {
    operation: 'create-organization',
    method: 'createOrganization',
    principal: 'acting',
    body: () => ({ createCallId: 'c-1', name: 'Team', governanceModelId: 'team' }),
    input: () => ({ createCallId: 'c-1', name: 'Team', governanceModelId: 'team' }),
    outcomes: w => [
      [
        { kind: 'succeeded', organization: w.organization, tenant: w.tenant },
        { outcome: 'succeeded', body: { organizationId: w.organization, tenantId: w.tenant } },
      ],
      conflict,
      denied,
      unavailable,
    ],
  },
  {
    operation: 'leave-organization',
    method: 'leaveOrganization',
    principal: 'acting',
    body: () => ({}),
    input: () => ({}),
    outcomes: () => [
      [{ kind: 'succeeded' }, { outcome: 'succeeded', body: {} }],
      denied,
      unavailable,
    ],
  },
  {
    operation: 'remove-member',
    method: 'removeMember',
    principal: 'acting',
    body: w => ({ organizationId: w.organization, accountId: w.account, expectedRole: 'member' }),
    input: w => ({ organization: w.organization, account: w.account, expectedRole: 'member' }),
    outcomes: () => [
      [{ kind: 'succeeded' }, { outcome: 'succeeded', body: {} }],
      denied,
      notVisible,
      conflict,
      unavailable,
    ],
  },
  {
    operation: 'change-member-role',
    method: 'changeMemberRole',
    principal: 'acting',
    body: w => ({
      organizationId: w.organization,
      accountId: w.account,
      expectedRole: 'member',
      targetRole: 'admin',
    }),
    input: w => ({
      organization: w.organization,
      account: w.account,
      expectedRole: 'member',
      targetRole: 'admin',
    }),
    outcomes: () => [
      [{ kind: 'succeeded' }, { outcome: 'succeeded', body: {} }],
      denied,
      notVisible,
      conflict,
      unavailable,
    ],
  },
]

type Loose = (call: unknown, body: unknown) => Promise<unknown>

describe.each(CASES)('$operation', c => {
  it('passes the caller and the body to the port, and maps each of its outcomes', async () => {
    const w = await setUp()
    for (const [outcome, answer] of c.outcomes(w)) {
      const { handlers, seen } = stubbed(w, c.method, outcome)
      const handler = handlers[c.operation as keyof typeof handlers] as unknown as Loose
      const principal: LoginIdentity | Principal = c.principal === 'login' ? w.login : w.principal
      expect(await handler(call(principal), c.body(w))).toEqual(answer)
      expect(seen).toEqual([
        {
          login: w.loginId,
          ...(c.principal === 'acting' ? { actingTenant: w.tenant } : {}),
          ...c.input(w),
        },
      ])
    }
  })

  it('answers basis-unavailable without the governance service', async () => {
    const w = await setUp()
    const handlers = createIdentityOperations({
      operations: () => w.f.operations,
      governance: () => undefined,
    })
    const handler = handlers[c.operation as keyof typeof handlers] as unknown as Loose
    const principal = c.principal === 'login' ? w.login : w.principal
    expect(await handler(call(principal), c.body(w))).toEqual({ outcome: 'basis-unavailable' })
  })
})

describe('issue-member-invitation duration', () => {
  it('answers denied for a duration that is not an SI-second duration, without a call', async () => {
    const w = await setUp()
    const { handlers, seen } = stubbed(w, 'issueMemberInvitation', { kind: 'denied' })
    expect(
      await handlers['issue-member-invitation'](call(w.principal), {
        invitedLoginIdentifier: 'bob',
        duration: 'seven days',
      }),
    ).toEqual({ outcome: 'denied' })
    expect(seen).toEqual([])
  })
})

const NOT_PROVIDED = [
  'replace-credential',
  'open-affiliation-request',
  'query-organization',
  'accept-affiliation-request',
  'reject-affiliation-request',
  'withdraw-affiliation-request',
  'release-affiliation',
  'query-received-affiliation-requests',
  'query-issued-affiliation-requests',
  'query-affiliation-request',
  'judge-admission',
  'submit-authorization-expression',
  'withdraw-authorization-expression',
] as const

describe('the operations this deployment does not provide', () => {
  it('answer stage-not-provided without touching identity', async () => {
    const handlers = createIdentityOperations({
      operations: () => {
        throw new Error('not to be taken')
      },
      governance: () => {
        throw new Error('not to be taken')
      },
    })
    for (const operation of NOT_PROVIDED) {
      const handler = handlers[operation] as unknown as Loose
      expect(await handler(call(undefined), {}), operation).toEqual({
        outcome: 'stage-not-provided',
      })
    }
  })

  it('cover the contract with the twenty provided ones', () => {
    const provided = Object.keys(identityProtocol.operations).filter(
      name => !(NOT_PROVIDED as readonly string[]).includes(name),
    )
    expect(Object.keys(identityProtocol.operations)).toHaveLength(33)
    expect(provided).toHaveLength(20)
  })
})
