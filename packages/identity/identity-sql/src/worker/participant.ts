// The `identity` participant. It runs inside the provider's write transaction and only executes
// SQL: every identity, digest and time value arrives in the facts, computed by the provider in the
// main thread (DP3-C7). A registration writes its five rows in this one command, so a failure at
// any row rolls back all of them. A taken login identifier is a `conflict`; the unique index on
// the identifier is the second guard against two concurrent registrations.
// A governance command (SPEC IS-10) checks, in this one command and in this order, that the
// initiating login is valid at the call's reading, that the actor holds the role the operation
// needs, and that the expected state still holds; then it writes. The domain's writes are serial,
// so two commands never pass the same check before either writes. A refusal writes nothing and
// answers `participated` with its outcome, so a refusal is not a rollback.
import { membershipGate, standingCommand, type MembershipMode } from './standing.ts'
import type {
  ParticipantModule,
  ParticipantPort,
  ParticipantReply,
} from '@omne-harness/sql-contract/worker'
import {
  CLOCK_EARLIER_THAN_RECORD,
  IDENTITY_PARTICIPANT,
  INVITATION_EXPIRED,
  INVITATION_OPEN,
  MEMBERSHIP_ACTIVE,
  MEMBERSHIP_REMOVED,
  PERSONAL_ORGANIZATION,
  PROTOCOL,
  TEAM_ORGANIZATION,
  isRecord,
  isText,
  type ChangeMemberFacts,
  type CreateOrganizationFacts,
  type DisposeInvitationFacts,
  type GovernanceFacts,
  type IdentityFacts,
  type IssueInvitationFacts,
  type IssueLoginFacts,
  type LeaveOrganizationFacts,
  type RegisterFacts,
  type ReportAccessFacts,
  type RevokeLoginFacts,
  type SwitchTenantFacts,
} from './schema.ts'
import {
  actingCaller,
  holdsActiveRole,
  isTrue,
  liveCaller,
  loginStandingSql,
  membershipOf,
  nullableText,
  oneRow,
  orderKeySql,
  organizationKind,
  STANDING,
  text,
  type Executor,
} from './support.ts'

const REGISTER_FIELDS = [
  'loginIdentifier',
  'account',
  'organization',
  'tenantText',
  'material',
  'roleModel',
  'roleModelRevision',
  'role',
] as const

const ISSUE_FIELDS = [
  'login',
  'account',
  'tenantText',
  'proofDigest',
  'issuedAt',
  'maxDeadline',
  'idleDeadline',
  'maxLifetime',
  'idlePeriod',
] as const

function hasTextFields<K extends string>(
  value: Readonly<Record<string, unknown>>,
  fields: readonly K[],
): value is Readonly<Record<K, string>> {
  return fields.every(field => isText(value[field]))
}

function pick<K extends string>(
  value: Readonly<Record<K, string>>,
  fields: readonly K[],
): Readonly<Record<K, string>> {
  return Object.fromEntries(fields.map(field => [field, value[field]])) as Record<K, string>
}

// --- The shapes of the governance facts. A fact the shape does not admit is `unsupported`. ---

type Shape = Readonly<{
  text: readonly string[]
  nullable?: readonly string[]
  choices?: Readonly<Record<string, readonly string[]>>
}>

const CALLER = ['login', 'nowKey']
const ACTING = [...CALLER, 'actingTenant', 'actingOrganization', 'actingAccount']
const MODEL = ['roleModel', 'roleModelRevision', 'superAdminRole', 'memberRole']

const GOVERNANCE_SHAPES: Readonly<Record<GovernanceFacts['kind'], Shape>> = {
  'create-organization': {
    text: [
      ...ACTING,
      ...MODEL,
      'createCallId',
      'name',
      'governanceModelId',
      'organization',
      'tenantText',
    ],
    choices: { decision: ['create', 'deny'] },
  },
  'issue-invitation': {
    text: [...ACTING, ...MODEL, 'invitation'],
    nullable: ['expiresAt', 'invitedLoginIdentifier', 'invitedAccount', 'invitedTenantText'],
    choices: { bounds: ['ok', 'unavailable', 'denied'] },
  },
  'dispose-invitation': {
    text: [...ACTING, ...MODEL],
    nullable: ['invitation'],
    choices: { action: ['accept', 'reject', 'withdraw'], expectedOpen: ['yes', 'no'] },
  },
  'leave-organization': { text: [...ACTING, ...MODEL] },
  'change-member': {
    text: [...ACTING, ...MODEL],
    nullable: ['organization', 'account', 'expectedRole', 'targetRole'],
    choices: { change: ['remove', 'role'] },
  },
  'switch-tenant': {
    text: ACTING,
    nullable: ['targetTenant', 'targetOrganization', 'targetAccount'],
  },
  'revoke-login': { text: [...CALLER, 'revokedAt'], nullable: ['target'] },
  'report-access': { text: [...CALLER, 'idleDeadline', 'idleKey'] },
}

function isGovernanceKind(kind: unknown): kind is GovernanceFacts['kind'] {
  return isText(kind) && Object.hasOwn(GOVERNANCE_SHAPES, kind)
}

function fits(facts: Readonly<Record<string, unknown>>, shape: Shape): boolean {
  return (
    shape.text.every(field => isText(facts[field])) &&
    (shape.nullable ?? []).every(field => facts[field] === null || isText(facts[field])) &&
    Object.entries(shape.choices ?? {}).every(
      ([field, allowed]) => isText(facts[field]) && allowed.includes(facts[field]),
    )
  )
}

function parseFacts(facts: unknown): IdentityFacts | undefined {
  if (!isRecord(facts)) return undefined
  if (facts['kind'] === 'register' && hasTextFields(facts, REGISTER_FIELDS))
    return { kind: 'register', ...pick(facts, REGISTER_FIELDS) }
  if (facts['kind'] === 'issue-login' && hasTextFields(facts, ISSUE_FIELDS))
    return { kind: 'issue-login', ...pick(facts, ISSUE_FIELDS) }
  const kind = facts['kind']
  // The shape table has just checked every field this kind reads.
  if (isGovernanceKind(kind) && fits(facts, GOVERNANCE_SHAPES[kind]))
    return facts as unknown as GovernanceFacts
  return undefined
}

// --- Registration and login issue (SPEC IS-02, IS-04). ---

function register(facts: RegisterFacts, port: ParticipantPort): ParticipantReply {
  const taken = oneRow(port, 'SELECT account FROM id_account WHERE login_identifier = ? LIMIT 1', [
    facts.loginIdentifier,
  ])
  if (taken !== undefined) return { kind: 'conflict', basis: { reason: 'identifier-taken' } }
  const blocked = membershipGate(port, facts.organization, facts.account)
  if (blocked !== undefined) return { kind: 'conflict', basis: { reason: 'membership-blocked' } }
  port.execute(
    'INSERT INTO id_account (account, login_identifier, personal_organization) VALUES (?, ?, ?)',
    [facts.account, facts.loginIdentifier, facts.organization],
  )
  port.execute('INSERT INTO id_credential (account, material, revision) VALUES (?, ?, ?)', [
    facts.account,
    facts.material,
    1n,
  ])
  port.execute('INSERT INTO id_organization (organization, kind) VALUES (?, ?)', [
    facts.organization,
    PERSONAL_ORGANIZATION,
  ])
  port.execute('INSERT INTO id_tenant (tenant_text, organization, account) VALUES (?, ?, ?)', [
    facts.tenantText,
    facts.organization,
    facts.account,
  ])
  port.execute(
    `INSERT INTO id_membership
      (organization, account, tenant_text, state, role_model, role_model_revision, role, revision)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      facts.organization,
      facts.account,
      facts.tenantText,
      MEMBERSHIP_ACTIVE,
      facts.roleModel,
      facts.roleModelRevision,
      facts.role,
      1n,
    ],
  )
  return { kind: 'participated', response: {} }
}

function issueLogin(facts: IssueLoginFacts, port: ParticipantPort): ParticipantReply {
  port.execute(
    `INSERT INTO id_login
      (login, proof_digest, account, tenant_text, issued_at, max_deadline, idle_deadline, max_lifetime, idle_period)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      facts.login,
      facts.proofDigest,
      facts.account,
      facts.tenantText,
      facts.issuedAt,
      facts.maxDeadline,
      facts.idleDeadline,
      facts.maxLifetime,
      facts.idlePeriod,
    ],
  )
  return { kind: 'participated', response: {} }
}

// --- Governance commands (SPEC IS-10 to IS-14). ---

function reply(outcome: string, fields: Readonly<Record<string, string>> = {}): ParticipantReply {
  return { kind: 'participated', response: { outcome, ...fields } }
}

const DENIED = (): ParticipantReply => reply('denied')
const NOT_VISIBLE = (): ParticipantReply => reply('not-visible')

/** The number of active super administrators of one organization. */
function activeSuperAdmins(port: Executor, organization: string, superAdminRole: string): number {
  const row = oneRow(
    port,
    `SELECT count(*) AS n FROM id_membership
      WHERE organization = ? AND state = ? AND role = ? LIMIT 1`,
    [organization, MEMBERSHIP_ACTIVE, superAdminRole],
  )
  return Number(row?.['n'] ?? 0)
}

/**
 * The last administrator check (ID-06): true when moving `role` to `nextRole` (`null` for leaving
 * or removal) would leave the organization with no active super administrator.
 */
function leavesNoAdmin(
  port: Executor,
  organization: string,
  role: string,
  nextRole: string | null,
  superAdminRole: string,
): boolean {
  if (role !== superAdminRole || nextRole === superAdminRole) return false
  return activeSuperAdmins(port, organization, superAdminRole) <= 1
}

function createOrganization(facts: CreateOrganizationFacts, port: ParticipantPort) {
  const who = actingCaller(port, facts)
  if (who.kind !== 'caller') return reply(who.outcome)
  const saved = oneRow(
    port,
    `SELECT name, governance_model_id, outcome, organization, tenant_text FROM id_create_receipt
      WHERE account = ? AND create_call_id = ? LIMIT 1`,
    [who.account, facts.createCallId],
  )
  if (saved !== undefined) {
    // The receipt binds the name and the model: another input under the same id gets nothing saved.
    if (
      text(saved['name']) !== facts.name ||
      text(saved['governance_model_id']) !== facts.governanceModelId
    )
      return reply('conflict')
    const organization = nullableText(saved['organization'])
    const tenantText = nullableText(saved['tenant_text'])
    return text(saved['outcome']) === 'succeeded' && organization !== null && tenantText !== null
      ? reply('succeeded', { organization, tenantText })
      : DENIED()
  }
  const receipt = (outcome: string, organization: string | null, tenantText: string | null) =>
    port.execute(
      `INSERT INTO id_create_receipt
        (account, create_call_id, name, governance_model_id, outcome, organization, tenant_text)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        who.account,
        facts.createCallId,
        facts.name,
        facts.governanceModelId,
        outcome,
        organization,
        tenantText,
      ],
    )
  if (facts.decision === 'deny') {
    receipt('denied', null, null)
    return DENIED()
  }
  const blocked = membershipGate(port, facts.organization, who.account)
  if (blocked !== undefined) return blocked
  // The organization, the creator's tenant and the first super administrator, in this one command.
  port.execute('INSERT INTO id_organization (organization, kind) VALUES (?, ?)', [
    facts.organization,
    TEAM_ORGANIZATION,
  ])
  port.execute(
    `INSERT INTO id_organization_profile (organization, name, model, model_revision)
      VALUES (?, ?, ?, ?)`,
    [facts.organization, facts.name, facts.roleModel, facts.roleModelRevision],
  )
  port.execute('INSERT INTO id_tenant (tenant_text, organization, account) VALUES (?, ?, ?)', [
    facts.tenantText,
    facts.organization,
    who.account,
  ])
  port.execute(
    `INSERT INTO id_membership
      (organization, account, tenant_text, state, role_model, role_model_revision, role, revision)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      facts.organization,
      who.account,
      facts.tenantText,
      MEMBERSHIP_ACTIVE,
      facts.roleModel,
      facts.roleModelRevision,
      facts.superAdminRole,
      1n,
    ],
  )
  receipt('succeeded', facts.organization, facts.tenantText)
  return reply('succeeded', { organization: facts.organization, tenantText: facts.tenantText })
}

function issueInvitation(facts: IssueInvitationFacts, port: ParticipantPort) {
  const who = actingCaller(port, facts)
  if (who.kind !== 'caller') return reply(who.outcome)
  const organization = facts.actingOrganization
  const kind = organizationKind(port, organization)
  if (kind === undefined || kind === PERSONAL_ORGANIZATION) return DENIED()
  if (!holdsActiveRole(port, organization, who.account, facts.superAdminRole)) return DENIED()
  // The qualification is decided before the identifier is looked up.
  if (facts.bounds === 'unavailable') return reply('unavailable')
  if (facts.bounds === 'denied' || facts.expiresAt === null) return DENIED()
  const invited =
    facts.invitedLoginIdentifier === null
      ? undefined
      : oneRow(port, 'SELECT account FROM id_account WHERE login_identifier = ? LIMIT 1', [
          facts.invitedLoginIdentifier,
        ])
  if (
    invited === undefined ||
    facts.invitedAccount === null ||
    facts.invitedTenantText === null ||
    text(invited['account']) !== facts.invitedAccount
  )
    return NOT_VISIBLE()
  port.execute(
    `INSERT INTO id_invitation
      (invitation, organization, invited_account, tenant_text, expires_at, state, revision)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      facts.invitation,
      organization,
      facts.invitedAccount,
      facts.invitedTenantText,
      facts.expiresAt,
      INVITATION_OPEN,
      1n,
    ],
  )
  return reply('succeeded', { invitation: facts.invitation, expiresAt: facts.expiresAt })
}

type InvitationRow = Readonly<{
  organization: string
  invitedAccount: string
  tenantText: string
  state: string
  reached: boolean
}>

function invitationRow(port: Executor, invitation: string, nowKey: string) {
  const row = oneRow(
    port,
    `SELECT organization, invited_account, tenant_text, state,
        ${orderKeySql('expires_at')} <= ? AS reached
      FROM id_invitation WHERE invitation = ? LIMIT 1`,
    [nowKey, invitation],
  )
  if (row === undefined) return undefined
  const found: InvitationRow = {
    organization: text(row['organization']),
    invitedAccount: text(row['invited_account']),
    tenantText: text(row['tenant_text']),
    state: text(row['state']),
    reached: isTrue(row['reached']),
  }
  return found
}

function setInvitationState(port: Executor, invitation: string, state: string): void {
  port.execute('UPDATE id_invitation SET state = ?, revision = revision + 1 WHERE invitation = ?', [
    state,
    invitation,
  ])
}

/** Acceptance steps 4 and 5 (ID-18), written with the acceptance terminal. */
function admit(
  facts: DisposeInvitationFacts,
  invitation: string,
  found: InvitationRow,
  port: ParticipantPort,
  mode?: MembershipMode,
) {
  const blocked = membershipGate(port, found.organization, found.invitedAccount, mode)
  if (blocked !== undefined) return blocked
  setInvitationState(port, invitation, 'accepted')
  const current = membershipOf(port, found.organization, found.invitedAccount)
  if (current?.state === MEMBERSHIP_ACTIVE)
    return reply('no-change', { invitation, state: 'accepted' })
  if (current === undefined) {
    port.execute('INSERT INTO id_tenant (tenant_text, organization, account) VALUES (?, ?, ?)', [
      found.tenantText,
      found.organization,
      found.invitedAccount,
    ])
    port.execute(
      `INSERT INTO id_membership
        (organization, account, tenant_text, state, role_model, role_model_revision, role, revision)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        found.organization,
        found.invitedAccount,
        found.tenantText,
        MEMBERSHIP_ACTIVE,
        facts.roleModel,
        facts.roleModelRevision,
        facts.memberRole,
        1n,
      ],
    )
  } else
    // A rejoin keeps the tenant and gets a plain member: no old role comes back.
    port.execute(
      `UPDATE id_membership SET state = ?, role = ?, role_model = ?, role_model_revision = ?,
          revision = revision + 1
        WHERE organization = ? AND account = ?`,
      [
        MEMBERSHIP_ACTIVE,
        facts.memberRole,
        facts.roleModel,
        facts.roleModelRevision,
        found.organization,
        found.invitedAccount,
      ],
    )
  return reply('succeeded', { invitation, state: 'accepted' })
}

function disposeInvitation(
  facts: DisposeInvitationFacts,
  port: ParticipantPort,
  mode?: MembershipMode,
) {
  const who = actingCaller(port, facts)
  if (who.kind !== 'caller') return reply(who.outcome)
  const invitation = facts.invitation
  const found = invitation === null ? undefined : invitationRow(port, invitation, facts.nowKey)
  // 1. Not there, or the caller cannot see it.
  if (invitation === null || found === undefined) return NOT_VISIBLE()
  const isInvitee = found.invitedAccount === who.account
  const isIssuer = holdsActiveRole(port, found.organization, who.account, facts.superAdminRole)
  if (!isInvitee && !isIssuer) return NOT_VISIBLE()
  // 2. Not the party of this disposition.
  if (!(facts.action === 'withdraw' ? isIssuer : isInvitee)) return DENIED()
  if (facts.expectedOpen !== 'yes') return DENIED()
  // 3. Already terminal, or expired now: the first finding of expiry is written.
  let state = found.state
  if (state === INVITATION_OPEN && found.reached) {
    setInvitationState(port, invitation, INVITATION_EXPIRED)
    state = INVITATION_EXPIRED
  }
  if (state !== INVITATION_OPEN) return reply('no-change', { invitation, state })
  if (facts.action === 'accept') return admit(facts, invitation, found, port, mode)
  const terminal = facts.action === 'reject' ? 'rejected' : 'withdrawn'
  setInvitationState(port, invitation, terminal)
  return reply('succeeded', { invitation, state: terminal })
}

function leaveOrganization(
  facts: LeaveOrganizationFacts,
  port: ParticipantPort,
  mode?: MembershipMode,
) {
  const who = actingCaller(port, facts)
  if (who.kind !== 'caller') return reply(who.outcome)
  const organization = facts.actingOrganization
  const kind = organizationKind(port, organization)
  if (kind === undefined || kind === PERSONAL_ORGANIZATION) return DENIED()
  const own = membershipOf(port, organization, who.account)
  if (own === undefined || own.state !== MEMBERSHIP_ACTIVE) return DENIED()
  if (leavesNoAdmin(port, organization, own.role, null, facts.superAdminRole)) return DENIED()
  const blocked = membershipGate(port, organization, who.account, mode)
  if (blocked !== undefined) return blocked
  port.execute(
    `UPDATE id_membership SET state = ?, revision = revision + 1
      WHERE organization = ? AND account = ?`,
    [MEMBERSHIP_REMOVED, organization, who.account],
  )
  return reply('succeeded')
}

function changeMember(facts: ChangeMemberFacts, port: ParticipantPort, mode?: MembershipMode) {
  const who = actingCaller(port, facts)
  if (who.kind !== 'caller') return reply(who.outcome)
  const organization = facts.organization
  // An account that never was a member cannot see the organization; a former one is denied.
  if (organization === null || membershipOf(port, organization, who.account) === undefined)
    return NOT_VISIBLE()
  if (!holdsActiveRole(port, organization, who.account, facts.superAdminRole)) return DENIED()
  const target =
    facts.account === null ? undefined : membershipOf(port, organization, facts.account)
  if (facts.account === null || target === undefined || target.state !== MEMBERSHIP_ACTIVE)
    return NOT_VISIBLE()
  if (facts.change === 'role' && facts.targetRole === null) return DENIED()
  if (facts.expectedRole !== target.role) return reply('conflict')
  const nextRole = facts.change === 'remove' ? null : facts.targetRole
  if (leavesNoAdmin(port, organization, target.role, nextRole, facts.superAdminRole))
    return DENIED()
  const blocked = membershipGate(port, organization, facts.account, mode)
  if (blocked !== undefined) return blocked
  if (nextRole === null)
    port.execute(
      `UPDATE id_membership SET state = ?, revision = revision + 1
        WHERE organization = ? AND account = ?`,
      [MEMBERSHIP_REMOVED, organization, facts.account],
    )
  else if (nextRole !== target.role)
    port.execute(
      `UPDATE id_membership SET role = ?, revision = revision + 1
        WHERE organization = ? AND account = ?`,
      [nextRole, organization, facts.account],
    )
  return reply('succeeded')
}

function switchTenant(facts: SwitchTenantFacts, port: ParticipantPort) {
  const who = actingCaller(port, facts)
  if (who.kind !== 'caller') return reply(who.outcome)
  const { targetTenant, targetOrganization, targetAccount } = facts
  if (targetTenant === null || targetOrganization === null || targetAccount !== who.account)
    return DENIED()
  const held = oneRow(
    port,
    `SELECT 1 AS held FROM id_membership
      WHERE organization = ? AND account = ? AND tenant_text = ? AND state = ? LIMIT 1`,
    [targetOrganization, targetAccount, targetTenant, MEMBERSHIP_ACTIVE],
  )
  if (held === undefined) return DENIED()
  if (targetTenant === who.selection) return reply('no-change')
  // The selection of this login only; `actingCaller` above is the compare of this write.
  port.execute('UPDATE id_login SET tenant_text = ? WHERE login = ?', [targetTenant, facts.login])
  return reply('succeeded', { tenantText: targetTenant })
}

function revokeLogin(facts: RevokeLoginFacts, port: ParticipantPort) {
  const who = liveCaller(port, facts.login, facts.nowKey)
  if (who.kind !== 'caller') return reply(who.outcome)
  const target =
    facts.target === null
      ? undefined
      : oneRow(
          port,
          `SELECT l.account AS account, ${loginStandingSql('l')} AS standing
            FROM id_login l WHERE l.login = ? LIMIT 1`,
          [facts.nowKey, facts.nowKey, facts.nowKey, facts.target],
        )
  // An unknown login and a login of another account give the same answer.
  if (facts.target === null || target === undefined || text(target['account']) !== who.account)
    return NOT_VISIBLE()
  // A revoked or ended target stays as it is; a target issued after the reading is not judged.
  const standing = text(target['standing'])
  if (standing === STANDING.early) return reply(CLOCK_EARLIER_THAN_RECORD)
  if (standing !== STANDING.live) return reply('no-change')
  port.execute('INSERT INTO id_login_revocation (login, revoked_at) VALUES (?, ?)', [
    facts.target,
    facts.revokedAt,
  ])
  return reply('succeeded')
}

function reportAccess(facts: ReportAccessFacts, port: ParticipantPort) {
  const who = liveCaller(port, facts.login, facts.nowKey)
  // A login that is not valid is not revived; a reading earlier than its issue time is no basis.
  if (who.kind !== 'caller')
    return reply(who.outcome === CLOCK_EARLIER_THAN_RECORD ? who.outcome : 'not-refreshed')
  // A new idle deadline earlier than the stored one leaves the stored one.
  port.execute(
    `UPDATE id_login SET idle_deadline = ?
      WHERE login = ? AND ${orderKeySql('idle_deadline')} < ?`,
    [facts.idleDeadline, facts.login, facts.idleKey],
  )
  const row = oneRow(port, 'SELECT idle_deadline FROM id_login WHERE login = ? LIMIT 1', [
    facts.login,
  ])
  return reply('refreshed', { idleDeadline: text(row?.['idle_deadline']) })
}

function governance(
  facts: GovernanceFacts,
  port: ParticipantPort,
  mode?: MembershipMode,
): ParticipantReply {
  switch (facts.kind) {
    case 'create-organization':
      return createOrganization(facts, port)
    case 'issue-invitation':
      return issueInvitation(facts, port)
    case 'dispose-invitation':
      return disposeInvitation(facts, port, mode)
    case 'leave-organization':
      return leaveOrganization(facts, port, mode)
    case 'change-member':
      return changeMember(facts, port, mode)
    case 'switch-tenant':
      return switchTenant(facts, port)
    case 'revoke-login':
      return revokeLogin(facts, port)
    case 'report-access':
      return reportAccess(facts, port)
    default: {
      const _exhaustive: never = facts
      return { kind: 'unsupported', basis: { reason: `facts ${String(_exhaustive)}` } }
    }
  }
}

const participant: ParticipantModule = {
  participant: IDENTITY_PARTICIPANT,
  protocol: PROTOCOL,
  execute(rawFacts, port) {
    const coordinated = standingCommand(rawFacts, port, governance, raw => {
      const parsed = parseFacts(raw)
      return parsed !== undefined &&
        (parsed.kind === 'leave-organization' ||
          parsed.kind === 'change-member' ||
          (parsed.kind === 'dispose-invitation' && parsed.action === 'accept'))
        ? parsed
        : undefined
    })
    if (coordinated !== undefined) return coordinated
    const facts = parseFacts(rawFacts)
    if (facts === undefined) return { kind: 'unsupported', basis: { reason: 'facts' } }
    if (facts.kind === 'register') return register(facts, port)
    if (facts.kind === 'issue-login') return issueLogin(facts, port)
    return governance(facts, port)
  },
}
export default participant
