import {
  DEFAULT_TEAM_MODEL,
  DEFAULT_TEAM_ROLE_MAPPING,
  DEFAULT_TEAM_ROLES,
  type CreateOrganizationOutcome,
  type IdentityGovernance,
  type InvitationDispositionOutcome,
  type IssueMemberInvitationOutcome,
  type InvitationTerminal,
  type InvitationTerms,
  type InvitationTermsSource,
  type MemberInvitation,
  type OrganizationMember,
  type OwnMembership,
  type QueryCreateOrganizationOutcome,
  type ValidLogin,
} from '@omne-harness/identity'
import {
  accountCodec,
  loginStateCodec,
  organizationCodec,
  tenant,
  tenantCodec,
  type AccountId,
  type IdentityTextCodec,
  type LoginStateId,
  type OrganizationId,
  type TenantId,
} from '@omne-harness/legal-identity'
import type {
  CommittedV2,
  CommitResultV2,
  JsonValue,
  QueryResultV2,
  ReadResult,
  SqlIdentity,
} from '@omne-harness/sql-contract'
import {
  encodeInstant,
  parseDuration,
  parseInstant,
  type Duration,
  type Instant,
} from '@omne-harness/utc-instant'
import { addDuration, compareDurations, isPositive } from './deadline.ts'
import { newInvitationId, type IdentifierSource } from './identifiers.ts'
import {
  IdentitySqlResultUnknown,
  readReason,
  unavailable,
  type TimeBasis,
  type Unavailable,
} from './result.ts'
import {
  CLOCK_EARLIER_THAN_RECORD,
  HANDLERS,
  OPERATIONS,
  instantOrderKey,
  isRecord,
  isText,
  type ActingFacts,
  type CallerFacts,
  type GovernanceFacts,
  type GovernanceReadInput,
  type GovernanceReadOutput,
  type GovernanceReply,
  type ModelFacts,
} from './worker/schema.ts'

/** What the governance port shares with the operations of one provider instance. */
export type GovernanceCore = Readonly<{
  /** True after `stop()`. New calls then answer `basis-unavailable`, `provider-stopped`. */
  stopped(): boolean
  /** One clock reading, adopted by the instance: an earlier one than the latest is not adopted. */
  readTime(): Promise<TimeBasis>
  commit(operation: string, facts: GovernanceFacts): Promise<CommitResultV2>
  writeMembership(facts: GovernanceFacts): Promise<GovernanceReply | Unavailable>
  query(identity: SqlIdentity): Promise<QueryResultV2>
  read(handler: string, input: JsonValue): Promise<ReadResult>
}>

export type GovernanceInput = Readonly<{
  invitationTerms: InvitationTermsSource
  identifiers: IdentifierSource
}>

const DENIED = Object.freeze({ kind: 'denied' as const })
const NOT_VISIBLE = Object.freeze({ kind: 'not-visible' as const })
const CONFLICT = Object.freeze({ kind: 'conflict' as const })
const NO_CHANGE = Object.freeze({ kind: 'no-change' as const })
const SUCCEEDED = Object.freeze({ kind: 'succeeded' as const })
const NOT_REFRESHED = Object.freeze({ kind: 'not-refreshed' as const })

/** The one adopted governance model: the default team scheme, revision 1 (ID-05, N6). */
const DEFAULT_TEAM_MODEL_ID = DEFAULT_TEAM_MODEL.model
const MODEL: ModelFacts = Object.freeze({
  roleModel: DEFAULT_TEAM_MODEL.model,
  roleModelRevision: DEFAULT_TEAM_MODEL.revision,
  superAdminRole: DEFAULT_TEAM_ROLES.superAdmin,
  memberRole: DEFAULT_TEAM_ROLES.member,
})
const ROLES: readonly string[] = DEFAULT_TEAM_ROLE_MAPPING.roles.map(entry => entry.role)
const TERMINALS: readonly string[] = ['accepted', 'rejected', 'withdrawn', 'expired']
const STATES: readonly string[] = ['open', ...TERMINALS]

/** A committed reply that does not parse: the write may have happened, so the outcome is unknown. */
function malformedReply(): never {
  throw new IdentitySqlResultUnknown('a governance reply is malformed')
}

function field(input: unknown, name: string): unknown {
  return isRecord(input) ? input[name] : undefined
}

function isFilledText(value: unknown): value is string {
  return isText(value) && value !== ''
}

/** The text of a value that the codec minted, or `undefined` for anything else. */
function textOf<T>(codec: IdentityTextCodec<T>, value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  try {
    const encoded = codec.encode(value as T)
    return encoded.ok ? encoded.value : undefined
  } catch {
    return undefined
  }
}

function parsed<T>(codec: IdentityTextCodec<T>, value: unknown): T | undefined {
  if (!isText(value)) return undefined
  const result = codec.parse(value)
  return result.ok ? result.value : undefined
}

function instantOf(value: unknown): Instant | undefined {
  if (!isText(value)) return undefined
  const result = parseInstant(value)
  return result.ok ? result.value : undefined
}

function tenantText(value: TenantId): string {
  const encoded = tenantCodec.encode(value)
  if (!encoded.ok) throw new TypeError('a minted tenant did not encode')
  return encoded.value
}

/** The tenant of a request as text and halves, or `undefined` when it is not a minted tenant. */
function tenantFacts(value: unknown) {
  const text = textOf(tenantCodec, value)
  const decoded = parsed(tenantCodec, text)
  if (text === undefined || decoded === undefined) return undefined
  return {
    tenant: decoded,
    text,
    organization: decoded.organization.text,
    account: decoded.account.text,
  }
}

/** True when the terms are legal: both durations longer than zero, the default not the longer. */
function legalTerms(terms: InvitationTerms): boolean {
  try {
    return (
      isPositive(terms.defaultDuration) &&
      isPositive(terms.maxDuration) &&
      compareDurations(terms.defaultDuration, terms.maxDuration) <= 0
    )
  } catch {
    return false
  }
}

/** A requested duration within the maximum, or `undefined` for one out of range or not a duration. */
function requestedDuration(requested: unknown, maximum: Duration): Duration | undefined {
  try {
    const duration = requested as Duration
    return isPositive(duration) && compareDurations(duration, maximum) <= 0 ? duration : undefined
  } catch {
    return undefined
  }
}

type Begun = Readonly<{ kind: 'begun'; login: string; now: Instant; nowKey: string }>
type ActingBegun = Begun &
  Readonly<{ acting: TenantId; actingText: string; organization: string; account: string }>

type Written = Readonly<{ kind: 'written'; reply: GovernanceReply }>
type Answered = Readonly<{ kind: 'answered'; output: GovernanceReadOutput }>

function caller(begun: Begun): CallerFacts {
  return { login: begun.login, nowKey: begun.nowKey }
}

function acting(begun: ActingBegun): ActingFacts {
  return {
    ...caller(begun),
    actingTenant: begun.actingText,
    actingOrganization: begun.organization,
    actingAccount: begun.account,
  }
}

function invitationOf(value: unknown): MemberInvitation | undefined {
  if (!isRecord(value)) return undefined
  const state = value['state']
  const expiresAt = instantOf(value['expiresAt'])
  const organization = parsed(organizationCodec, value['organization'])
  const invitedAccount = parsed(accountCodec, value['invitedAccount'])
  if (
    !isFilledText(value['invitation']) ||
    !isText(state) ||
    !STATES.includes(state) ||
    expiresAt === undefined ||
    organization === undefined ||
    invitedAccount === undefined
  )
    return undefined
  return Object.freeze({
    invitation: value['invitation'],
    state: state as MemberInvitation['state'],
    expiresAt,
    organization,
    invitedAccount,
  })
}

function roleOf(value: Readonly<Record<string, unknown>>) {
  const { roleModel, roleModelRevision, role } = value
  if (!isText(roleModel) || !isText(roleModelRevision) || !isText(role)) return undefined
  return Object.freeze({
    model: Object.freeze({ model: roleModel, revision: roleModelRevision }),
    role,
  })
}

function membershipOf(value: unknown): OwnMembership | undefined {
  if (!isRecord(value)) return undefined
  const organization = parsed(organizationCodec, value['organization'])
  const membershipTenant = parsed(tenantCodec, value['tenantText'])
  const role = roleOf(value)
  if (organization === undefined || membershipTenant === undefined || role === undefined)
    return undefined
  return Object.freeze({ organization, tenant: membershipTenant, role })
}

function memberOf(value: unknown): OrganizationMember | undefined {
  if (!isRecord(value)) return undefined
  const account: AccountId | undefined = parsed(accountCodec, value['account'])
  const role = roleOf(value)
  return account === undefined || role === undefined ? undefined : Object.freeze({ account, role })
}

function validLoginOf(value: unknown): ValidLogin | undefined {
  if (!isRecord(value)) return undefined
  const login: LoginStateId | undefined = parsed(loginStateCodec, value['login'])
  const issuedAt = instantOf(value['issuedAt'])
  const maxDeadline = instantOf(value['maxDeadline'])
  const idleDeadline = instantOf(value['idleDeadline'])
  if (
    login === undefined ||
    issuedAt === undefined ||
    maxDeadline === undefined ||
    idleDeadline === undefined
  )
    return undefined
  return Object.freeze({ login, issuedAt, maxDeadline, idleDeadline })
}

/** Every entry of a list output, or `undefined` when the list or any entry does not parse. */
function entriesOf<T>(value: unknown, parse: (entry: unknown) => T | undefined) {
  if (!Array.isArray(value)) return undefined
  const entries: T[] = []
  for (const item of value) {
    const entry = parse(item)
    if (entry === undefined) return undefined
    entries.push(entry)
  }
  return Object.freeze(entries)
}

function dispositionOf(reply: GovernanceReply): InvitationDispositionOutcome {
  switch (reply.outcome) {
    case 'succeeded':
    case 'no-change': {
      const { invitation, state } = reply
      if (!isFilledText(invitation) || !isText(state) || !TERMINALS.includes(state))
        return malformedReply()
      return Object.freeze({
        kind: reply.outcome,
        invitation,
        state: state as InvitationTerminal,
      })
    }
    case 'denied':
      return DENIED
    case 'not-visible':
      return NOT_VISIBLE
    default:
      return malformedReply()
  }
}

/**
 * The outcome that a saved create receipt gives a recall with `name` and `governanceModelId`:
 * the saved outcome for the same input, `conflict` for another, `unknown` for a receipt that does
 * not parse (ID-18 `queryCreateOrganization`).
 */
function recalledOf(
  receipt: unknown,
  name: string,
  governanceModelId: string,
): QueryCreateOrganizationOutcome {
  const malformed = Object.freeze({ kind: 'unknown' as const, diagnostic: 'receipt-malformed' })
  if (!isRecord(receipt) || !isText(receipt['name']) || !isText(receipt['governanceModelId']))
    return malformed
  if (receipt['name'] !== name || receipt['governanceModelId'] !== governanceModelId)
    return CONFLICT
  if (receipt['outcome'] === 'denied') return DENIED
  const organization = parsed(organizationCodec, receipt['organization'])
  const created = parsed(tenantCodec, receipt['tenantText'])
  if (receipt['outcome'] !== 'succeeded' || organization === undefined || created === undefined)
    return malformed
  return Object.freeze({ kind: 'succeeded', organization, tenant: created })
}

/** The outcome of an issue commit. `bounds` is the unavailable basis the participant reported. */
function issuedOf(
  reply: GovernanceReply,
  bounds: Unavailable | undefined,
): IssueMemberInvitationOutcome {
  switch (reply.outcome) {
    case 'succeeded': {
      const expiresAt = instantOf(reply['expiresAt'])
      if (!isFilledText(reply['invitation']) || expiresAt === undefined) return malformedReply()
      return Object.freeze({
        kind: 'succeeded',
        invitation: reply['invitation'],
        state: 'open',
        expiresAt,
      })
    }
    case 'unavailable':
      return bounds ?? malformedReply()
    case 'denied':
      return DENIED
    case 'not-visible':
      return NOT_VISIBLE
    default:
      return malformedReply()
  }
}

/**
 * The new idle deadline of a report from the `login-terms` pre-read: the reading plus the idle
 * period frozen at issue, `not-refreshed` for an unknown or ended login, or no basis.
 */
function nextIdleDeadline(record: unknown, now: Instant) {
  if (record === null || !isRecord(record) || record['live'] !== true) return NOT_REFRESHED
  const idlePeriod = isText(record['idlePeriod']) ? parseDuration(record['idlePeriod']) : undefined
  if (idlePeriod === undefined || !idlePeriod.ok) return unavailable('login-record-malformed')
  const next = addDuration(now, idlePeriod.value)
  if (next === undefined) return unavailable('idle-deadline-out-of-range')
  return Object.freeze({ kind: 'next' as const, idleDeadline: encodeInstant(next) })
}

function createdOf(reply: GovernanceReply): CreateOrganizationOutcome {
  switch (reply.outcome) {
    case 'succeeded': {
      const organization: OrganizationId | undefined = parsed(
        organizationCodec,
        reply['organization'],
      )
      const created = parsed(tenantCodec, reply['tenantText'])
      if (organization === undefined || created === undefined) return malformedReply()
      return Object.freeze({ kind: 'succeeded', organization, tenant: created })
    }
    case 'denied':
      return DENIED
    case 'conflict':
      return CONFLICT
    default:
      return malformedReply()
  }
}

/** The governance port over one instance's storage, clock and terms. */
export function governanceOver(core: GovernanceCore, input: GovernanceInput): IdentityGovernance {
  const { invitationTerms, identifiers } = input

  // --- Bases: the reading, the initiating login, the acting tenant. ---

  const begin = async (request: unknown): Promise<Begun | Unavailable | typeof DENIED> => {
    if (core.stopped()) return unavailable('provider-stopped')
    const time = await core.readTime()
    if (time.kind !== 'read') return time
    const login = textOf(loginStateCodec, field(request, 'login'))
    if (login === undefined) return DENIED
    const nowKey = instantOrderKey(encodeInstant(time.instant))
    return Object.freeze({ kind: 'begun', login, now: time.instant, nowKey })
  }

  const beginActing = async (
    request: unknown,
  ): Promise<ActingBegun | Unavailable | typeof DENIED> => {
    const begun = await begin(request)
    if (begun.kind !== 'begun') return begun
    const actingTenant = tenantFacts(field(request, 'actingTenant'))
    if (actingTenant === undefined) return DENIED
    return Object.freeze({
      ...begun,
      acting: actingTenant.tenant,
      actingText: actingTenant.text,
      organization: actingTenant.organization,
      account: actingTenant.account,
    })
  }

  // --- Storage: one commit per write, one snapshot per read. ---

  const replyOf = (receipt: CommittedV2): Written | Unavailable => {
    const response = receipt.responses[0].reply.response
    if (
      !isRecord(response) ||
      !Object.values(response).every(isText) ||
      !isText(response['outcome'])
    )
      return malformedReply()
    // The reading is earlier than the issue time of a login that the command judged (IS-10).
    if (response['outcome'] === CLOCK_EARLIER_THAN_RECORD)
      return unavailable(CLOCK_EARLIER_THAN_RECORD)
    return Object.freeze({ kind: 'written', reply: response as GovernanceReply })
  }

  const write = async (
    operation: string,
    facts: GovernanceFacts,
  ): Promise<Written | Unavailable> => {
    if (
      facts.kind === 'leave-organization' ||
      facts.kind === 'change-member' ||
      (facts.kind === 'dispose-invitation' && facts.action === 'accept')
    ) {
      const reply = await core.writeMembership(facts)
      if (!('outcome' in reply)) return reply
      if (reply.outcome === CLOCK_EARLIER_THAN_RECORD) return unavailable(CLOCK_EARLIER_THAN_RECORD)
      return { kind: 'written', reply }
    }
    const result = await core.commit(operation, facts)
    switch (result.kind) {
      case 'committed':
        return replyOf(result)
      case 'rolled_back': {
        const stop = result.responses[result.responses.length - 1]?.reply
        const reason = stop === undefined ? 'none' : 'category' in stop ? stop.category : stop.kind
        return unavailable(`governance-rolled-back:${reason}`)
      }
      case 'rejected_before_accept':
        return unavailable(`governance-store-unavailable:${result.reason}`)
      case 'unknown': {
        // The same identity, at most three times. Only a committed receipt gives an outcome.
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const recalled = await core.query(result.identity)
          if (recalled.kind === 'committed') return replyOf(recalled)
          if (recalled.kind === 'rolled_back' || recalled.kind === 'not_committed')
            return unavailable('governance-not-committed')
        }
        throw new IdentitySqlResultUnknown('the governance commit result stays unknown')
      }
      case 'identity_conflict':
        throw new IdentitySqlResultUnknown('the governance operation key was already used')
      default: {
        const _exhaustive: never = result
        throw new IdentitySqlResultUnknown(`unexpected commit result ${String(_exhaustive)}`)
      }
    }
  }

  const query = async (request: GovernanceReadInput): Promise<Answered | Unavailable> => {
    const found = await core.read(HANDLERS.governance, request)
    if (found.kind !== 'read')
      return unavailable(`governance-read-unavailable:${readReason(found)}`)
    const output = found.output
    if (!isRecord(output) || !isText(output['outcome']))
      return unavailable('governance-read-malformed')
    if (output['outcome'] === CLOCK_EARLIER_THAN_RECORD)
      return unavailable(CLOCK_EARLIER_THAN_RECORD)
    return Object.freeze({ kind: 'answered', output: output as GovernanceReadOutput })
  }

  /**
   * A whole list, or `basis-unavailable` with no list (ID-18): a read that fails, or a list with
   * an entry that does not parse, never becomes an empty or a partial list.
   */
  const listRead = async <T>(
    request: GovernanceReadInput,
    key: string,
    parse: (entry: unknown) => T | undefined,
  ): Promise<
    | Readonly<{ kind: 'listed'; entries: readonly T[] }>
    | typeof DENIED
    | typeof NOT_VISIBLE
    | Unavailable
  > => {
    const listed = await query(request)
    if (listed.kind !== 'answered') return listed
    const { outcome } = listed.output
    if (outcome === 'denied') return DENIED
    if (outcome === 'not-visible') return NOT_VISIBLE
    const entries = outcome === 'read' ? entriesOf(listed.output[key], parse) : undefined
    if (entries === undefined) return unavailable('governance-read-malformed')
    return Object.freeze({ kind: 'listed', entries })
  }

  // --- Organizations and memberships (ID-18 "组织与成员关系"). ---

  const createOrganization: IdentityGovernance['createOrganization'] = async request => {
    const begun = await beginActing(request)
    if (begun.kind !== 'begun') return begun
    const createCallId = field(request, 'createCallId')
    const name = field(request, 'name')
    const governanceModelId = field(request, 'governanceModelId')
    if (!isFilledText(createCallId) || !isText(name) || !isText(governanceModelId)) return DENIED
    const organization = identifiers.organization()
    const written = await write(OPERATIONS.createOrganization, {
      kind: 'create-organization',
      ...acting(begun),
      ...MODEL,
      createCallId,
      name,
      governanceModelId,
      decision:
        name.trim() !== '' && governanceModelId === DEFAULT_TEAM_MODEL_ID ? 'create' : 'deny',
      organization: organization.text,
      tenantText: tenantText(tenant(organization, begun.acting.account)),
    })
    return written.kind === 'written' ? createdOf(written.reply) : written
  }

  const queryCreateOrganization: IdentityGovernance['queryCreateOrganization'] = async request => {
    const begun = await begin(request)
    if (begun.kind !== 'begun') return begun
    const createCallId = field(request, 'createCallId')
    const name = field(request, 'name')
    const governanceModelId = field(request, 'governanceModelId')
    if (!isFilledText(createCallId) || !isText(name) || !isText(governanceModelId)) return DENIED
    const answered = await query({ query: 'create-receipt', ...caller(begun), createCallId })
    // A receipt that cannot be read now says nothing about the creation. A reading earlier than the
    // issue time of the initiating login is no basis for the call at all (IS-11).
    if (answered.kind !== 'answered')
      return answered.diagnostic === CLOCK_EARLIER_THAN_RECORD
        ? answered
        : Object.freeze({ kind: 'unknown', diagnostic: answered.diagnostic })
    if (answered.output.outcome === 'denied') return DENIED
    const receipt = answered.output['receipt']
    if (receipt === null)
      return Object.freeze({ kind: 'unknown', diagnostic: 'no-receipt-of-this-account' })
    return recalledOf(receipt, name, governanceModelId)
  }

  /** The terms and the duration of one issue: the expiry, a denial, or no basis. */
  const invitationBounds = async (now: Instant, requested: unknown) => {
    let reading
    try {
      reading = await invitationTerms.read()
    } catch {
      return unavailable('invitation-terms-failed')
    }
    if (reading.kind !== 'read') return unavailable('invitation-terms-unavailable')
    if (!legalTerms(reading.terms)) return unavailable('invitation-terms-illegal')
    const duration =
      requested === undefined
        ? reading.terms.defaultDuration
        : requestedDuration(requested, reading.terms.maxDuration)
    if (duration === undefined) return DENIED
    const expiresAt = addDuration(now, duration)
    if (expiresAt === undefined) return unavailable('invitation-expiry-out-of-range')
    return Object.freeze({ kind: 'ok' as const, expiresAt })
  }

  /**
   * The account of an identifier and its tenant in `organization`, read before the commit. The
   * commit reads the identifier again after the qualification check, so this read does not decide
   * what the caller is told. `null` fields: no account has the identifier.
   */
  const invitedOf = async (identifier: string, organization: OrganizationId) => {
    const found = await query({ query: 'account-of', loginIdentifier: identifier })
    if (found.kind !== 'answered') return found
    const account = found.output['account']
    if (account === null)
      return Object.freeze({ kind: 'invited' as const, account: null, tenantText: null })
    const invited = parsed(accountCodec, account)
    if (invited === undefined) return unavailable('governance-read-malformed')
    return Object.freeze({
      kind: 'invited' as const,
      account: invited.text,
      tenantText: tenantText(tenant(organization, invited)),
    })
  }

  const issueMemberInvitation: IdentityGovernance['issueMemberInvitation'] = async request => {
    const begun = await beginActing(request)
    if (begun.kind !== 'begun') return begun
    const bounds = await invitationBounds(begun.now, field(request, 'duration'))
    const identifier = field(request, 'invitedLoginIdentifier')
    const filled = isFilledText(identifier) ? identifier : null
    const invited =
      bounds.kind === 'ok' && filled !== null
        ? await invitedOf(filled, begun.acting.organization)
        : undefined
    if (invited?.kind === 'basis-unavailable') return invited
    const written = await write(OPERATIONS.issueInvitation, {
      kind: 'issue-invitation',
      ...acting(begun),
      ...MODEL,
      bounds: bounds.kind === 'basis-unavailable' ? 'unavailable' : bounds.kind,
      invitation: newInvitationId(),
      expiresAt: bounds.kind === 'ok' ? encodeInstant(bounds.expiresAt) : null,
      invitedLoginIdentifier: filled,
      invitedAccount: invited?.account ?? null,
      invitedTenantText: invited?.tenantText ?? null,
    })
    if (written.kind !== 'written') return written
    return issuedOf(written.reply, bounds.kind === 'basis-unavailable' ? bounds : undefined)
  }

  const dispose =
    (action: 'accept' | 'reject' | 'withdraw'): IdentityGovernance['acceptMemberInvitation'] =>
    async request => {
      const begun = await beginActing(request)
      if (begun.kind !== 'begun') return begun
      const invitation = field(request, 'invitation')
      const written = await write(OPERATIONS.disposeInvitation, {
        kind: 'dispose-invitation',
        ...acting(begun),
        ...MODEL,
        action,
        invitation: isText(invitation) ? invitation : null,
        expectedOpen: field(request, 'expectedState') === 'open' ? 'yes' : 'no',
      })
      return written.kind === 'written' ? dispositionOf(written.reply) : written
    }

  const queryInvitation: IdentityGovernance['queryInvitation'] = async request => {
    const begun = await beginActing(request)
    if (begun.kind !== 'begun') return begun
    const invitation = field(request, 'invitation')
    const answered = await query({
      query: 'invitation',
      ...acting(begun),
      invitation: isText(invitation) ? invitation : null,
      superAdminRole: MODEL.superAdminRole,
    })
    if (answered.kind !== 'answered') return answered
    const { outcome } = answered.output
    if (outcome === 'denied') return DENIED
    if (outcome === 'not-visible') return NOT_VISIBLE
    const view = outcome === 'read' ? invitationOf(answered.output['invitation']) : undefined
    if (view === undefined) return unavailable('governance-read-malformed')
    return Object.freeze({ kind: 'succeeded', invitation: view })
  }

  const queryReceivedInvitations: IdentityGovernance['queryReceivedInvitations'] =
    async request => {
      const begun = await begin(request)
      if (begun.kind !== 'begun') return begun
      const listed = await listRead(
        { query: 'received', ...caller(begun) },
        'invitations',
        invitationOf,
      )
      if (listed.kind === 'not-visible') return DENIED
      return listed.kind === 'listed'
        ? Object.freeze({ kind: 'succeeded', invitations: listed.entries })
        : listed
    }

  const queryIssuedInvitations: IdentityGovernance['queryIssuedInvitations'] = async request => {
    const begun = await beginActing(request)
    if (begun.kind !== 'begun') return begun
    const listed = await listRead(
      { query: 'issued', ...acting(begun), superAdminRole: MODEL.superAdminRole },
      'invitations',
      invitationOf,
    )
    if (listed.kind === 'not-visible') return DENIED
    return listed.kind === 'listed'
      ? Object.freeze({ kind: 'succeeded', invitations: listed.entries })
      : listed
  }

  const queryOwnMemberships: IdentityGovernance['queryOwnMemberships'] = async request => {
    const begun = await begin(request)
    if (begun.kind !== 'begun') return begun
    const listed = await listRead(
      { query: 'own-memberships', ...caller(begun) },
      'memberships',
      membershipOf,
    )
    if (listed.kind === 'not-visible') return DENIED
    return listed.kind === 'listed'
      ? Object.freeze({ kind: 'succeeded', memberships: listed.entries })
      : listed
  }

  const queryOrganizationMembers: IdentityGovernance['queryOrganizationMembers'] =
    async request => {
      const begun = await beginActing(request)
      if (begun.kind !== 'begun') return begun
      const includeRemoved = field(request, 'includeRemoved')
      const listed = await listRead(
        {
          query: 'members',
          ...acting(begun),
          organization: textOf(organizationCodec, field(request, 'organization')) ?? null,
          wanted:
            includeRemoved === undefined || includeRemoved === false
              ? 'active'
              : includeRemoved === true
                ? 'removed'
                : 'invalid',
          superAdminRole: MODEL.superAdminRole,
        },
        'members',
        memberOf,
      )
      return listed.kind === 'listed'
        ? Object.freeze({ kind: 'succeeded', members: listed.entries })
        : listed
    }

  const leaveOrganization: IdentityGovernance['leaveOrganization'] = async request => {
    const begun = await beginActing(request)
    if (begun.kind !== 'begun') return begun
    const written = await write(OPERATIONS.leaveOrganization, {
      kind: 'leave-organization',
      ...acting(begun),
      ...MODEL,
    })
    if (written.kind !== 'written') return written
    if (written.reply.outcome === 'succeeded') return SUCCEEDED
    return written.reply.outcome === 'denied' ? DENIED : malformedReply()
  }

  const changeMember =
    (change: 'remove' | 'role'): IdentityGovernance['changeMemberRole'] =>
    async request => {
      const begun = await beginActing(request)
      if (begun.kind !== 'begun') return begun
      const expectedRole = field(request, 'expectedRole')
      const targetRole = field(request, 'targetRole')
      const written = await write(OPERATIONS.changeMember, {
        kind: 'change-member',
        ...acting(begun),
        ...MODEL,
        change,
        organization: textOf(organizationCodec, field(request, 'organization')) ?? null,
        account: textOf(accountCodec, field(request, 'account')) ?? null,
        expectedRole: isText(expectedRole) ? expectedRole : null,
        targetRole:
          change === 'role' && isText(targetRole) && ROLES.includes(targetRole) ? targetRole : null,
      })
      if (written.kind !== 'written') return written
      switch (written.reply.outcome) {
        case 'succeeded':
          return SUCCEEDED
        case 'denied':
          return DENIED
        case 'not-visible':
          return NOT_VISIBLE
        case 'conflict':
          return CONFLICT
        default:
          return malformedReply()
      }
    }

  // --- The current tenant (ID-18 "当前租户"). ---

  const switchCurrentTenant: IdentityGovernance['switchCurrentTenant'] = async request => {
    const begun = await beginActing(request)
    if (begun.kind !== 'begun') return begun
    const target = tenantFacts(field(request, 'tenant'))
    const written = await write(OPERATIONS.switchTenant, {
      kind: 'switch-tenant',
      ...acting(begun),
      targetTenant: target?.text ?? null,
      targetOrganization: target?.organization ?? null,
      targetAccount: target?.account ?? null,
    })
    if (written.kind !== 'written') return written
    switch (written.reply.outcome) {
      case 'succeeded': {
        const selected = parsed(tenantCodec, written.reply['tenantText'])
        return selected === undefined
          ? malformedReply()
          : Object.freeze({ kind: 'succeeded', tenant: selected })
      }
      case 'no-change':
        return NO_CHANGE
      case 'denied':
        return DENIED
      default:
        return malformedReply()
    }
  }

  const queryCurrentTenant: IdentityGovernance['queryCurrentTenant'] = async request => {
    const begun = await begin(request)
    if (begun.kind !== 'begun') return begun
    const answered = await query({ query: 'current-tenant', ...caller(begun) })
    if (answered.kind !== 'answered') return answered
    if (answered.output.outcome === 'denied') return DENIED
    const selected =
      answered.output.outcome === 'read'
        ? parsed(tenantCodec, answered.output['tenantText'])
        : undefined
    // A selection that does not parse is not replaced by the personal tenant.
    if (selected === undefined) return unavailable('governance-read-malformed')
    return Object.freeze({ kind: 'succeeded', tenant: selected })
  }

  // --- Logins (ID-18 "登录", "成功业务访问报告"). ---

  const revokeLogin: IdentityGovernance['revokeLogin'] = async request => {
    const begun = await begin(request)
    if (begun.kind !== 'begun') return begun
    const written = await write(OPERATIONS.revokeLogin, {
      kind: 'revoke-login',
      ...caller(begun),
      target: textOf(loginStateCodec, field(request, 'target')) ?? null,
      revokedAt: encodeInstant(begun.now),
    })
    if (written.kind !== 'written') return written
    switch (written.reply.outcome) {
      case 'succeeded':
        return SUCCEEDED
      case 'no-change':
        return NO_CHANGE
      case 'denied':
        return DENIED
      case 'not-visible':
        return NOT_VISIBLE
      default:
        return malformedReply()
    }
  }

  const queryOwnValidLogins: IdentityGovernance['queryOwnValidLogins'] = async request => {
    const begun = await begin(request)
    if (begun.kind !== 'begun') return begun
    const listed = await listRead({ query: 'own-logins', ...caller(begun) }, 'logins', validLoginOf)
    if (listed.kind === 'not-visible') return DENIED
    if (listed.kind !== 'listed') return listed
    // The initiating login is valid, so an empty list is no answer (ID-18).
    if (listed.entries.length === 0) return unavailable('valid-login-list-empty')
    return Object.freeze({ kind: 'succeeded', logins: listed.entries })
  }

  const reportBusinessAccess: IdentityGovernance['reportBusinessAccess'] = async request => {
    if (core.stopped()) return unavailable('provider-stopped')
    const time = await core.readTime()
    if (time.kind !== 'read') return time
    const login = textOf(loginStateCodec, field(request, 'login'))
    if (login === undefined) return NOT_REFRESHED
    const nowKey = instantOrderKey(encodeInstant(time.instant))
    // The idle period frozen at issue, read before the commit; the commit checks validity again.
    const found = await query({ query: 'login-terms', login, nowKey })
    if (found.kind !== 'answered') return found
    const next = nextIdleDeadline(found.output['login'], time.instant)
    if (next.kind !== 'next') return next
    const { idleDeadline } = next
    const written = await write(OPERATIONS.reportAccess, {
      kind: 'report-access',
      login,
      nowKey,
      idleDeadline,
      idleKey: instantOrderKey(idleDeadline),
    })
    if (written.kind !== 'written') return written
    if (written.reply.outcome === 'not-refreshed') return NOT_REFRESHED
    const refreshed = instantOf(written.reply['idleDeadline'])
    if (written.reply.outcome !== 'refreshed' || refreshed === undefined) return malformedReply()
    return Object.freeze({ kind: 'refreshed', idleDeadline: refreshed })
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
