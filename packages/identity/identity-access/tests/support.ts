import {
  DEFAULT_TEAM_ROLES,
  inProcessPrincipalAuthority,
  type IdentityGovernance,
  type IdentityOperations,
  type PrincipalAuthority,
} from '@omne-harness/identity'
import {
  adjustableInvitationTerms,
  adjustableLoginTerms,
  inProcessIdentity,
  manualIdentityClock,
} from '@omne-harness/identity/testing'
import {
  tenant,
  tenantCodec,
  type AccountId,
  type LoginStateId,
  type OrganizationId,
  type TenantId,
} from '@omne-harness/legal-identity'
import { parseDuration, parseInstant, type Duration } from '@omne-harness/utc-instant'

function duration(text: string): Duration {
  const parsed = parseDuration(text)
  if (!parsed.ok) throw new Error(`fixture duration ${text} did not parse`)
  return parsed.value
}

export type Fixture = Readonly<{
  operations: IdentityOperations
  governance: IdentityGovernance
  authority: PrincipalAuthority
}>

export function fixture(): Fixture {
  const start = parseInstant('2026-11-13T00:00:00Z')
  if (!start.ok) throw new Error('fixture time did not parse')
  const clock = manualIdentityClock(start.value)
  const identity = inProcessIdentity({
    clock: clock.clock,
    terms: adjustableLoginTerms({
      maxLifetime: duration('PT3600S'),
      idlePeriod: duration('PT600S'),
    }).source,
    invitationTerms: adjustableInvitationTerms({
      defaultDuration: duration('PT604800S'),
      maxDuration: duration('PT2592000S'),
    }).source,
  })
  return {
    operations: identity.operations,
    governance: identity.governance,
    authority: inProcessPrincipalAuthority(),
  }
}

export type SignedIn = Readonly<{
  proof: string
  tenant: TenantId
  tenantText: string
}>

export async function signUp(
  operations: IdentityOperations,
  loginIdentifier: string,
): Promise<SignedIn> {
  const credential = `secret-of-${loginIdentifier}`
  const registered = await operations.registerAndActivate({ loginIdentifier, credential })
  if (registered.kind !== 'succeeded') throw new Error('fixture registration failed')
  return signIn(operations, loginIdentifier)
}

export async function signIn(
  operations: IdentityOperations,
  loginIdentifier: string,
): Promise<SignedIn> {
  const issued = await operations.issueLogin({
    loginIdentifier,
    credential: `secret-of-${loginIdentifier}`,
  })
  if (issued.kind !== 'succeeded') throw new Error('fixture login failed')
  return { proof: issued.loginProof, tenant: issued.tenant, tenantText: textOf(issued.tenant) }
}

export type Team = Readonly<{
  organization: OrganizationId
  tenant: TenantId
  owner: LoginStateId
  ownerAccount: AccountId
}>

export async function recognized(operations: IdentityOperations, proof: string) {
  const recognition = await operations.recognizeLogin({ loginProof: proof })
  if (recognition.kind !== 'recognized') throw new Error('fixture login was not recognized')
  return recognition
}

export async function createTeam(f: Fixture, owner: SignedIn): Promise<Team> {
  const who = await recognized(f.operations, owner.proof)
  const created = await f.governance.createOrganization({
    login: who.login,
    actingTenant: who.tenant,
    createCallId: 'team-call',
    name: 'Team',
    governanceModelId: 'default-team',
  })
  if (created.kind !== 'succeeded') throw new Error('fixture team was not created')
  const switched = await f.governance.switchCurrentTenant({
    login: who.login,
    actingTenant: who.tenant,
    tenant: created.tenant,
  })
  if (switched.kind !== 'succeeded') throw new Error('fixture team was not selected')
  return {
    organization: created.organization,
    tenant: created.tenant,
    owner: who.login,
    ownerAccount: who.account,
  }
}

export async function invite(f: Fixture, team: Team, invitedIdentifier: string): Promise<string> {
  const issued = await f.governance.issueMemberInvitation({
    login: team.owner,
    actingTenant: team.tenant,
    invitedLoginIdentifier: invitedIdentifier,
  })
  if (issued.kind !== 'succeeded') throw new Error('fixture invitation was not issued')
  return issued.invitation
}

export async function accept(
  f: Fixture,
  team: Team,
  member: SignedIn,
  invitation: string,
): Promise<TenantId> {
  const who = await recognized(f.operations, member.proof)
  const accepted = await f.governance.acceptMemberInvitation({
    login: who.login,
    actingTenant: who.tenant,
    invitation,
    expectedState: 'open',
  })
  if (accepted.kind !== 'succeeded') throw new Error('fixture invitation was not accepted')
  return tenant(team.organization, who.account)
}

export async function removeMember(f: Fixture, team: Team, member: SignedIn): Promise<void> {
  const who = await recognized(f.operations, member.proof)
  const removed = await f.governance.removeMember({
    login: team.owner,
    actingTenant: team.tenant,
    organization: team.organization,
    account: who.account,
    expectedRole: DEFAULT_TEAM_ROLES.member,
  })
  if (removed.kind !== 'succeeded') throw new Error('fixture member was not removed')
}

export function textOf(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new Error('fixture tenant is not minted')
  return encoded.value
}

export function call<P>(principal: P) {
  return { principal, messageId: 'm-1', signal: new AbortController().signal }
}
