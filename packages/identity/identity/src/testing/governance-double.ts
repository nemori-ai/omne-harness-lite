// The in-process reference double of the governance port (SPEC ID-18), over the same records as the
// operations double: a revoked login is `invalid` to `recognizeLogin`, and a switch changes the
// `tenant` that `recognizeLogin` names. Each write reads the clock and the configuration first and
// then checks and writes with no await in between, so a check and its write are one commit and
// concurrent calls cannot both pass the last administrator check.
import {
  accountCodec,
  accountEquals,
  loginStateCodec,
  organizationCodec,
  organizationEquals,
  tenant,
  tenantCodec,
  tenantEquals,
  type AccountId,
  type OrganizationId,
  type TenantId,
} from '@omne-harness/legal-identity'
import { compareInstants, type Duration, type Instant } from '@omne-harness/utc-instant'
import type {
  CreateOrganizationOutcome,
  IdentityGovernance,
  InvitationDispositionOutcome,
  InvitationState,
  InvitationTerms,
  InvitationTermsSource,
  MemberInvitation,
} from '../governance.ts'
import type { IdentityOperations } from '../operations.ts'
import {
  DEFAULT_TEAM_MODEL,
  DEFAULT_TEAM_ROLE_MAPPING,
  DEFAULT_TEAM_ROLES,
} from '../qualification.ts'
import { NO_FAULTS, operationsOver, type InProcessIdentityOptions } from './double.ts'
import {
  emit,
  field,
  isFilledText,
  isLive,
  memberKey,
  newRecords,
  randomBody,
  readTime,
  storeDown,
  unavailable,
  type DoubleCheck,
  type IdentityRecords,
  type Instance,
  type InvitationRecord,
  type LoginRecord,
  type MembershipRecord,
  type Unavailable,
} from './records.ts'
import { addDuration, compareDurations, isPositive } from './time.ts'

/** The operations options, plus the invitation terms that governance reads at every issue. */
export type InProcessIdentityGovernanceOptions = InProcessIdentityOptions &
  Readonly<{ invitationTerms: InvitationTermsSource }>

/** One instance of the double: both ports over one deployment's records. */
export type InProcessIdentity = Readonly<{
  operations: IdentityOperations
  governance: IdentityGovernance
  /**
   * New instances over the same records, as a durable provider reopens its store: the records
   * stay, the latest adopted clock reading starts again.
   */
  restart(): InProcessIdentity
}>

const DENIED = Object.freeze({ kind: 'denied' as const })
const NOT_VISIBLE = Object.freeze({ kind: 'not-visible' as const })
const CONFLICT = Object.freeze({ kind: 'conflict' as const })
const NO_CHANGE = Object.freeze({ kind: 'no-change' as const })
const SUCCEEDED = Object.freeze({ kind: 'succeeded' as const })
const NOT_REFRESHED = Object.freeze({ kind: 'not-refreshed' as const })

const DEFAULT_TEAM_MODEL_ID = 'default-team'
const ROLES: readonly string[] = DEFAULT_TEAM_ROLE_MAPPING.roles.map(entry => entry.role)

type Denied = typeof DENIED

/** The checked caller of one call: its login record, at the adopted reading `now`. */
type Caller = Readonly<{ kind: 'caller'; record: LoginRecord; account: AccountId; now: Instant }>

type TermsBasis = Readonly<{ kind: 'read'; terms: InvitationTerms }> | Unavailable

function roleRef(role: string) {
  return Object.freeze({ model: DEFAULT_TEAM_MODEL, role })
}

async function readInvitationTerms(source: InvitationTermsSource): Promise<TermsBasis> {
  let reading
  try {
    reading = await source.read()
  } catch {
    return unavailable('the invitation terms source failed')
  }
  if (reading.kind !== 'read')
    return unavailable(`the invitation terms are unavailable: ${reading.diagnostic}`)
  return Object.freeze({ kind: 'read', terms: reading.terms })
}

function legalTerms(terms: InvitationTerms): boolean {
  return (
    isPositive(terms.defaultDuration) &&
    isPositive(terms.maxDuration) &&
    compareDurations(terms.defaultDuration, terms.maxDuration) <= 0
  )
}

function isOrganization(value: unknown): value is OrganizationId {
  return (
    typeof value === 'object' &&
    value !== null &&
    organizationCodec.encode(value as OrganizationId).ok
  )
}

function isAccount(value: unknown): value is AccountId {
  return typeof value === 'object' && value !== null && accountCodec.encode(value as AccountId).ok
}

function isTenant(value: unknown): value is TenantId {
  return typeof value === 'object' && value !== null && tenantCodec.encode(value as TenantId).ok
}

/** The governance port of one provider instance over the given records. */
export function governanceOver(
  records: IdentityRecords,
  instance: Instance,
  invitationTerms: InvitationTermsSource,
): IdentityGovernance {
  const off = (check: DoubleCheck) => instance.off.has(check)

  /**
   * The initiating login at commit: it must exist and be live. An acting call also needs
   * `actingTenant` to equal the current selection. Synchronous: call it inside the commit.
   */
  const caller = (input: unknown, now: Instant, acting: boolean): Caller | Denied | Unavailable => {
    const down = storeDown(instance, 'logins')
    if (down !== undefined) return down
    const login = field(input, 'login')
    if (typeof login !== 'object' || login === null) return DENIED
    const encoded = loginStateCodec.encode(login as never)
    if (!encoded.ok) return DENIED
    const record = records.loginsById.get(encoded.value)
    if (record === undefined) return DENIED
    if (!isLive(record, now) && !off('initiator-valid')) return DENIED
    if (acting && !off('acting-tenant')) {
      const actingTenant = field(input, 'actingTenant')
      if (!isTenant(actingTenant) || !tenantEquals(actingTenant, record.selection)) return DENIED
    }
    return Object.freeze({ kind: 'caller', record, account: record.account, now })
  }

  const membership = (organization: OrganizationId, account: AccountId) =>
    records.memberships.get(memberKey(organization, account))

  const activeMembership = (organization: OrganizationId, account: AccountId) => {
    const found = membership(organization, account)
    return found !== undefined && found.state === 'active' ? found : undefined
  }

  /**
   * An account that holds or held a membership sees the organization: a former member is told
   * `denied`, not `not-visible`, so the loser of two administrators removing each other is denied.
   */
  const seesOrganization = (organization: OrganizationId, account: AccountId) =>
    membership(organization, account) !== undefined

  const isSuperAdmin = (organization: OrganizationId, account: AccountId) =>
    activeMembership(organization, account)?.role === DEFAULT_TEAM_ROLES.superAdmin

  const superAdminCount = (organization: OrganizationId) => {
    let count = 0
    for (const entry of records.memberships.values())
      if (
        organizationEquals(entry.organization, organization) &&
        entry.state === 'active' &&
        entry.role === DEFAULT_TEAM_ROLES.superAdmin
      )
        count++
    return count
  }

  /** True when the change would leave the organization with no active super administrator. */
  const leavesNoAdmin = (target: MembershipRecord, nextRole: string | undefined) =>
    !off('last-admin') &&
    target.role === DEFAULT_TEAM_ROLES.superAdmin &&
    nextRole !== DEFAULT_TEAM_ROLES.superAdmin &&
    superAdminCount(target.organization) <= 1

  /** The organization of `actingTenant`, when the caller is its current super administrator. */
  const actingAdmin = (who: Caller) => {
    const organization = who.record.selection.organization
    const found = records.organizations.get(organization.text)
    if (found === undefined) return DENIED
    if (found.kind === 'personal' && !off('personal-organization')) return DENIED
    if (!isSuperAdmin(organization, who.account) && !off('super-admin')) return DENIED
    return Object.freeze({ kind: 'admin' as const, organization })
  }

  /** The requested duration within the terms, the default when absent, or `undefined` when out of range. */
  const invitationDuration = (requested: unknown, terms: InvitationTerms): Duration | undefined => {
    if (requested === undefined) return terms.defaultDuration
    let legal: boolean
    try {
      const duration = requested as Duration
      legal = isPositive(duration) && compareDurations(duration, terms.maxDuration) <= 0
    } catch {
      legal = false
    }
    return legal || off('duration-range') ? (requested as Duration) : undefined
  }

  /** Which members a read lists: active by default, removed for a super administrator only. */
  const memberState = (
    includeRemoved: unknown,
    organization: OrganizationId,
    account: AccountId,
  ) => {
    if (activeMembership(organization, account) === undefined) return undefined
    if (includeRemoved === undefined || includeRemoved === false) return 'active' as const
    if (includeRemoved !== true) return undefined
    const allowed = isSuperAdmin(organization, account) || off('removed-requires-admin')
    return allowed ? ('removed' as const) : undefined
  }

  /**
   * The active member that a removal or role change targets. A caller that never was a member
   * cannot see the organization; one that is not a super administrator is denied.
   */
  const memberTarget = (input: unknown, who: Caller) => {
    const organization = field(input, 'organization')
    if (!isOrganization(organization) || !seesOrganization(organization, who.account))
      return NOT_VISIBLE
    if (!isSuperAdmin(organization, who.account) && !off('super-admin')) return DENIED
    const account = field(input, 'account')
    const held = isAccount(account) ? activeMembership(organization, account) : undefined
    if (held === undefined) return NOT_VISIBLE
    return Object.freeze({ kind: 'target' as const, membership: held })
  }

  /** The state of an invitation at `now`. The first time it is found expired, that is written. */
  const settle = (invitation: InvitationRecord, now: Instant, write: boolean): InvitationState => {
    if (invitation.state !== 'open') return invitation.state
    if (compareInstants(now, invitation.expiresAt) < 0) return 'open'
    if (write && !off('expiry-persisted')) invitation.state = 'expired'
    return 'expired'
  }

  const view = (invitation: InvitationRecord, now: Instant): MemberInvitation =>
    Object.freeze({
      invitation: invitation.invitation,
      state: settle(invitation, now, false),
      expiresAt: invitation.expiresAt,
      organization: invitation.organization,
      invitedAccount: invitation.invitedAccount,
    })

  const begin = async (): Promise<Readonly<{ kind: 'read'; instant: Instant }> | Unavailable> =>
    readTime(instance)

  const createOrganization: IdentityGovernance['createOrganization'] = async input => {
    const time = await begin()
    if (time.kind !== 'read') return time
    const who = caller(input, time.instant, true)
    if (who.kind !== 'caller') return who
    const createCallId = field(input, 'createCallId')
    const name = field(input, 'name')
    const governanceModelId = field(input, 'governanceModelId')
    if (
      !isFilledText(createCallId) ||
      typeof name !== 'string' ||
      typeof governanceModelId !== 'string'
    )
      return DENIED
    const down = storeDown(instance, 'organizations')
    if (down !== undefined) return down
    const key = `${who.account.text} ${createCallId}`
    const receipt = records.receipts.get(key)
    if (receipt !== undefined) {
      const same = receipt.name === name && receipt.governanceModelId === governanceModelId
      if (same || off('create-binding')) return receipt.outcome
      return CONFLICT
    }
    const decide = (): CreateOrganizationOutcome => {
      // ID-05: the name cannot be blank. Only the default team model is adopted in this stage.
      if (name.trim() === '') return DENIED
      if (governanceModelId !== DEFAULT_TEAM_MODEL_ID && !off('model')) return DENIED
      const organization = emit(organizationCodec, 'org_')
      const creator = tenant(organization, who.account)
      records.organizations.set(organization.text, Object.freeze({ organization, kind: 'team' }))
      records.memberships.set(memberKey(organization, who.account), {
        organization,
        account: who.account,
        tenant: creator,
        state: 'active',
        role: DEFAULT_TEAM_ROLES.superAdmin,
      })
      return Object.freeze({ kind: 'succeeded', organization, tenant: creator })
    }
    const outcome = decide()
    records.receipts.set(key, Object.freeze({ name, governanceModelId, outcome }))
    return outcome
  }

  const queryCreateOrganization: IdentityGovernance['queryCreateOrganization'] = async input => {
    const time = await begin()
    if (time.kind !== 'read') return time
    const who = caller(input, time.instant, false)
    if (who.kind !== 'caller') return who
    const createCallId = field(input, 'createCallId')
    const name = field(input, 'name')
    const governanceModelId = field(input, 'governanceModelId')
    if (
      !isFilledText(createCallId) ||
      typeof name !== 'string' ||
      typeof governanceModelId !== 'string'
    )
      return DENIED
    if (storeDown(instance, 'organizations') !== undefined)
      return Object.freeze({ kind: 'unknown', diagnostic: 'the receipt store does not answer' })
    const receipt = records.receipts.get(`${who.account.text} ${createCallId}`)
    if (receipt === undefined)
      return Object.freeze({
        kind: 'unknown',
        diagnostic: 'no receipt of this account for the call',
      })
    if (receipt.name !== name || receipt.governanceModelId !== governanceModelId) return CONFLICT
    return receipt.outcome
  }

  const issueMemberInvitation: IdentityGovernance['issueMemberInvitation'] = async input => {
    const time = await begin()
    if (time.kind !== 'read') return time
    const terms = await readInvitationTerms(invitationTerms)
    // Everything below is one commit: no await.
    const who = caller(input, time.instant, true)
    if (who.kind !== 'caller') return who
    const down = storeDown(instance, 'organizations') ?? storeDown(instance, 'accounts')
    if (down !== undefined) return down
    const admin = actingAdmin(who)
    if (admin.kind !== 'admin') return admin
    if (terms.kind !== 'read') return terms
    if (!legalTerms(terms.terms))
      return unavailable(
        'the invitation terms are not legal: a duration is not positive or the default is longer than the maximum',
      )
    const duration = invitationDuration(field(input, 'duration'), terms.terms)
    if (duration === undefined) return DENIED
    // Authorization is decided before the identifier is looked up.
    const invitedLoginIdentifier = field(input, 'invitedLoginIdentifier')
    const invited = isFilledText(invitedLoginIdentifier)
      ? records.accountsByIdentifier.get(invitedLoginIdentifier)
      : undefined
    if (invited === undefined) return NOT_VISIBLE
    const expiresAt = addDuration(time.instant, duration)
    if (expiresAt === undefined) return unavailable('the expiry falls outside years 0000 to 9999')
    const invitation = `inv_${randomBody()}`
    records.invitations.set(invitation, {
      invitation,
      organization: admin.organization,
      invitedAccount: invited.account,
      expiresAt,
      state: 'open',
    })
    return Object.freeze({ kind: 'succeeded', invitation, state: 'open', expiresAt })
  }

  /**
   * Steps 1 and 2 of a disposition: the caller must see the invitation, then be the party the
   * disposition belongs to. `undefined` lets the disposition go on.
   */
  const dispositionRefusal = (
    found: InvitationRecord | undefined,
    who: Caller,
    action: 'accept' | 'reject' | 'withdraw',
  ) => {
    if (found === undefined) return NOT_VISIBLE
    const isInvitee = accountEquals(found.invitedAccount, who.account)
    const isIssuer = isSuperAdmin(found.organization, who.account)
    if (!isInvitee && !isIssuer && !off('invitation-visibility')) return NOT_VISIBLE
    const isParty = action === 'withdraw' ? isIssuer : isInvitee
    if (!isParty && !off('invitee-only')) return DENIED
    return undefined
  }

  /** Steps 4 and 5 of an acceptance, written with the acceptance terminal. */
  const admit = (found: InvitationRecord): InvitationDispositionOutcome => {
    const current = membership(found.organization, found.invitedAccount)
    found.state = 'accepted'
    const outcome = { invitation: found.invitation, state: 'accepted' as const }
    // 4. Already an active member: no member change.
    if (current?.state === 'active') return Object.freeze({ kind: 'no-change', ...outcome })
    // 5. A first join or a rejoin: a plain member in the stable tenant.
    if (current === undefined)
      records.memberships.set(memberKey(found.organization, found.invitedAccount), {
        organization: found.organization,
        account: found.invitedAccount,
        tenant: tenant(found.organization, found.invitedAccount),
        state: 'active',
        role: DEFAULT_TEAM_ROLES.member,
      })
    else {
      current.state = 'active'
      current.role = DEFAULT_TEAM_ROLES.member
    }
    return Object.freeze({ kind: 'succeeded', ...outcome })
  }

  const dispose =
    (action: 'accept' | 'reject' | 'withdraw'): IdentityGovernance['acceptMemberInvitation'] =>
    async input => {
      const time = await begin()
      if (time.kind !== 'read') return time
      const who = caller(input, time.instant, true)
      if (who.kind !== 'caller') return who
      const down = storeDown(instance, 'organizations')
      if (down !== undefined) return down
      const id = field(input, 'invitation')
      const found = typeof id === 'string' ? records.invitations.get(id) : undefined
      // 1 and 2: not visible, or not the party of this disposition.
      const refusal = dispositionRefusal(found, who, action)
      if (refusal !== undefined || found === undefined) return refusal ?? NOT_VISIBLE
      if (field(input, 'expectedState') !== 'open') return DENIED
      // 3. Already expired or terminal: the one terminal that was formed.
      const state = settle(found, time.instant, true)
      if (state !== 'open' && !off('single-terminal'))
        return Object.freeze({ kind: 'no-change', invitation: found.invitation, state })
      if (action === 'accept') return admit(found)
      found.state = action === 'reject' ? 'rejected' : 'withdrawn'
      return Object.freeze({ kind: 'succeeded', invitation: found.invitation, state: found.state })
    }

  const queryInvitation: IdentityGovernance['queryInvitation'] = async input => {
    const time = await begin()
    if (time.kind !== 'read') return time
    const who = caller(input, time.instant, true)
    if (who.kind !== 'caller') return who
    const down = storeDown(instance, 'organizations')
    if (down !== undefined) return down
    const id = field(input, 'invitation')
    const found = typeof id === 'string' ? records.invitations.get(id) : undefined
    if (found === undefined) return NOT_VISIBLE
    const visible =
      accountEquals(found.invitedAccount, who.account) ||
      isSuperAdmin(found.organization, who.account)
    if (!visible && !off('invitation-visibility')) return NOT_VISIBLE
    return Object.freeze({ kind: 'succeeded', invitation: view(found, time.instant) })
  }

  const queryReceivedInvitations: IdentityGovernance['queryReceivedInvitations'] = async input => {
    const time = await begin()
    if (time.kind !== 'read') return time
    const who = caller(input, time.instant, false)
    if (who.kind !== 'caller') return who
    const down = off('list-completeness') ? undefined : storeDown(instance, 'organizations')
    if (down !== undefined) return down
    const invitations = [...records.invitations.values()]
      .filter(entry => accountEquals(entry.invitedAccount, who.account))
      .map(entry => view(entry, time.instant))
    return Object.freeze({ kind: 'succeeded', invitations: Object.freeze(invitations) })
  }

  const queryIssuedInvitations: IdentityGovernance['queryIssuedInvitations'] = async input => {
    const time = await begin()
    if (time.kind !== 'read') return time
    const who = caller(input, time.instant, true)
    if (who.kind !== 'caller') return who
    const down = off('list-completeness') ? undefined : storeDown(instance, 'organizations')
    if (down !== undefined) return down
    const admin = actingAdmin(who)
    if (admin.kind !== 'admin') return admin
    const invitations = [...records.invitations.values()]
      .filter(entry => organizationEquals(entry.organization, admin.organization))
      .map(entry => view(entry, time.instant))
    return Object.freeze({ kind: 'succeeded', invitations: Object.freeze(invitations) })
  }

  const queryOwnMemberships: IdentityGovernance['queryOwnMemberships'] = async input => {
    const time = await begin()
    if (time.kind !== 'read') return time
    const who = caller(input, time.instant, false)
    if (who.kind !== 'caller') return who
    const down = off('list-completeness') ? undefined : storeDown(instance, 'organizations')
    if (down !== undefined) return down
    const memberships = [...records.memberships.values()]
      .filter(entry => entry.state === 'active' && accountEquals(entry.account, who.account))
      .map(entry =>
        Object.freeze({
          organization: entry.organization,
          tenant: entry.tenant,
          role: roleRef(entry.role),
        }),
      )
    return Object.freeze({ kind: 'succeeded', memberships: Object.freeze(memberships) })
  }

  const queryOrganizationMembers: IdentityGovernance['queryOrganizationMembers'] = async input => {
    const time = await begin()
    if (time.kind !== 'read') return time
    const who = caller(input, time.instant, true)
    if (who.kind !== 'caller') return who
    const down = off('list-completeness') ? undefined : storeDown(instance, 'organizations')
    if (down !== undefined) return down
    const organization = field(input, 'organization')
    if (!isOrganization(organization) || !seesOrganization(organization, who.account))
      return NOT_VISIBLE
    const wanted = memberState(field(input, 'includeRemoved'), organization, who.account)
    if (wanted === undefined) return DENIED
    const members = [...records.memberships.values()]
      .filter(
        entry => organizationEquals(entry.organization, organization) && entry.state === wanted,
      )
      .map(entry => Object.freeze({ account: entry.account, role: roleRef(entry.role) }))
    return Object.freeze({ kind: 'succeeded', members: Object.freeze(members) })
  }

  const leaveOrganization: IdentityGovernance['leaveOrganization'] = async input => {
    const time = await begin()
    if (time.kind !== 'read') return time
    const who = caller(input, time.instant, true)
    if (who.kind !== 'caller') return who
    const down = storeDown(instance, 'organizations')
    if (down !== undefined) return down
    const organization = who.record.selection.organization
    const leaving = records.organizations.get(organization.text)
    if (leaving === undefined) return DENIED
    if (leaving.kind === 'personal' && !off('personal-organization')) return DENIED
    const own = activeMembership(organization, who.account)
    if (own === undefined) return DENIED
    if (leavesNoAdmin(own, undefined)) return DENIED
    own.state = 'removed'
    return SUCCEEDED
  }

  const changeMember =
    (change: 'remove' | 'role'): IdentityGovernance['changeMemberRole'] =>
    async input => {
      const time = await begin()
      if (time.kind !== 'read') return time
      const who = caller(input, time.instant, true)
      if (who.kind !== 'caller') return who
      const down = storeDown(instance, 'organizations')
      if (down !== undefined) return down
      const target = memberTarget(input, who)
      if (target.kind !== 'target') return target
      const targetRole = change === 'role' ? field(input, 'targetRole') : undefined
      if (change === 'role' && (typeof targetRole !== 'string' || !ROLES.includes(targetRole)))
        return DENIED
      const held = target.membership
      if (field(input, 'expectedRole') !== held.role && !off('expected-role')) return CONFLICT
      if (leavesNoAdmin(held, targetRole as string | undefined)) return DENIED
      // A negative control only: a provider that lets another call in between check and write.
      if (off('atomic-commit')) await Promise.resolve()
      if (change === 'remove') held.state = 'removed'
      else held.role = targetRole as string
      return SUCCEEDED
    }

  const switchCurrentTenant: IdentityGovernance['switchCurrentTenant'] = async input => {
    const time = await begin()
    if (time.kind !== 'read') return time
    const who = caller(input, time.instant, true)
    if (who.kind !== 'caller') return who
    const down = storeDown(instance, 'organizations')
    if (down !== undefined) return down
    const target = field(input, 'tenant')
    if (!isTenant(target)) return DENIED
    if (!off('switch-membership')) {
      if (!accountEquals(target.account, who.account)) return DENIED
      const held = activeMembership(target.organization, target.account)
      if (held === undefined || !tenantEquals(held.tenant, target)) return DENIED
    }
    if (tenantEquals(target, who.record.selection)) return NO_CHANGE
    who.record.selection = target
    return Object.freeze({ kind: 'succeeded', tenant: target })
  }

  const queryCurrentTenant: IdentityGovernance['queryCurrentTenant'] = async input => {
    const time = await begin()
    if (time.kind !== 'read') return time
    const who = caller(input, time.instant, false)
    if (who.kind !== 'caller') return who
    return Object.freeze({ kind: 'succeeded', tenant: who.record.selection })
  }

  const revokeLogin: IdentityGovernance['revokeLogin'] = async input => {
    const time = await begin()
    if (time.kind !== 'read') return time
    const who = caller(input, time.instant, false)
    if (who.kind !== 'caller') return who
    const target = field(input, 'target')
    const encoded =
      typeof target === 'object' && target !== null
        ? loginStateCodec.encode(target as never)
        : undefined
    const found = encoded?.ok === true ? records.loginsById.get(encoded.value) : undefined
    // An unknown target and another account's login give the same answer.
    if (found === undefined) return NOT_VISIBLE
    if (!accountEquals(found.account, who.account))
      return off('uniform-not-visible') ? DENIED : NOT_VISIBLE
    if (!isLive(found, time.instant)) return NO_CHANGE
    found.revoked = true
    return SUCCEEDED
  }

  const queryOwnValidLogins: IdentityGovernance['queryOwnValidLogins'] = async input => {
    const time = await begin()
    if (time.kind !== 'read') return time
    const who = caller(input, time.instant, false)
    if (who.kind !== 'caller') return who
    const logins = [...records.loginsById.values()]
      .filter(entry => accountEquals(entry.account, who.account) && isLive(entry, time.instant))
      .map(entry =>
        Object.freeze({
          login: entry.login,
          issuedAt: entry.issuedAt,
          maxDeadline: entry.maxDeadline,
          idleDeadline: entry.idleDeadline,
        }),
      )
    if (logins.length === 0) return unavailable('the valid login list is empty')
    return Object.freeze({ kind: 'succeeded', logins: Object.freeze(logins) })
  }

  const reportBusinessAccess: IdentityGovernance['reportBusinessAccess'] = async input => {
    const time = await begin()
    if (time.kind !== 'read') return time
    const down = storeDown(instance, 'logins')
    if (down !== undefined) return down
    const login = field(input, 'login')
    const encoded =
      typeof login === 'object' && login !== null
        ? loginStateCodec.encode(login as never)
        : undefined
    const record = encoded?.ok === true ? records.loginsById.get(encoded.value) : undefined
    if (record === undefined) return NOT_REFRESHED
    if (!isLive(record, time.instant) && !off('refresh-live-only')) return NOT_REFRESHED
    const next = addDuration(time.instant, record.idlePeriod)
    if (next === undefined) return unavailable('the idle deadline falls outside years 0000 to 9999')
    if (compareInstants(next, record.idleDeadline) > 0) record.idleDeadline = next
    return Object.freeze({ kind: 'refreshed', idleDeadline: record.idleDeadline })
  }

  return Object.freeze({
    createOrganization,
    queryCreateOrganization,
    issueMemberInvitation,
    acceptMemberInvitation: dispose('accept'),
    rejectMemberInvitation: dispose('reject'),
    withdrawMemberInvitation: dispose('withdraw'),
    queryInvitation,
    queryReceivedInvitations,
    queryIssuedInvitations,
    queryOwnMemberships,
    queryOrganizationMembers,
    leaveOrganization,
    removeMember: changeMember('remove'),
    changeMemberRole: changeMember('role'),
    switchCurrentTenant,
    queryCurrentTenant,
    revokeLogin,
    queryOwnValidLogins,
    reportBusinessAccess,
  })
}

function instanceOf(
  records: IdentityRecords,
  options: InProcessIdentityGovernanceOptions,
  off: ReadonlySet<DoubleCheck>,
): InProcessIdentity {
  const { clock, terms, faults = NO_FAULTS, invitationTerms } = options
  const instance: Instance = { clock, faults, off, latest: undefined }
  return Object.freeze({
    operations: operationsOver(records, instance, terms),
    governance: governanceOver(records, instance, invitationTerms),
    restart: () => instanceOf(records, options, off),
  })
}

/**
 * Creates both ports of the double over one new deployment, with the injected clock, login terms
 * and invitation terms. There is no default for any of them.
 */
export function inProcessIdentity(options: InProcessIdentityGovernanceOptions): InProcessIdentity {
  return instanceOf(newRecords(), options, new Set())
}

/**
 * For negative controls only, and not exported from `./testing`: the same double with the named
 * checks switched off.
 */
export function inProcessIdentityWithout(
  options: InProcessIdentityGovernanceOptions,
  off: readonly DoubleCheck[],
): InProcessIdentity {
  return instanceOf(newRecords(), options, new Set(off))
}
