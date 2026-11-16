import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TEAM_ROLES,
  inProcessPrincipalAuthority,
  type ActingForTenantPrincipal,
} from '@omne-harness/identity'
import { createAccessIdentity } from '@omne-harness/identity-access'
import {
  adjustableInvitationTerms,
  adjustableLoginTerms,
  inProcessIdentity,
  manualIdentityClock,
} from '@omne-harness/identity/testing'
import { tenant, tenantCodec } from '@omne-harness/legal-identity'
import { parseDuration, parseInstant } from '@omne-harness/utc-instant'

function duration(text: string) {
  const parsed = parseDuration(text)
  if (!parsed.ok) throw new Error(`fixture duration ${text} did not parse`)
  return parsed.value
}

function world() {
  const start = parseInstant('2026-11-13T00:00:00Z')
  if (!start.ok) throw new Error('fixture time did not parse')
  const identity = inProcessIdentity({
    clock: manualIdentityClock(start.value).clock,
    terms: adjustableLoginTerms({
      maxLifetime: duration('PT3600S'),
      idlePeriod: duration('PT600S'),
    }).source,
    invitationTerms: adjustableInvitationTerms({
      defaultDuration: duration('PT604800S'),
      maxDuration: duration('PT2592000S'),
    }).source,
  })
  const authority = inProcessPrincipalAuthority()
  const access = createAccessIdentity({
    operations: identity.operations,
    governance: identity.governance,
    issuer: authority.issuer,
  })
  return { identity, access }
}

type World = ReturnType<typeof world>

function textOf(value: Parameters<typeof tenantCodec.encode>[0]) {
  const encoded = tenantCodec.encode(value)
  if (!encoded.ok) throw new Error('fixture tenant is not minted')
  return encoded.value
}

async function register(identity: World['identity'], loginIdentifier: string) {
  const registered = await identity.operations.registerAndActivate({
    loginIdentifier,
    credential: 'secret',
  })
  if (registered.kind !== 'succeeded') throw new Error('fixture registration failed')
}

async function signIn(identity: World['identity'], loginIdentifier: string) {
  const issued = await identity.operations.issueLogin({ loginIdentifier, credential: 'secret' })
  if (issued.kind !== 'succeeded') throw new Error('fixture login failed')
  return { proof: issued.loginProof, tenantText: textOf(issued.tenant) }
}

async function recognize(identity: World['identity'], proof: string) {
  const recognition = await identity.operations.recognizeLogin({ loginProof: proof })
  if (recognition.kind !== 'recognized') throw new Error('fixture login was not recognized')
  return recognition
}

describe('the principal port the diagnostics row hands to the plugin', () => {
  it('does not issue for a login that was revoked after it was identified', async () => {
    const { identity, access } = world()
    await register(identity, 'alice')
    const keeping = await signIn(identity, 'alice')
    const sending = await signIn(identity, 'alice')
    const identified = await access.identifyLogin(sending.proof)
    if (identified.outcome !== 'identified') throw new Error('the sending login is not identified')
    expect((await access.actFor(identified.login, sending.tenantText)).outcome).toBe('issued')
    const keeper = await recognize(identity, keeping.proof)
    const sender = await recognize(identity, sending.proof)

    expect(
      await identity.governance.revokeLogin({ login: keeper.login, target: sender.login }),
    ).toEqual({ kind: 'succeeded' })
    expect(await access.identifyLogin(sending.proof)).toEqual({ outcome: 'denied' })

    expect(await access.actFor(identified.login, sending.tenantText)).toEqual({
      outcome: 'denied',
    })
  })

  it('does not issue for an organization tenant once the membership is removed, and still issues for the own tenant', async () => {
    const { identity, access } = world()
    await register(identity, 'alice')
    await register(identity, 'bob')
    const alice = await recognize(identity, (await signIn(identity, 'alice')).proof)
    const bobSigned = await signIn(identity, 'bob')
    const bob = await recognize(identity, bobSigned.proof)
    const created = await identity.governance.createOrganization({
      login: alice.login,
      actingTenant: alice.tenant,
      createCallId: 'team-call',
      name: 'Team',
      governanceModelId: 'default-team',
    })
    if (created.kind !== 'succeeded') throw new Error('fixture team was not created')
    const selected = await identity.governance.switchCurrentTenant({
      login: alice.login,
      actingTenant: alice.tenant,
      tenant: created.tenant,
    })
    if (selected.kind !== 'succeeded') throw new Error('fixture team was not selected')
    const invitation = await identity.governance.issueMemberInvitation({
      login: alice.login,
      actingTenant: created.tenant,
      invitedLoginIdentifier: 'bob',
    })
    if (invitation.kind !== 'succeeded') throw new Error('fixture invitation was not issued')
    const accepted = await identity.governance.acceptMemberInvitation({
      login: bob.login,
      actingTenant: bob.tenant,
      invitation: invitation.invitation,
      expectedState: 'open',
    })
    if (accepted.kind !== 'succeeded') throw new Error('fixture invitation was not accepted')
    const identified = await access.identifyLogin(bobSigned.proof)
    if (identified.outcome !== 'identified') throw new Error('bob is not identified')
    const teamText = textOf(tenant(created.organization, bob.account))
    expect((await access.actFor(identified.login, teamText)).outcome).toBe('issued')

    const removed = await identity.governance.removeMember({
      login: alice.login,
      actingTenant: created.tenant,
      organization: created.organization,
      account: bob.account,
      expectedRole: DEFAULT_TEAM_ROLES.member,
    })
    expect(removed).toEqual({ kind: 'succeeded' })

    expect(await access.actFor(identified.login, teamText)).toEqual({ outcome: 'denied' })
    const own = await access.actFor(identified.login, bobSigned.tenantText)
    expect(own.outcome).toBe('issued')
    if (own.outcome !== 'issued') return
    expect((own.principal as unknown as ActingForTenantPrincipal).kind).toBe('acting-for-tenant')
  })
})
