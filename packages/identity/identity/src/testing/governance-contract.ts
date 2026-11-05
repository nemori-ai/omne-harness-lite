// The contract suite of the governance port (SPEC ID-18). Like the operations suite, it runs each
// case on a fresh deployment that the fixture makes over the suite's own clock, terms and faults,
// reports every case by name, and needs no test framework. A case reaches the governance port the
// way the entry does: it recognizes nothing itself, and passes the `login` of an issued login.
// Messages never quote a proof or a credential.
import {
  loginStateCodec,
  tenant,
  tenantEquals,
  accountEquals,
  organizationEquals,
  type AccountId,
  type LoginStateId,
  type OrganizationId,
  type TenantId,
} from '@omne-harness/legal-identity'
import { compareInstants, type Duration, type Instant } from '@omne-harness/utc-instant'
import type {
  CreatedOrganization,
  IdentityGovernance,
  InvitationTerminal,
  InvitationTermsSource,
  MemberInvitation,
} from '../governance.ts'
import type { IdentityOperations, IssuedLogin } from '../operations.ts'
import { DEFAULT_TEAM_ROLES, governanceModelEquals, DEFAULT_TEAM_MODEL } from '../qualification.ts'
import type { IdentityContractOptions, IdentityContractProviderOptions } from './contract.ts'
import {
  adjustableInvitationTerms,
  adjustableLoginTerms,
  manualIdentityClock,
  recordStoreFaults,
  type AdjustableInvitationTerms,
  type AdjustableLoginTerms,
  type ManualIdentityClock,
  type RecordStoreFaultControl,
} from './controls.ts'
import {
  addDuration,
  halfDuration,
  isPositive,
  justBefore,
  spansLeapSecond,
  timesDuration,
} from './time.ts'

/** Both ports of one provider instance over one deployment's records. */
export type IdentityProviders = Readonly<{
  operations: IdentityOperations
  governance: IdentityGovernance
}>

/** What the suite gives `create`: the operations injections and the invitation terms. */
export type IdentityGovernanceContractProviderOptions = IdentityContractProviderOptions &
  Readonly<{ invitationTerms: InvitationTermsSource }>

/**
 * How the suite gets providers. Every call of `create` gives a new, empty deployment. The two
 * ports share its records: a revocation through `governance` is seen by `operations`.
 */
export interface IdentityGovernanceContractFixture {
  create(
    options: IdentityGovernanceContractProviderOptions,
  ): IdentityProviders | Promise<IdentityProviders>
  /**
   * True when the provider consults `faults` before it queries its account, login and
   * organization stores. Without it the cases that need a silent store skip that part.
   */
  injectsRecordFaults?: boolean
  /**
   * Optional: new provider instances over the same committed records, as after a restart. The
   * latest adopted clock reading is not carried over. Without it the restart cases are not
   * applicable.
   */
  restart?(providers: IdentityProviders): Promise<IdentityProviders>
}

/** Same as the operations suite: a start and two lifetimes, `short` shorter than `long`. */
export type IdentityGovernanceContractOptions = IdentityContractOptions

export type IdentityGovernanceContractCaseResult = Readonly<{
  id: string
  rule: string
  status: 'passed' | 'failed' | 'not-applicable'
  detail?: string
}>

export type IdentityGovernanceContractReport = Readonly<{
  /** True when no case failed. */
  passed: boolean
  cases: readonly IdentityGovernanceContractCaseResult[]
}>

/** One registered account with one issued login, and the selection the suite last set on it. */
type Person = {
  readonly identifier: string
  readonly credential: string
  readonly account: AccountId
  readonly personal: TenantId
  readonly login: IssuedLogin
  current: TenantId
}

type Context = Readonly<{
  fixture: IdentityGovernanceContractFixture
  options: IdentityGovernanceContractOptions
  clock: ManualIdentityClock
  terms: AdjustableLoginTerms
  invitationTerms: AdjustableInvitationTerms
  faults: RecordStoreFaultControl
  providers(): IdentityProviders
  /** Replaces the providers with the fixture's restart of them. */
  restart(): Promise<void>
  /** Registers and logs in a new account with a unique identifier. */
  person(name: string): Promise<Person>
  /** Another login of the same account. */
  another(person: Person): Promise<IssuedLogin>
  /** A team created by `admin`, who is switched into it. */
  team(admin: Person): Promise<Team>
  /** `admin` invites `member`, who accepts and is switched into the team. */
  join(team: Team, admin: Person, member: Person): Promise<TenantId>
  /** Switches the person's login into `target` and records it as current. */
  switchTo(person: Person, target: TenantId): Promise<void>
}>

type Team = Readonly<{ organization: OrganizationId; tenant: TenantId }>

type ContractCase = Readonly<{
  id: string
  rule: string
  run(context: Context): Promise<'passed' | 'not-applicable'>
}>

class ContractViolation extends Error {}

function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new ContractViolation(message)
}

function kindIs<O extends { kind: string }, K extends O['kind']>(
  outcome: O,
  kind: K,
  what: string,
): Extract<O, { kind: K }> {
  check(outcome.kind === kind, `${what}: expected ${kind}, got ${outcome.kind}`)
  return outcome as Extract<O, { kind: K }>
}

function sameInstant(left: Instant, right: Instant): boolean {
  return compareInstants(left, right) === 0
}

function sameLogin(left: LoginStateId, right: LoginStateId): boolean {
  return left.text === right.text
}

/** A login identity that no provider issued: lexically valid, never emitted. */
function unissuedLogin(): LoginStateId {
  const parsed = loginStateCodec.parse('lgn_0000000000000000000000zzzz')
  if (!parsed.ok) throw new RangeError('the suite login text did not parse')
  return parsed.value
}

/** Every string reachable from `value`, for a scan for secrets. */
function stringsOf(value: unknown, into: string[] = []): string[] {
  if (typeof value === 'string') into.push(value)
  else if (typeof value === 'object' && value !== null)
    for (const key of Object.keys(value)) {
      into.push(key)
      stringsOf((value as Record<string, unknown>)[key], into)
    }
  return into
}

/** The keys and values of an outcome, for a byte comparison of two answers. */
function shapeOf(value: unknown): string {
  return JSON.stringify(stringsOf(value))
}

function acting(person: Person) {
  return { login: person.login.login, actingTenant: person.current }
}

function own(person: Person) {
  return { login: person.login.login }
}

function hasNoList(outcome: object, list: string, what: string): void {
  check(!(list in outcome), `${what}: a basis-unavailable list carries an array`)
}

async function roleOf(
  context: Context,
  reader: Person,
  team: Team,
  account: AccountId,
): Promise<string | undefined> {
  const listed = kindIs(
    await context.providers().governance.queryOrganizationMembers({
      ...acting(reader),
      organization: team.organization,
    }),
    'succeeded',
    'reading the members',
  )
  const entry = listed.members.find(member => accountEquals(member.account, account))
  if (entry !== undefined)
    check(governanceModelEquals(entry.role.model, DEFAULT_TEAM_MODEL), 'a role names another model')
  return entry?.role.role
}

async function ownTeamMemberships(context: Context, person: Person) {
  const listed = kindIs(
    await context.providers().governance.queryOwnMemberships(own(person)),
    'succeeded',
    'reading own memberships',
  )
  return listed.memberships.filter(
    entry => !organizationEquals(entry.organization, person.personal.organization),
  )
}

async function invite(context: Context, admin: Person, invited: Person, duration?: Duration) {
  const outcome = await context.providers().governance.issueMemberInvitation({
    ...acting(admin),
    invitedLoginIdentifier: invited.identifier,
    ...(duration === undefined ? {} : { duration }),
  })
  return kindIs(outcome, 'succeeded', 'issuing an invitation')
}

async function recognizedTenant(context: Context, login: IssuedLogin): Promise<TenantId> {
  const outcome = await context.providers().operations.recognizeLogin({
    loginProof: login.loginProof,
  })
  return kindIs(outcome, 'recognized', 'recognizing a login').tenant
}

async function recognition(context: Context, login: IssuedLogin): Promise<string> {
  return (await context.providers().operations.recognizeLogin({ loginProof: login.loginProof }))
    .kind
}

const DISPOSITIONS = ['acceptMemberInvitation', 'rejectMemberInvitation'] as const

const CASES: readonly ContractCase[] = [
  // A1: creating a team organization.
  {
    id: 'create-team-atomic',
    rule: 'ID-05, A1: the organization, the creator tenant and the first super administrator exist together',
    async run(context) {
      const ada = await context.person('ada')
      const { governance } = context.providers()
      const created = kindIs(
        await governance.createOrganization({
          ...acting(ada),
          createCallId: 'call-1',
          name: 'Team Ada',
          governanceModelId: 'default-team',
        }),
        'succeeded',
        'creating a team',
      )
      check(
        tenantEquals(created.tenant, tenant(created.organization, ada.account)),
        'the creator tenant is not the tenant of the organization and the creator',
      )
      const teams = await ownTeamMemberships(context, ada)
      check(teams.length === 1, 'the creator does not hold exactly one team membership')
      check(teams[0]!.role.role === DEFAULT_TEAM_ROLES.superAdmin, 'the creator is not super-admin')
      check(tenantEquals(teams[0]!.tenant, created.tenant), 'the membership names another tenant')
      await context.switchTo(ada, created.tenant)
      const members = kindIs(
        await governance.queryOrganizationMembers({
          ...acting(ada),
          organization: created.organization,
        }),
        'succeeded',
        'reading the new members',
      )
      check(members.members.length === 1, 'the new organization has other members')
      const blank = await governance.createOrganization({
        ...acting(ada),
        createCallId: 'call-2',
        name: '   ',
        governanceModelId: 'default-team',
      })
      kindIs(blank, 'denied', 'a blank name')
      check((await ownTeamMemberships(context, ada)).length === 1, 'a blank name made a team')
      return 'passed'
    },
  },
  {
    id: 'create-call-replay',
    rule: 'A1: the same call id with the same input gives the saved result and no second organization',
    async run(context) {
      const ada = await context.person('ada')
      const input = {
        ...acting(ada),
        createCallId: 'call-1',
        name: 'Team Ada',
        governanceModelId: 'default-team',
      }
      const { governance } = context.providers()
      const first = kindIs(
        await governance.createOrganization(input),
        'succeeded',
        'the first create',
      )
      const again = kindIs(await governance.createOrganization(input), 'succeeded', 'the replay')
      check(
        organizationEquals(first.organization, again.organization),
        'the replay made another organization',
      )
      check(tenantEquals(first.tenant, again.tenant), 'the replay named another tenant')
      check((await ownTeamMemberships(context, ada)).length === 1, 'the replay made a second team')
      return 'passed'
    },
  },
  {
    id: 'create-call-conflict',
    rule: 'A1: the same call id with another name or model is conflict, and creates nothing',
    async run(context) {
      const ada = await context.person('ada')
      const base = { ...acting(ada), createCallId: 'call-1', governanceModelId: 'default-team' }
      const { governance } = context.providers()
      kindIs(
        await governance.createOrganization({ ...base, name: 'Team Ada' }),
        'succeeded',
        'the first create',
      )
      const renamed = await governance.createOrganization({ ...base, name: 'Team Bob' })
      kindIs(renamed, 'conflict', 'another name under the same call id')
      check(!('organization' in renamed), 'the conflict hands out the saved organization')
      kindIs(
        await governance.createOrganization({
          ...base,
          name: 'Team Ada',
          governanceModelId: 'other',
        }),
        'conflict',
        'another model under the same call id',
      )
      check((await ownTeamMemberships(context, ada)).length === 1, 'a conflict made a team')
      return 'passed'
    },
  },
  {
    id: 'create-unknown-model-denied',
    rule: 'A1, N6: a model other than default-team is denied and does not fall back to the default',
    async run(context) {
      const ada = await context.person('ada')
      const input = {
        ...acting(ada),
        createCallId: 'call-1',
        name: 'Team',
        governanceModelId: 'custom',
      }
      const { governance } = context.providers()
      kindIs(await governance.createOrganization(input), 'denied', 'an unknown model')
      kindIs(await governance.createOrganization(input), 'denied', 'the replay of the denial')
      check((await ownTeamMemberships(context, ada)).length === 0, 'an unknown model made a team')
      return 'passed'
    },
  },
  {
    id: 'query-create-recall',
    rule: 'A1: the recall reads the receipt only; another input is conflict, no receipt is unknown',
    async run(context) {
      const ada = await context.person('ada')
      const bob = await context.person('bob')
      const { governance } = context.providers()
      const created = kindIs(
        await governance.createOrganization({
          ...acting(ada),
          createCallId: 'call-1',
          name: 'Team Ada',
          governanceModelId: 'default-team',
        }),
        'succeeded',
        'creating a team',
      )
      await governance.createOrganization({
        ...acting(ada),
        createCallId: 'call-2',
        name: 'Team',
        governanceModelId: 'custom',
      })
      const query = { createCallId: 'call-1', name: 'Team Ada', governanceModelId: 'default-team' }
      const recalled = kindIs(
        await governance.queryCreateOrganization({ ...own(ada), ...query }),
        'succeeded',
        'recalling the creation',
      )
      check(
        organizationEquals(recalled.organization, created.organization),
        'the recall names another organization',
      )
      check(tenantEquals(recalled.tenant, created.tenant), 'the recall names another tenant')
      kindIs(
        await governance.queryCreateOrganization({ ...own(ada), ...query, name: 'Team Bob' }),
        'conflict',
        'recalling with another name',
      )
      kindIs(
        await governance.queryCreateOrganization({ ...own(ada), ...query, createCallId: 'call-9' }),
        'unknown',
        'recalling a call that has no receipt',
      )
      kindIs(
        await governance.queryCreateOrganization({ ...own(bob), ...query }),
        'unknown',
        "recalling another account's call",
      )
      kindIs(
        await governance.queryCreateOrganization({
          ...own(ada),
          createCallId: 'call-2',
          name: 'Team',
          governanceModelId: 'custom',
        }),
        'denied',
        'recalling a denied creation',
      )
      return 'passed'
    },
  },
  // A2: issuing an invitation.
  {
    id: 'issue-requires-super-admin',
    rule: 'A2, D1: only a current super administrator of the acting organization issues',
    async run(context) {
      const ada = await context.person('ada')
      const bob = await context.person('bob')
      const cyd = await context.person('cyd')
      const team = await context.team(ada)
      await context.join(team, ada, bob)
      const { governance } = context.providers()
      kindIs(
        await governance.issueMemberInvitation({
          ...acting(bob),
          invitedLoginIdentifier: cyd.identifier,
        }),
        'denied',
        'a plain member issuing',
      )
      const received = kindIs(
        await governance.queryReceivedInvitations(own(cyd)),
        'succeeded',
        'reading received invitations',
      )
      check(received.invitations.length === 0, 'a denied issue left an invitation')
      await invite(context, ada, cyd)
      return 'passed'
    },
  },
  {
    id: 'issue-personal-denied',
    rule: 'A2: a personal organization does not invite',
    async run(context) {
      const ada = await context.person('ada')
      const bob = await context.person('bob')
      kindIs(
        await context.providers().governance.issueMemberInvitation({
          ...acting(ada),
          invitedLoginIdentifier: bob.identifier,
        }),
        'denied',
        'inviting into a personal organization',
      )
      return 'passed'
    },
  },
  {
    id: 'issue-unknown-not-visible',
    rule: 'A2: an identifier that names no active account is not-visible',
    async run(context) {
      const ada = await context.person('ada')
      await context.team(ada)
      const outcome = await context.providers().governance.issueMemberInvitation({
        ...acting(ada),
        invitedLoginIdentifier: 'suite-nobody',
      })
      kindIs(outcome, 'not-visible', 'inviting an unknown identifier')
      return 'passed'
    },
  },
  {
    id: 'issue-duration-range',
    rule: 'A2, ID-13: a duration beyond the configured maximum, or not longer than zero, is denied',
    async run(context) {
      const ada = await context.person('ada')
      const bob = await context.person('bob')
      await context.team(ada)
      const now = context.clock.current()
      const within = await invite(context, ada, bob, context.options.long)
      check(
        sameInstant(within.expiresAt, addDuration(now, context.options.long)!),
        'the expiry is not the issue time plus the requested duration',
      )
      const { governance } = context.providers()
      for (const [duration, what] of [
        [timesDuration(context.options.long, 2), 'a duration beyond the maximum'],
        [timesDuration(context.options.short, 0), 'a zero duration'],
      ] as const)
        kindIs(
          await governance.issueMemberInvitation({
            ...acting(ada),
            invitedLoginIdentifier: bob.identifier,
            duration,
          }),
          'denied',
          what,
        )
      const received = kindIs(
        await governance.queryReceivedInvitations(own(bob)),
        'succeeded',
        'reading received invitations',
      )
      check(received.invitations.length === 1, 'a denied duration left an invitation')
      return 'passed'
    },
  },
  {
    id: 'issue-default-duration-frozen',
    rule: 'A2, ID-07, ID-13: an omitted duration uses the default read at issue; later changes do not move it',
    async run(context) {
      const ada = await context.person('ada')
      const bob = await context.person('bob')
      await context.team(ada)
      const now = context.clock.current()
      const issued = await invite(context, ada, bob)
      check(
        sameInstant(issued.expiresAt, addDuration(now, context.options.short)!),
        'the expiry is not the issue time plus the default duration',
      )
      context.invitationTerms.set({
        defaultDuration: context.options.long,
        maxDuration: context.options.long,
      })
      context.clock.advanceBy(context.options.short)
      const { governance } = context.providers()
      const read = kindIs(
        await governance.queryInvitation({ ...acting(bob), invitation: issued.invitation }),
        'succeeded',
        'reading the invitation',
      )
      check(
        sameInstant(read.invitation.expiresAt, issued.expiresAt),
        'a config change moved the expiry',
      )
      check(read.invitation.state === 'expired', 'the invitation is not expired at its expiry')
      const late = kindIs(
        await governance.acceptMemberInvitation({
          ...acting(bob),
          invitation: issued.invitation,
          expectedState: 'open',
        }),
        'no-change',
        'accepting an expired invitation',
      )
      check(late.state === 'expired', 'the late acceptance did not carry the expired terminal')
      return 'passed'
    },
  },
  // A3: accepting an invitation.
  {
    id: 'accept-first-join-member',
    rule: 'A3, ID-06: a first join gives a plain member in the stable tenant of the organization and account',
    async run(context) {
      const ada = await context.person('ada')
      const bob = await context.person('bob')
      const team = await context.team(ada)
      const joined = await context.join(team, ada, bob)
      check(
        tenantEquals(joined, tenant(team.organization, bob.account)),
        'the member tenant is not stable',
      )
      check(
        (await roleOf(context, ada, team, bob.account)) === DEFAULT_TEAM_ROLES.member,
        'the new member is not a plain member',
      )
      return 'passed'
    },
  },
  {
    id: 'rejoin-same-tenant-member',
    rule: 'A3, ID-01: a removed member who joins again keeps the same tenant and is a plain member',
    async run(context) {
      const ada = await context.person('ada')
      const bob = await context.person('bob')
      const team = await context.team(ada)
      const first = await context.join(team, ada, bob)
      kindIs(
        await context.providers().governance.removeMember({
          ...acting(ada),
          organization: team.organization,
          account: bob.account,
          expectedRole: DEFAULT_TEAM_ROLES.member,
        }),
        'succeeded',
        'removing the member',
      )
      const second = await context.join(team, ada, bob)
      check(tenantEquals(first, second), 'the rejoin made another tenant')
      check(
        (await roleOf(context, ada, team, bob.account)) === DEFAULT_TEAM_ROLES.member,
        'the rejoined account is not a plain member',
      )
      return 'passed'
    },
  },
  {
    id: 'former-admin-rejoins-as-member',
    rule: 'A3, ID-06: a former super administrator who joins again does not get the old role back',
    async run(context) {
      const ada = await context.person('ada')
      const bob = await context.person('bob')
      const team = await context.team(ada)
      await context.join(team, ada, bob)
      const { governance } = context.providers()
      kindIs(
        await governance.changeMemberRole({
          ...acting(ada),
          organization: team.organization,
          account: bob.account,
          expectedRole: DEFAULT_TEAM_ROLES.member,
          targetRole: DEFAULT_TEAM_ROLES.superAdmin,
        }),
        'succeeded',
        'promoting the member',
      )
      kindIs(
        await governance.leaveOrganization(acting(bob)),
        'succeeded',
        'the former admin leaving',
      )
      await context.join(team, ada, bob)
      check(
        (await roleOf(context, ada, team, bob.account)) === DEFAULT_TEAM_ROLES.member,
        'the former admin rejoined with the old role',
      )
      return 'passed'
    },
  },
  {
    id: 'accept-already-member-no-change',
    rule: 'A3: an active member who accepts is no-change, the invitation ends accepted, role and tenant stay',
    async run(context) {
      const ada = await context.person('ada')
      const bob = await context.person('bob')
      const team = await context.team(ada)
      const joined = await context.join(team, ada, bob)
      const second = await invite(context, ada, bob)
      const { governance } = context.providers()
      const outcome = kindIs(
        await governance.acceptMemberInvitation({
          ...acting(bob),
          invitation: second.invitation,
          expectedState: 'open',
        }),
        'no-change',
        'an active member accepting',
      )
      check(outcome.state === 'accepted', 'the invitation did not end accepted')
      const read = kindIs(
        await governance.queryInvitation({ ...acting(bob), invitation: second.invitation }),
        'succeeded',
        'reading the invitation',
      )
      check(read.invitation.state === 'accepted', 'the stored terminal is not accepted')
      const teams = await ownTeamMemberships(context, bob)
      check(teams.length === 1 && tenantEquals(teams[0]!.tenant, joined), 'the tenant changed')
      check(teams[0]!.role.role === DEFAULT_TEAM_ROLES.member, 'the role changed')
      return 'passed'
    },
  },
  {
    id: 'accept-by-other-account-denied',
    rule: 'A3: an account that can see the invitation but is not the invitee is denied; a stranger gets not-visible',
    async run(context) {
      const ada = await context.person('ada')
      const bob = await context.person('bob')
      const cyd = await context.person('cyd')
      await context.team(ada)
      const issued = await invite(context, ada, bob)
      const { governance } = context.providers()
      for (const method of DISPOSITIONS) {
        kindIs(
          await governance[method]({
            ...acting(ada),
            invitation: issued.invitation,
            expectedState: 'open',
          }),
          'denied',
          `the issuing admin calling ${method}`,
        )
        kindIs(
          await governance[method]({
            ...acting(cyd),
            invitation: issued.invitation,
            expectedState: 'open',
          }),
          'not-visible',
          `a stranger calling ${method}`,
        )
      }
      kindIs(
        await governance.withdrawMemberInvitation({
          ...acting(bob),
          invitation: issued.invitation,
          expectedState: 'open',
        }),
        'denied',
        'the invitee withdrawing',
      )
      const read = kindIs(
        await governance.queryInvitation({ ...acting(bob), invitation: issued.invitation }),
        'succeeded',
        'reading the invitation',
      )
      check(read.invitation.state === 'open', 'a refused disposition changed the invitation')
      return 'passed'
    },
  },
  {
    id: 'accept-unknown-not-visible',
    rule: 'A3, F3: an unknown invitation and a hidden one give the same not-visible',
    async run(context) {
      const ada = await context.person('ada')
      const bob = await context.person('bob')
      const cyd = await context.person('cyd')
      await context.team(ada)
      const issued = await invite(context, ada, bob)
      const { governance } = context.providers()
      const unknown = await governance.acceptMemberInvitation({
        ...acting(cyd),
        invitation: 'inv_suite_unknown',
        expectedState: 'open',
      })
      const hidden = await governance.acceptMemberInvitation({
        ...acting(cyd),
        invitation: issued.invitation,
        expectedState: 'open',
      })
      kindIs(unknown, 'not-visible', 'accepting an unknown invitation')
      check(shapeOf(unknown) === shapeOf(hidden), 'an unknown and a hidden invitation differ')
      return 'passed'
    },
  },
  // A4: one terminal per invitation.
  {
    id: 'terminal-race',
    rule: 'A4, ID-07: concurrent accept, reject and withdraw form exactly one terminal',
    async run(context) {
      const ada = await context.person('ada')
      await context.team(ada)
      const { governance } = context.providers()
      for (let round = 0; round < 5; round++) {
        const bob = await context.person(`bob-${round}`)
        const issued = await invite(context, ada, bob)
        const disposition = { invitation: issued.invitation, expectedState: 'open' as const }
        const outcomes = await Promise.all([
          governance.acceptMemberInvitation({ ...acting(bob), ...disposition }),
          governance.rejectMemberInvitation({ ...acting(bob), ...disposition }),
          governance.withdrawMemberInvitation({ ...acting(ada), ...disposition }),
        ])
        const won = outcomes.filter(outcome => outcome.kind === 'succeeded')
        check(won.length === 1, `round ${round}: ${won.length} dispositions succeeded`)
        const terminal = (won[0] as { state: InvitationTerminal }).state
        for (const outcome of outcomes) {
          check(
            outcome.kind === 'succeeded' || outcome.kind === 'no-change',
            `round ${round}: a disposition gave ${outcome.kind}`,
          )
          check(
            (outcome as { state: InvitationTerminal }).state === terminal,
            `round ${round}: two terminals were reported`,
          )
        }
        const read = kindIs(
          await governance.queryInvitation({ ...acting(ada), invitation: issued.invitation }),
          'succeeded',
          'reading the invitation',
        )
        check(read.invitation.state === terminal, `round ${round}: the stored terminal differs`)
      }
      return 'passed'
    },
  },
  {
    id: 'expired-persisted',
    rule: 'A4, ID-07: the first finding of expiry is kept; a clock that goes back does not reopen it',
    async run(context) {
      const ada = await context.person('ada')
      const bob = await context.person('bob')
      await context.team(ada)
      const issued = await invite(context, ada, bob)
      context.clock.setTo(issued.expiresAt)
      const disposition = { invitation: issued.invitation, expectedState: 'open' as const }
      const found = kindIs(
        await context
          .providers()
          .governance.rejectMemberInvitation({ ...acting(bob), ...disposition }),
        'no-change',
        'disposing at the expiry',
      )
      check(found.state === 'expired', 'the invitation did not expire at its expiry')
      context.clock.setTo(justBefore(issued.expiresAt)!)
      const back = await context.providers().governance.acceptMemberInvitation({
        ...acting(bob),
        ...disposition,
      })
      check(back.kind !== 'succeeded', 'a backward clock reopened an expired invitation')
      if (context.fixture.restart === undefined) return 'passed'
      await context.restart()
      const reopened = kindIs(
        await context
          .providers()
          .governance.acceptMemberInvitation({ ...acting(bob), ...disposition }),
        'no-change',
        'accepting after a restart with an earlier clock',
      )
      check(reopened.state === 'expired', 'the restart lost the expired terminal')
      check(
        (await ownTeamMemberships(context, bob)).length === 0,
        'the expired invitation admitted',
      )
      return 'passed'
    },
  },
  {
    id: 'terminal-replay-no-change',
    rule: 'A4, PC:268: a disposition of a terminal invitation is no-change with the terminal formed',
    async run(context) {
      const ada = await context.person('ada')
      const bob = await context.person('bob')
      await context.team(ada)
      const issued = await invite(context, ada, bob)
      const disposition = { invitation: issued.invitation, expectedState: 'open' as const }
      const { governance } = context.providers()
      const first = kindIs(
        await governance.rejectMemberInvitation({ ...acting(bob), ...disposition }),
        'succeeded',
        'the first rejection',
      )
      check(first.state === 'rejected', 'the rejection formed another terminal')
      for (const [outcome, what] of [
        [
          await governance.rejectMemberInvitation({ ...acting(bob), ...disposition }),
          'a second rejection',
        ],
        [
          await governance.acceptMemberInvitation({ ...acting(bob), ...disposition }),
          'a late acceptance',
        ],
        [
          await governance.withdrawMemberInvitation({ ...acting(ada), ...disposition }),
          'a late withdrawal',
        ],
      ] as const) {
        const replay = kindIs(outcome, 'no-change', what)
        check(replay.state === 'rejected', `${what} carried another terminal`)
      }
      check((await ownTeamMemberships(context, bob)).length === 0, 'a late acceptance admitted')
      return 'passed'
    },
  },
  // A5: leaving.
  {
    id: 'leave-self',
    rule: 'A5, ID-06, B4: a member leaves; the tenant stays, the selection stays, the member is removed',
    async run(context) {
      const ada = await context.person('ada')
      const bob = await context.person('bob')
      const team = await context.team(ada)
      const joined = await context.join(team, ada, bob)
      const { governance } = context.providers()
      kindIs(await governance.leaveOrganization(acting(bob)), 'succeeded', 'leaving')
      check(
        (await ownTeamMemberships(context, bob)).length === 0,
        'the member still holds the team',
      )
      check(
        (await roleOf(context, ada, team, bob.account)) === undefined,
        'the member is still active',
      )
      const removed = kindIs(
        await governance.queryOrganizationMembers({
          ...acting(ada),
          organization: team.organization,
          includeRemoved: true,
        }),
        'succeeded',
        'reading removed members',
      )
      check(
        removed.members.some(member => accountEquals(member.account, bob.account)),
        'the leaver is not among the removed members',
      )
      check(
        tenantEquals(await recognizedTenant(context, bob.login), joined),
        'leaving changed the selection',
      )
      return 'passed'
    },
  },
  {
    id: 'leave-personal-denied',
    rule: 'A5: leaving a personal organization is denied',
    async run(context) {
      const ada = await context.person('ada')
      kindIs(
        await context.providers().governance.leaveOrganization(acting(ada)),
        'denied',
        'leaving the personal organization',
      )
      return 'passed'
    },
  },
  {
    id: 'leave-last-admin-denied',
    rule: 'A5, ID-05: the last super administrator cannot leave',
    async run(context) {
      const ada = await context.person('ada')
      const bob = await context.person('bob')
      const team = await context.team(ada)
      await context.join(team, ada, bob)
      kindIs(
        await context.providers().governance.leaveOrganization(acting(ada)),
        'denied',
        'the last admin leaving',
      )
      check(
        (await roleOf(context, bob, team, ada.account)) === DEFAULT_TEAM_ROLES.superAdmin,
        'the last admin lost the role',
      )
      return 'passed'
    },
  },
  // A6: removing and changing roles.
  {
    id: 'remove-requires-super-admin',
    rule: 'A6, D1: only a current super administrator removes; a non-member cannot see the organization',
    async run(context) {
      const ada = await context.person('ada')
      const bob = await context.person('bob')
      const cyd = await context.person('cyd')
      const dan = await context.person('dan')
      const team = await context.team(ada)
      await context.join(team, ada, bob)
      await context.join(team, ada, cyd)
      const target = {
        organization: team.organization,
        account: cyd.account,
        expectedRole: DEFAULT_TEAM_ROLES.member,
      }
      const { governance } = context.providers()
      kindIs(
        await governance.removeMember({ ...acting(bob), ...target }),
        'denied',
        'a plain member removing',
      )
      kindIs(
        await governance.removeMember({ ...acting(dan), ...target }),
        'not-visible',
        'a stranger removing',
      )
      kindIs(
        await governance.changeMemberRole({
          ...acting(bob),
          ...target,
          targetRole: DEFAULT_TEAM_ROLES.superAdmin,
        }),
        'denied',
        'a plain member promoting',
      )
      check(
        (await roleOf(context, ada, team, cyd.account)) === DEFAULT_TEAM_ROLES.member,
        'a refused change moved the target',
      )
      kindIs(
        await governance.removeMember({ ...acting(ada), ...target }),
        'succeeded',
        'the admin removing',
      )
      return 'passed'
    },
  },
  {
    id: 'change-role-expected-conflict',
    rule: 'A6, PC:290: an expected role that differs at commit is conflict to a caller who can see it',
    async run(context) {
      const ada = await context.person('ada')
      const bob = await context.person('bob')
      const dan = await context.person('dan')
      const team = await context.team(ada)
      await context.join(team, ada, bob)
      const stale = {
        organization: team.organization,
        account: bob.account,
        expectedRole: DEFAULT_TEAM_ROLES.superAdmin,
      }
      const { governance } = context.providers()
      kindIs(
        await governance.changeMemberRole({
          ...acting(ada),
          ...stale,
          targetRole: DEFAULT_TEAM_ROLES.member,
        }),
        'conflict',
        'changing with a stale expected role',
      )
      kindIs(
        await governance.removeMember({ ...acting(ada), ...stale }),
        'conflict',
        'removing with a stale expected role',
      )
      kindIs(
        await governance.changeMemberRole({
          ...acting(dan),
          ...stale,
          targetRole: DEFAULT_TEAM_ROLES.member,
        }),
        'not-visible',
        'a stranger with a stale expected role',
      )
      kindIs(
        await governance.changeMemberRole({
          ...acting(ada),
          ...stale,
          expectedRole: DEFAULT_TEAM_ROLES.member,
          targetRole: 'owner',
        }),
        'denied',
        'a role that the model does not have',
      )
      check(
        (await roleOf(context, ada, team, bob.account)) === DEFAULT_TEAM_ROLES.member,
        'a refused change moved the role',
      )
      kindIs(
        await governance.changeMemberRole({
          ...acting(ada),
          ...stale,
          expectedRole: DEFAULT_TEAM_ROLES.member,
          targetRole: DEFAULT_TEAM_ROLES.superAdmin,
        }),
        'succeeded',
        'changing with the current expected role',
      )
      return 'passed'
    },
  },
  {
    id: 'last-admin-concurrent',
    rule: 'A6, ID-06, ID-10: two administrators removing or demoting each other at once: at most one succeeds',
    async run(context) {
      {
        // The baseline without concurrency: the one super administrator cannot step down alone.
        const solo = await context.person('solo')
        const team = await context.team(solo)
        const self = {
          ...acting(solo),
          organization: team.organization,
          account: solo.account,
          expectedRole: DEFAULT_TEAM_ROLES.superAdmin,
        }
        const { governance } = context.providers()
        kindIs(await governance.removeMember(self), 'denied', 'the one admin removing itself')
        kindIs(
          await governance.changeMemberRole({ ...self, targetRole: DEFAULT_TEAM_ROLES.member }),
          'denied',
          'the one admin demoting itself',
        )
      }
      for (let round = 0; round < 10; round++) {
        const ada = await context.person(`ada-${round}`)
        const bob = await context.person(`bob-${round}`)
        const eve = await context.person(`eve-${round}`)
        const team = await context.team(ada)
        await context.join(team, ada, bob)
        await context.join(team, ada, eve)
        const { governance } = context.providers()
        kindIs(
          await governance.changeMemberRole({
            ...acting(ada),
            organization: team.organization,
            account: bob.account,
            expectedRole: DEFAULT_TEAM_ROLES.member,
            targetRole: DEFAULT_TEAM_ROLES.superAdmin,
          }),
          'succeeded',
          'promoting the second admin',
        )
        const against = (actor: Person, target: Person) => {
          const base = {
            ...acting(actor),
            organization: team.organization,
            account: target.account,
            expectedRole: DEFAULT_TEAM_ROLES.superAdmin,
          }
          return round % 2 === 0
            ? governance.removeMember(base)
            : governance.changeMemberRole({ ...base, targetRole: DEFAULT_TEAM_ROLES.member })
        }
        const outcomes = await Promise.all([against(ada, bob), against(bob, ada)])
        const won = outcomes.filter(outcome => outcome.kind === 'succeeded').length
        check(won <= 1, `round ${round}: both administrators succeeded`)
        for (const outcome of outcomes)
          check(
            outcome.kind === 'succeeded' || outcome.kind === 'denied',
            `round ${round}: the loser got ${outcome.kind}, not denied`,
          )
        const members = kindIs(
          await governance.queryOrganizationMembers({
            ...acting(eve),
            organization: team.organization,
          }),
          'succeeded',
          'reading the members',
        )
        const admins = members.members.filter(
          member => member.role.role === DEFAULT_TEAM_ROLES.superAdmin,
        )
        check(admins.length >= 1, `round ${round}: no super administrator is left`)
      }
      return 'passed'
    },
  },
  {
    id: 'role-change-not-by-invite',
    rule: 'A6, ID-06: accepting another invitation does not change a role up or down',
    async run(context) {
      const ada = await context.person('ada')
      const bob = await context.person('bob')
      const team = await context.team(ada)
      await context.join(team, ada, bob)
      const { governance } = context.providers()
      const again = await invite(context, ada, bob)
      check(!('role' in again), 'an invitation carries a role')
      await governance.acceptMemberInvitation({
        ...acting(bob),
        invitation: again.invitation,
        expectedState: 'open',
      })
      check(
        (await roleOf(context, ada, team, bob.account)) === DEFAULT_TEAM_ROLES.member,
        'an invitation promoted',
      )
      kindIs(
        await governance.changeMemberRole({
          ...acting(ada),
          organization: team.organization,
          account: bob.account,
          expectedRole: DEFAULT_TEAM_ROLES.member,
          targetRole: DEFAULT_TEAM_ROLES.superAdmin,
        }),
        'succeeded',
        'promoting',
      )
      const third = await invite(context, ada, bob)
      await governance.acceptMemberInvitation({
        ...acting(bob),
        invitation: third.invitation,
        expectedState: 'open',
      })
      check(
        (await roleOf(context, ada, team, bob.account)) === DEFAULT_TEAM_ROLES.superAdmin,
        'an invitation demoted',
      )
      return 'passed'
    },
  },
  // A7: read faces.
  {
    id: 'own-memberships-active-only',
    rule: 'A7: own memberships are the active ones of the caller; an ended login is denied',
    async run(context) {
      const ada = await context.person('ada')
      const bob = await context.person('bob')
      const team = await context.team(ada)
      const joined = await context.join(team, ada, bob)
      const { governance } = context.providers()
      const all = kindIs(
        await governance.queryOwnMemberships(own(bob)),
        'succeeded',
        'reading memberships',
      )
      check(all.memberships.length === 2, 'the memberships are not the personal one and the team')
      check(
        all.memberships.some(entry => tenantEquals(entry.tenant, joined)) &&
          all.memberships.some(entry => tenantEquals(entry.tenant, bob.personal)),
        'a membership is missing',
      )
      kindIs(await governance.leaveOrganization(acting(bob)), 'succeeded', 'leaving')
      check((await ownTeamMemberships(context, bob)).length === 0, 'a removed membership is listed')
      kindIs(
        await governance.revokeLogin({ ...own(bob), target: bob.login.login }),
        'succeeded',
        'logging out',
      )
      kindIs(
        await governance.queryOwnMemberships(own(bob)),
        'denied',
        'reading with an ended login',
      )
      return 'passed'
    },
  },
  {
    id: 'members-read-and-removed',
    rule: 'A7: an active member reads the active members; only a super administrator reads the removed ones',
    async run(context) {
      const ada = await context.person('ada')
      const bob = await context.person('bob')
      const cyd = await context.person('cyd')
      const team = await context.team(ada)
      await context.join(team, ada, bob)
      await context.join(team, ada, cyd)
      const { governance } = context.providers()
      const read = { organization: team.organization }
      const active = kindIs(
        await governance.queryOrganizationMembers({ ...acting(bob), ...read }),
        'succeeded',
        'a plain member reading members',
      )
      check(active.members.length === 3, 'the active member list is not complete')
      const refused = await governance.queryOrganizationMembers({
        ...acting(bob),
        ...read,
        includeRemoved: true,
      })
      kindIs(refused, 'denied', 'a plain member reading removed members')
      check(!('members' in refused), 'a refused read carries members')
      kindIs(
        await governance.removeMember({
          ...acting(ada),
          ...read,
          account: cyd.account,
          expectedRole: DEFAULT_TEAM_ROLES.member,
        }),
        'succeeded',
        'removing a member',
      )
      const removed = kindIs(
        await governance.queryOrganizationMembers({
          ...acting(ada),
          ...read,
          includeRemoved: true,
        }),
        'succeeded',
        'the admin reading removed members',
      )
      check(
        removed.members.length === 1 && accountEquals(removed.members[0]!.account, cyd.account),
        'the removed list is not exactly the removed member',
      )
      return 'passed'
    },
  },
  {
    id: 'members-not-visible',
    rule: 'A7, F3: a non-member cannot see the organization, with or without includeRemoved',
    async run(context) {
      const ada = await context.person('ada')
      const dan = await context.person('dan')
      const team = await context.team(ada)
      const { governance } = context.providers()
      const plain = await governance.queryOrganizationMembers({
        ...acting(dan),
        organization: team.organization,
      })
      const removed = await governance.queryOrganizationMembers({
        ...acting(dan),
        organization: team.organization,
        includeRemoved: true,
      })
      const personal = await governance.queryOrganizationMembers({
        ...acting(dan),
        organization: ada.personal.organization,
      })
      kindIs(plain, 'not-visible', 'a stranger reading members')
      check(
        shapeOf(plain) === shapeOf(removed) && shapeOf(plain) === shapeOf(personal),
        'two hidden reads differ',
      )
      return 'passed'
    },
  },
  {
    id: 'invitation-read-visibility',
    rule: 'A7: the invitee and the issuing super administrators read an invitation; others get not-visible',
    async run(context) {
      const ada = await context.person('ada')
      const bob = await context.person('bob')
      const cyd = await context.person('cyd')
      const team = await context.team(ada)
      const issued = await invite(context, ada, bob)
      const { governance } = context.providers()
      for (const reader of [bob, ada]) {
        const read = kindIs(
          await governance.queryInvitation({ ...acting(reader), invitation: issued.invitation }),
          'succeeded',
          'a party reading the invitation',
        )
        const invitation: MemberInvitation = read.invitation
        check(invitation.state === 'open', 'a new invitation is not open')
        check(
          organizationEquals(invitation.organization, team.organization),
          'the organization differs',
        )
        check(accountEquals(invitation.invitedAccount, bob.account), 'the invited account differs')
        check(sameInstant(invitation.expiresAt, issued.expiresAt), 'the expiry differs')
      }
      const hidden = await governance.queryInvitation({
        ...acting(cyd),
        invitation: issued.invitation,
      })
      const unknown = await governance.queryInvitation({
        ...acting(cyd),
        invitation: 'inv_suite_unknown',
      })
      kindIs(hidden, 'not-visible', 'a stranger reading the invitation')
      check(shapeOf(hidden) === shapeOf(unknown), 'a hidden and an unknown invitation differ')
      return 'passed'
    },
  },
  {
    id: 'received-invitations-own',
    rule: 'A7: received invitations are the caller’s own only',
    async run(context) {
      const ada = await context.person('ada')
      const bob = await context.person('bob')
      const cyd = await context.person('cyd')
      await context.team(ada)
      await invite(context, ada, bob)
      await invite(context, ada, cyd)
      const { governance } = context.providers()
      for (const person of [bob, cyd]) {
        const received = kindIs(
          await governance.queryReceivedInvitations(own(person)),
          'succeeded',
          'reading received invitations',
        )
        check(received.invitations.length === 1, 'the received list is not exactly one')
        check(
          accountEquals(received.invitations[0]!.invitedAccount, person.account),
          "the received list shows another account's invitation",
        )
      }
      const none = kindIs(
        await governance.queryReceivedInvitations(own(ada)),
        'succeeded',
        'the issuer reading received',
      )
      check(none.invitations.length === 0, 'the issuer sees invitations it did not receive')
      return 'passed'
    },
  },
  {
    id: 'issued-invitations-admin-only',
    rule: 'A7: issued invitations are for a super administrator; a member and a personal organization are denied',
    async run(context) {
      const ada = await context.person('ada')
      const bob = await context.person('bob')
      const cyd = await context.person('cyd')
      const team = await context.team(ada)
      await context.join(team, ada, bob)
      await invite(context, ada, cyd)
      const { governance } = context.providers()
      const issued = kindIs(
        await governance.queryIssuedInvitations(acting(ada)),
        'succeeded',
        'the admin reading issued',
      )
      check(issued.invitations.length === 2, 'the issued list is not complete')
      const member = await governance.queryIssuedInvitations(acting(bob))
      kindIs(member, 'denied', 'a plain member reading issued')
      check(!('invitations' in member), 'a refused read carries invitations')
      kindIs(
        await governance.queryIssuedInvitations(acting(cyd)),
        'denied',
        'reading issued in a personal organization',
      )
      return 'passed'
    },
  },
  {
    id: 'list-completeness-unavailable',
    rule: 'A7, PC:108: a list that cannot be read whole is basis-unavailable with no array',
    async run(context) {
      const ada = await context.person('ada')
      const bob = await context.person('bob')
      const team = await context.team(ada)
      await context.join(team, ada, bob)
      const { governance } = context.providers()
      const reads = async () =>
        [
          [await governance.queryOwnMemberships(own(ada)), 'memberships'],
          [
            await governance.queryOrganizationMembers({
              ...acting(ada),
              organization: team.organization,
            }),
            'members',
          ],
          [await governance.queryReceivedInvitations(own(bob)), 'invitations'],
          [await governance.queryIssuedInvitations(acting(ada)), 'invitations'],
          [await governance.queryOwnValidLogins(own(ada)), 'logins'],
        ] as const
      context.clock.makeUnavailable('suite: clock down')
      for (const [outcome, list] of await reads()) {
        kindIs(outcome, 'basis-unavailable', `reading ${list} with no clock`)
        hasNoList(outcome, list, `reading ${list} with no clock`)
      }
      context.clock.restore()
      if (context.fixture.injectsRecordFaults !== true) return 'passed'
      context.faults.makeUnavailable('organizations', 'suite: organization store down')
      for (const [outcome, list] of (await reads()).slice(0, 4)) {
        kindIs(outcome, 'basis-unavailable', `reading ${list} with a silent store`)
        hasNoList(outcome, list, `reading ${list} with a silent store`)
      }
      context.faults.restore()
      return 'passed'
    },
  },
  // B1, B2: the current tenant.
  {
    id: 'switch-member-target',
    rule: 'B1, B3: switching to a tenant of an active membership; recognition then names it',
    async run(context) {
      const ada = await context.person('ada')
      const bob = await context.person('bob')
      const team = await context.team(ada)
      const joined = await context.join(team, ada, bob)
      check(
        tenantEquals(await recognizedTenant(context, bob.login), joined),
        'recognition names the old selection',
      )
      const current = kindIs(
        await context.providers().governance.queryCurrentTenant(own(bob)),
        'succeeded',
        'reading the current tenant',
      )
      check(tenantEquals(current.tenant, joined), 'the current tenant is not the switched one')
      return 'passed'
    },
  },
  {
    id: 'switch-non-member-denied',
    rule: 'B1: a tenant without an active membership is denied, and the selection stays',
    async run(context) {
      const ada = await context.person('ada')
      const bob = await context.person('bob')
      const team = await context.team(ada)
      const outcome = await context.providers().governance.switchCurrentTenant({
        ...acting(bob),
        tenant: tenant(team.organization, bob.account),
      })
      kindIs(outcome, 'denied', 'switching into a team without membership')
      check(!('tenant' in outcome), 'a refused switch tells a tenant')
      check(
        tenantEquals(await recognizedTenant(context, bob.login), bob.personal),
        'the selection moved',
      )
      return 'passed'
    },
  },
  {
    id: 'switch-other-account-denied',
    rule: 'B1: a tenant of another account is denied',
    async run(context) {
      const ada = await context.person('ada')
      const bob = await context.person('bob')
      const team = await context.team(ada)
      const { governance } = context.providers()
      for (const [target, what] of [
        [team.tenant, "the other account's team tenant"],
        [ada.personal, "the other account's personal tenant"],
      ] as const)
        kindIs(
          await governance.switchCurrentTenant({ ...acting(bob), tenant: target }),
          'denied',
          what,
        )
      check(
        tenantEquals(await recognizedTenant(context, bob.login), bob.personal),
        'the selection moved',
      )
      return 'passed'
    },
  },
  {
    id: 'switch-same-no-change',
    rule: 'B1: switching to the current selection is no-change',
    async run(context) {
      const bob = await context.person('bob')
      const outcome = await context.providers().governance.switchCurrentTenant({
        ...acting(bob),
        tenant: bob.personal,
      })
      kindIs(outcome, 'no-change', 'switching to the current selection')
      check(!('tenant' in outcome), 'no-change tells a tenant')
      return 'passed'
    },
  },
  {
    id: 'switch-other-login-unaffected',
    rule: 'B1, ID-08: a switch changes this login only',
    async run(context) {
      const ada = await context.person('ada')
      const bob = await context.person('bob')
      const second = await context.another(bob)
      const team = await context.team(ada)
      await context.join(team, ada, bob)
      check(
        tenantEquals(await recognizedTenant(context, second), bob.personal),
        'the other login moved',
      )
      const current = kindIs(
        await context.providers().governance.queryCurrentTenant({ login: second.login }),
        'succeeded',
        'reading the other login',
      )
      check(tenantEquals(current.tenant, bob.personal), 'the other login reads the switched tenant')
      return 'passed'
    },
  },
  {
    id: 'switch-stale-acting-denied',
    rule: 'B1, PC:69: an acting tenant that is not the selection at commit is denied; the selection stays',
    async run(context) {
      const ada = await context.person('ada')
      const bob = await context.person('bob')
      const team = await context.team(ada)
      const joined = await context.join(team, ada, bob)
      const { governance } = context.providers()
      const stale = await governance.switchCurrentTenant({
        login: bob.login.login,
        actingTenant: bob.personal,
        tenant: bob.personal,
      })
      kindIs(stale, 'denied', 'switching with a stale acting tenant')
      check(!('tenant' in stale), 'the refusal tells the selection')
      check(
        tenantEquals(await recognizedTenant(context, bob.login), joined),
        'the stale switch moved it',
      )
      kindIs(
        await governance.queryIssuedInvitations({
          login: ada.login.login,
          actingTenant: ada.personal,
        }),
        'denied',
        'a read with a stale acting tenant',
      )
      return 'passed'
    },
  },
  {
    id: 'current-initial-personal',
    rule: 'B2: a login that never switched reads its personal tenant',
    async run(context) {
      const bob = await context.person('bob')
      const current = kindIs(
        await context.providers().governance.queryCurrentTenant(own(bob)),
        'succeeded',
        'reading the current tenant',
      )
      check(tenantEquals(current.tenant, bob.personal), 'the first selection is not personal')
      return 'passed'
    },
  },
  {
    id: 'current-after-switch',
    rule: 'B2, B3: after a switch and back, the current tenant and recognition follow',
    async run(context) {
      const ada = await context.person('ada')
      const bob = await context.person('bob')
      const team = await context.team(ada)
      const joined = await context.join(team, ada, bob)
      const { governance } = context.providers()
      const read = async () =>
        kindIs(await governance.queryCurrentTenant(own(bob)), 'succeeded', 'reading current').tenant
      check(tenantEquals(await read(), joined), 'the current tenant is not the team tenant')
      await context.switchTo(bob, bob.personal)
      check(
        tenantEquals(await read(), bob.personal),
        'switching back did not move the current tenant',
      )
      check(
        tenantEquals(await recognizedTenant(context, bob.login), bob.personal),
        'recognition did not follow',
      )
      return 'passed'
    },
  },
  {
    id: 'current-unavailable',
    rule: 'B2: a selection that cannot be read is basis-unavailable, not a made-up personal tenant',
    async run(context) {
      const bob = await context.person('bob')
      const { governance } = context.providers()
      context.clock.makeUnavailable('suite: clock down')
      const noClock = await governance.queryCurrentTenant(own(bob))
      kindIs(noClock, 'basis-unavailable', 'reading the current tenant with no clock')
      check(!('tenant' in noClock), 'an unavailable read names a tenant')
      context.clock.restore()
      if (context.fixture.injectsRecordFaults !== true) return 'passed'
      context.faults.makeUnavailable('logins', 'suite: login store down')
      const noStore = await governance.queryCurrentTenant(own(bob))
      kindIs(noStore, 'basis-unavailable', 'reading the current tenant with a silent login store')
      check(!('tenant' in noStore), 'an unavailable read names a tenant')
      context.faults.restore()
      return 'passed'
    },
  },
  // C1: revoking logins.
  {
    id: 'revoke-target',
    rule: 'C1, ID-03: a revoked login is invalid to recognition; the initiator stays valid',
    async run(context) {
      const ada = await context.person('ada')
      const second = await context.another(ada)
      const { governance } = context.providers()
      kindIs(
        await governance.revokeLogin({ ...own(ada), target: second.login }),
        'succeeded',
        'revoking',
      )
      check(
        (await recognition(context, second)) === 'invalid',
        'a revoked login is still recognized',
      )
      check((await recognition(context, ada.login)) === 'recognized', 'the initiator ended')
      return 'passed'
    },
  },
  {
    id: 'revoke-cross-account-not-visible',
    rule: 'C1, ID-03, F3: a login of another account and an unknown login give the same not-visible',
    async run(context) {
      const ada = await context.person('ada')
      const bob = await context.person('bob')
      const { governance } = context.providers()
      const foreign = await governance.revokeLogin({ ...own(ada), target: bob.login.login })
      const unknown = await governance.revokeLogin({ ...own(ada), target: unissuedLogin() })
      kindIs(foreign, 'not-visible', "revoking another account's login")
      check(shapeOf(foreign) === shapeOf(unknown), 'a foreign and an unknown login differ')
      check((await recognition(context, bob.login)) === 'recognized', 'the foreign login ended')
      return 'passed'
    },
  },
  {
    id: 'revoke-replay-no-change',
    rule: 'C1: revoking a revoked login again is no-change; logging out ends the initiator',
    async run(context) {
      const ada = await context.person('ada')
      const second = await context.another(ada)
      const { governance } = context.providers()
      kindIs(
        await governance.revokeLogin({ ...own(ada), target: second.login }),
        'succeeded',
        'revoking',
      )
      kindIs(
        await governance.revokeLogin({ ...own(ada), target: second.login }),
        'no-change',
        'revoking again',
      )
      kindIs(
        await governance.revokeLogin({ ...own(ada), target: ada.login.login }),
        'succeeded',
        'logging out',
      )
      check(
        (await recognition(context, ada.login)) === 'invalid',
        'the logged-out login is recognized',
      )
      return 'passed'
    },
  },
  {
    id: 'revoked-initiator-denied',
    rule: 'C1, ID-03: a revoked login cannot initiate anything; it gains no standing from a repeat',
    async run(context) {
      const ada = await context.person('ada')
      const second = await context.another(ada)
      const { governance } = context.providers()
      kindIs(
        await governance.revokeLogin({ ...own(ada), target: second.login }),
        'succeeded',
        'revoking',
      )
      const by = { login: second.login }
      kindIs(
        await governance.revokeLogin({ ...by, target: ada.login.login }),
        'denied',
        'a revoked login revoking',
      )
      kindIs(
        await governance.revokeLogin({ ...by, target: second.login }),
        'denied',
        'a revoked login logging out again',
      )
      kindIs(await governance.queryOwnValidLogins(by), 'denied', 'a revoked login listing logins')
      kindIs(
        await governance.switchCurrentTenant({
          ...by,
          actingTenant: ada.personal,
          tenant: ada.personal,
        }),
        'denied',
        'a revoked login switching',
      )
      check((await recognition(context, ada.login)) === 'recognized', 'the initiator ended')
      return 'passed'
    },
  },
  {
    id: 'revoke-other-logins-kept',
    rule: 'C1, ID-03: revoking one login leaves the account’s other logins and other accounts valid',
    async run(context) {
      const ada = await context.person('ada')
      const bob = await context.person('bob')
      const second = await context.another(ada)
      const third = await context.another(ada)
      kindIs(
        await context.providers().governance.revokeLogin({ ...own(ada), target: second.login }),
        'succeeded',
        'revoking',
      )
      check((await recognition(context, third)) === 'recognized', 'a third login ended')
      check(
        (await recognition(context, bob.login)) === 'recognized',
        "another account's login ended",
      )
      return 'passed'
    },
  },
  {
    id: 'revoked-stays-invalid-after-restart',
    rule: 'C1, ID-09: a revocation outlives a restart',
    async run(context) {
      if (context.fixture.restart === undefined) return 'not-applicable'
      const ada = await context.person('ada')
      const second = await context.another(ada)
      kindIs(
        await context.providers().governance.revokeLogin({ ...own(ada), target: second.login }),
        'succeeded',
        'revoking',
      )
      await context.restart()
      check(
        (await recognition(context, second)) === 'invalid',
        'the revocation did not outlive the restart',
      )
      check(
        (await recognition(context, ada.login)) === 'recognized',
        'the restart ended the initiator',
      )
      return 'passed'
    },
  },
  // C2: own valid logins.
  {
    id: 'own-logins-complete',
    rule: 'C2: the list has every valid login of the account, the initiator included',
    async run(context) {
      const ada = await context.person('ada')
      const bob = await context.person('bob')
      const second = await context.another(ada)
      const listed = kindIs(
        await context.providers().governance.queryOwnValidLogins(own(ada)),
        'succeeded',
        'listing own logins',
      )
      check(listed.logins.length === 2, 'the list is not the two logins of the account')
      for (const login of [ada.login, second]) {
        const entry = listed.logins.find(candidate => sameLogin(candidate.login, login.login))
        check(entry !== undefined, 'a valid login is missing')
        check(sameInstant(entry.issuedAt, login.issuedAt), 'an issue time differs')
        check(sameInstant(entry.maxDeadline, login.maxDeadline), 'a maximum deadline differs')
        check(sameInstant(entry.idleDeadline, login.idleDeadline), 'an idle deadline differs')
      }
      check(
        !listed.logins.some(entry => sameLogin(entry.login, bob.login.login)),
        "another account's login is listed",
      )
      return 'passed'
    },
  },
  {
    id: 'own-logins-no-proof',
    rule: 'C2, F3: the list carries no proof, credential or login identifier',
    async run(context) {
      const ada = await context.person('ada')
      const second = await context.another(ada)
      const listed = await context.providers().governance.queryOwnValidLogins(own(ada))
      kindIs(listed, 'succeeded', 'listing own logins')
      const texts = stringsOf(listed)
      for (const secret of [
        ada.login.loginProof,
        second.loginProof,
        ada.credential,
        ada.identifier,
      ])
        check(!texts.some(text => text.includes(secret)), 'the list carries a secret')
      return 'passed'
    },
  },
  {
    id: 'own-logins-excludes-revoked-and-expired',
    rule: 'C2: a revoked or ended login is not listed',
    async run(context) {
      const ada = await context.person('ada')
      const revoked = await context.another(ada)
      context.terms.set({
        maxLifetime: loginLifetime(context.options),
        idlePeriod: context.options.short,
      })
      const ending = await context.another(ada)
      const { governance } = context.providers()
      kindIs(
        await governance.revokeLogin({ ...own(ada), target: revoked.login }),
        'succeeded',
        'revoking',
      )
      context.clock.advanceBy(context.options.short)
      const listed = kindIs(
        await governance.queryOwnValidLogins(own(ada)),
        'succeeded',
        'listing own logins',
      )
      check(
        listed.logins.length === 1 && sameLogin(listed.logins[0]!.login, ada.login.login),
        'the list is not the one valid login',
      )
      check(
        !listed.logins.some(entry => sameLogin(entry.login, ending.login)),
        'an ended login is listed',
      )
      return 'passed'
    },
  },
  // C4: the idle deadline.
  {
    id: 'idle-refreshed-by-success',
    rule: 'C4, ID-03: a report of a successful business access moves the idle deadline to now plus the idle period',
    async run(context) {
      context.terms.set({
        maxLifetime: loginLifetime(context.options),
        idlePeriod: context.options.short,
      })
      const ada = await context.person('ada')
      const half = halfDuration(context.options.short)
      context.clock.advanceBy(half)
      const report = kindIs(
        await context.providers().governance.reportBusinessAccess(own(ada)),
        'refreshed',
        'reporting an access',
      )
      check(
        sameInstant(
          report.idleDeadline,
          addDuration(context.clock.current(), context.options.short)!,
        ),
        'the idle deadline is not now plus the idle period',
      )
      context.clock.advanceBy(half)
      check(
        (await recognition(context, ada.login)) === 'recognized',
        'the refreshed login ended at the old deadline',
      )
      const listed = kindIs(
        await context.providers().governance.queryOwnValidLogins(own(ada)),
        'succeeded',
        'listing own logins',
      )
      check(
        sameInstant(listed.logins[0]!.idleDeadline, report.idleDeadline),
        'the list shows the old idle deadline',
      )
      context.clock.advanceBy(half)
      check(
        (await recognition(context, ada.login)) === 'invalid',
        'the login outlived the new idle deadline',
      )
      return 'passed'
    },
  },
  {
    id: 'idle-not-refreshed-by-failure',
    rule: 'C4: a refused call or a failed report does not refresh',
    async run(context) {
      context.terms.set({
        maxLifetime: loginLifetime(context.options),
        idlePeriod: context.options.short,
      })
      const ada = await context.person('ada')
      const bob = await context.person('bob')
      const { governance } = context.providers()
      context.clock.advanceBy(halfDuration(context.options.short))
      kindIs(await governance.leaveOrganization(acting(ada)), 'denied', 'a refused call')
      kindIs(
        await governance.revokeLogin({ ...own(ada), target: bob.login.login }),
        'not-visible',
        'a hidden target',
      )
      if (context.fixture.injectsRecordFaults === true) {
        context.faults.makeUnavailable('logins', 'suite: login store down')
        kindIs(
          await governance.reportBusinessAccess(own(ada)),
          'basis-unavailable',
          'a report with a silent store',
        )
        context.faults.restore()
      }
      context.clock.setTo(ada.login.idleDeadline)
      check(
        (await recognition(context, ada.login)) === 'invalid',
        'a failure refreshed the idle deadline',
      )
      return 'passed'
    },
  },
  {
    id: 'idle-not-refreshed-by-governance',
    rule: 'C4, PC:106: successful governance calls do not refresh',
    async run(context) {
      context.terms.set({
        maxLifetime: loginLifetime(context.options),
        idlePeriod: context.options.short,
      })
      const ada = await context.person('ada')
      const { governance } = context.providers()
      context.clock.advanceBy(halfDuration(context.options.short))
      kindIs(
        await governance.queryCurrentTenant(own(ada)),
        'succeeded',
        'reading the current tenant',
      )
      kindIs(await governance.queryOwnValidLogins(own(ada)), 'succeeded', 'listing own logins')
      kindIs(await governance.queryOwnMemberships(own(ada)), 'succeeded', 'reading memberships')
      kindIs(
        await governance.createOrganization({
          ...acting(ada),
          createCallId: 'call-1',
          name: 'Team',
          governanceModelId: 'default-team',
        }),
        'succeeded',
        'creating a team',
      )
      context.clock.setTo(ada.login.idleDeadline)
      check(
        (await recognition(context, ada.login)) === 'invalid',
        'a governance call refreshed the idle deadline',
      )
      return 'passed'
    },
  },
  {
    id: 'idle-other-login-unaffected',
    rule: 'C4, ID-03: a report refreshes its own login only',
    async run(context) {
      context.terms.set({
        maxLifetime: loginLifetime(context.options),
        idlePeriod: context.options.short,
      })
      const ada = await context.person('ada')
      const second = await context.another(ada)
      context.clock.advanceBy(halfDuration(context.options.short))
      kindIs(
        await context.providers().governance.reportBusinessAccess(own(ada)),
        'refreshed',
        'reporting',
      )
      context.clock.setTo(second.idleDeadline)
      check((await recognition(context, second)) === 'invalid', 'the other login was refreshed')
      check((await recognition(context, ada.login)) === 'recognized', 'the reported login ended')
      return 'passed'
    },
  },
  {
    id: 'idle-expired-not-revived',
    rule: 'C4, ID-03: a report for an ended or revoked login does not revive it',
    async run(context) {
      context.terms.set({
        maxLifetime: loginLifetime(context.options),
        idlePeriod: context.options.short,
      })
      const ada = await context.person('ada')
      const revoked = await context.another(ada)
      const { governance } = context.providers()
      context.clock.advanceBy(halfDuration(context.options.short))
      const keeper = await context.another(ada)
      kindIs(
        await governance.revokeLogin({ login: keeper.login, target: revoked.login }),
        'succeeded',
        'revoking',
      )
      kindIs(
        await governance.reportBusinessAccess({ login: revoked.login }),
        'not-refreshed',
        'reporting a revoked login',
      )
      check((await recognition(context, revoked)) === 'invalid', 'a report revived a revoked login')
      context.clock.setTo(ada.login.idleDeadline)
      kindIs(
        await governance.reportBusinessAccess(own(ada)),
        'not-refreshed',
        'reporting an ended login',
      )
      check(
        (await recognition(context, ada.login)) === 'invalid',
        'a report revived an ended login',
      )
      kindIs(
        await governance.reportBusinessAccess({ login: unissuedLogin() }),
        'not-refreshed',
        'reporting an unknown login',
      )
      return 'passed'
    },
  },
  // F3: diagnostics.
  {
    id: 'diagnostics-no-secret',
    rule: 'F3, ID-09: no diagnostic quotes a proof, a credential, a login identifier or a login identity',
    async run(context) {
      const ada = await context.person('ada')
      const bob = await context.person('bob')
      const team = await context.team(ada)
      const issued = await invite(context, ada, bob)
      const { governance } = context.providers()
      const secrets = [
        ada.login.loginProof,
        ada.credential,
        ada.identifier,
        bob.identifier,
        ada.login.login.text,
        bob.login.login.text,
      ]
      const calls = () => [
        governance.createOrganization({
          ...acting(ada),
          createCallId: 'call-x',
          name: 'T',
          governanceModelId: 'default-team',
        }),
        governance.queryCreateOrganization({
          ...own(ada),
          createCallId: 'call-x',
          name: 'T',
          governanceModelId: 'default-team',
        }),
        governance.issueMemberInvitation({
          ...acting(ada),
          invitedLoginIdentifier: bob.identifier,
        }),
        governance.acceptMemberInvitation({
          ...acting(bob),
          invitation: issued.invitation,
          expectedState: 'open',
        }),
        governance.queryInvitation({ ...acting(bob), invitation: issued.invitation }),
        governance.queryReceivedInvitations(own(bob)),
        governance.queryIssuedInvitations(acting(ada)),
        governance.queryOwnMemberships(own(ada)),
        governance.queryOrganizationMembers({ ...acting(ada), organization: team.organization }),
        governance.leaveOrganization(acting(ada)),
        governance.removeMember({
          ...acting(ada),
          organization: team.organization,
          account: bob.account,
          expectedRole: 'member',
        }),
        governance.switchCurrentTenant({ ...acting(ada), tenant: ada.personal }),
        governance.queryCurrentTenant(own(ada)),
        governance.revokeLogin({ ...own(ada), target: bob.login.login }),
        governance.queryOwnValidLogins(own(ada)),
        governance.reportBusinessAccess(own(ada)),
      ]
      const scan = async (what: string) => {
        let diagnosed = 0
        for (const outcome of await Promise.all(calls())) {
          if (!('diagnostic' in outcome)) continue
          diagnosed++
          check(typeof outcome.diagnostic === 'string', `${what}: a diagnostic is not text`)
          for (const secret of secrets)
            check(!outcome.diagnostic.includes(secret), `${what}: a diagnostic quotes a secret`)
        }
        check(diagnosed > 0, `${what}: no call gave a diagnostic`)
      }
      context.clock.makeUnavailable('suite: clock down')
      await scan('with no clock')
      context.clock.restore()
      context.invitationTerms.makeUnavailable('suite: terms down')
      const terms = kindIs(
        await governance.issueMemberInvitation({
          ...acting(ada),
          invitedLoginIdentifier: bob.identifier,
        }),
        'basis-unavailable',
        'issuing with no invitation terms',
      )
      for (const secret of secrets)
        check(!terms.diagnostic.includes(secret), 'the terms diagnostic quotes a secret')
      context.invitationTerms.restore()
      if (context.fixture.injectsRecordFaults === true) {
        context.faults.makeUnavailable('organizations', 'suite: organization store down')
        await scan('with a silent organization store')
        context.faults.makeUnavailable('logins', 'suite: login store down')
        await scan('with a silent login store')
        context.faults.restore()
      }
      return 'passed'
    },
  },
]

/** The case names and rules, in run order. */
export const IDENTITY_GOVERNANCE_CONTRACT_CASES: readonly Readonly<{ id: string; rule: string }>[] =
  Object.freeze(CASES.map(({ id, rule }) => Object.freeze({ id, rule })))

/** The login lifetime of the suite's logins: long enough that no case ends one by accident. */
function loginLifetime(options: IdentityGovernanceContractOptions): Duration {
  return timesDuration(options.long, 8)
}

function checkOptions(options: IdentityGovernanceContractOptions): void {
  if (!isPositive(options.short) || !isPositive(options.long))
    throw new RangeError('both suite lifetimes must be longer than zero')
  const short = addDuration(options.start, options.short)
  const long = addDuration(options.start, options.long)
  if (short === undefined || long === undefined || compareInstants(short, long) >= 0)
    throw new RangeError('the short lifetime must be shorter than the long one')
  const earliest = justBefore(options.start)
  const latest = addDuration(options.start, timesDuration(options.long, 16))
  if (earliest === undefined || latest === undefined || spansLeapSecond(earliest, latest))
    throw new RangeError('the suite window must not span a leap second')
}

/**
 * Runs every case on a fresh deployment. Each case gets a clock at `options.start`, login terms of
 * eight times `long` for both lifetimes unless the case sets its own, and invitation terms with
 * `short` as the default and `long` as the maximum. Throws RangeError for unusable options; a
 * provider failure is a failed case, not a throw.
 */
export async function checkIdentityGovernanceContract(
  fixture: IdentityGovernanceContractFixture,
  options: IdentityGovernanceContractOptions,
): Promise<IdentityGovernanceContractReport> {
  checkOptions(options)
  const results: IdentityGovernanceContractCaseResult[] = []
  for (const contractCase of CASES) {
    const clock = manualIdentityClock(options.start)
    const lifetime = loginLifetime(options)
    const terms = adjustableLoginTerms({ maxLifetime: lifetime, idlePeriod: lifetime })
    const invitationTerms = adjustableInvitationTerms({
      defaultDuration: options.short,
      maxDuration: options.long,
    })
    const faults = recordStoreFaults()
    const base = { id: contractCase.id, rule: contractCase.rule }
    try {
      let providers = await fixture.create({
        clock: clock.clock,
        terms: terms.source,
        faults: faults.faults,
        invitationTerms: invitationTerms.source,
      })
      let serial = 0
      const context: Context = {
        fixture,
        options,
        clock,
        terms,
        invitationTerms,
        faults,
        providers: () => providers,
        async restart() {
          if (fixture.restart === undefined)
            throw new ContractViolation('the fixture cannot restart')
          providers = await fixture.restart(providers)
        },
        async person(name) {
          serial++
          const identifier = `suite-${name}-${serial}`
          const credential = `credential-${name}-${serial}`
          const registered = await providers.operations.registerAndActivate({
            loginIdentifier: identifier,
            credential,
          })
          check(registered.kind === 'succeeded', `registering ${name} did not succeed`)
          const login = await providers.operations.issueLogin({
            loginIdentifier: identifier,
            credential,
          })
          check(login.kind === 'succeeded', `logging in as ${name} did not succeed`)
          return {
            identifier,
            credential,
            account: registered.account,
            personal: registered.tenant,
            login,
            current: registered.tenant,
          }
        },
        async another(person) {
          const login = await providers.operations.issueLogin({
            loginIdentifier: person.identifier,
            credential: person.credential,
          })
          check(login.kind === 'succeeded', 'another login did not succeed')
          return login
        },
        async team(admin) {
          serial++
          const created: CreatedOrganization = kindIs(
            await providers.governance.createOrganization({
              ...acting(admin),
              createCallId: `suite-team-${serial}`,
              name: `Suite team ${serial}`,
              governanceModelId: 'default-team',
            }),
            'succeeded',
            'creating a team',
          )
          await context.switchTo(admin, created.tenant)
          return Object.freeze({ organization: created.organization, tenant: created.tenant })
        },
        async join(team, admin, member) {
          const issued = await invite(context, admin, member)
          const accepted = kindIs(
            await providers.governance.acceptMemberInvitation({
              ...acting(member),
              invitation: issued.invitation,
              expectedState: 'open',
            }),
            'succeeded',
            'accepting an invitation',
          )
          check(accepted.state === 'accepted', 'an acceptance formed another terminal')
          const joined = tenant(team.organization, member.account)
          await context.switchTo(member, joined)
          return joined
        },
        async switchTo(person, target) {
          const outcome = await providers.governance.switchCurrentTenant({
            ...acting(person),
            tenant: target,
          })
          check(
            outcome.kind === 'succeeded' || outcome.kind === 'no-change',
            `switching gave ${outcome.kind}`,
          )
          person.current = target
        },
      }
      const status = await contractCase.run(context)
      results.push(Object.freeze({ ...base, status }))
    } catch (error) {
      const detail =
        error instanceof ContractViolation
          ? error.message
          : `the case threw ${error instanceof Error ? error.name : typeof error}`
      results.push(Object.freeze({ ...base, status: 'failed', detail }))
    }
  }
  return Object.freeze({
    passed: results.every(result => result.status !== 'failed'),
    cases: Object.freeze(results),
  })
}
