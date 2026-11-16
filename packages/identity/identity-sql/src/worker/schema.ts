import type { JsonValue } from '@omne-harness/sql-contract'

export const IDENTITY_PARTICIPANT = 'identity'
export const PROTOCOL = '1'
export const MIGRATION = Object.freeze({ owner: IDENTITY_PARTICIPANT, id: '001-identity' })

export const IDENTITY_TABLES: readonly string[] = Object.freeze([
  'id_account',
  'id_credential',
  'id_organization',
  'id_tenant',
  'id_membership',
  'id_login',
])

export const SCHEMA_STATEMENTS: readonly string[] = Object.freeze([
  `CREATE TABLE id_account (
    account TEXT NOT NULL PRIMARY KEY, login_identifier TEXT NOT NULL UNIQUE,
    personal_organization TEXT NOT NULL) STRICT`,
  `CREATE TABLE id_credential (
    account TEXT NOT NULL PRIMARY KEY, material TEXT NOT NULL, revision INTEGER NOT NULL) STRICT`,
  `CREATE TABLE id_organization (
    organization TEXT NOT NULL PRIMARY KEY, kind TEXT NOT NULL) STRICT`,
  `CREATE TABLE id_tenant (
    tenant_text TEXT NOT NULL PRIMARY KEY, organization TEXT NOT NULL, account TEXT NOT NULL) STRICT`,
  `CREATE TABLE id_membership (
    organization TEXT NOT NULL, account TEXT NOT NULL, tenant_text TEXT NOT NULL UNIQUE,
    state TEXT NOT NULL, role_model TEXT NOT NULL, role_model_revision TEXT NOT NULL,
    role TEXT NOT NULL, revision INTEGER NOT NULL, PRIMARY KEY (organization, account)) STRICT`,
  `CREATE TABLE id_login (
    login TEXT NOT NULL PRIMARY KEY, proof_digest TEXT NOT NULL UNIQUE, account TEXT NOT NULL,
    tenant_text TEXT NOT NULL, issued_at TEXT NOT NULL, max_deadline TEXT NOT NULL,
    idle_deadline TEXT NOT NULL, max_lifetime TEXT NOT NULL, idle_period TEXT NOT NULL) STRICT`,
])

export const GOVERNANCE_MIGRATION = Object.freeze({
  owner: IDENTITY_PARTICIPANT,
  id: '002-governance',
})

export const GOVERNANCE_TABLES: readonly string[] = Object.freeze([
  'id_organization_profile',
  'id_invitation',
  'id_create_receipt',
  'id_login_revocation',
])

export const OPERATIONS = Object.freeze({
  register: 'identity.register-and-activate',
  issueLogin: 'identity.issue-login',
  createOrganization: 'identity.create-organization',
  issueInvitation: 'identity.issue-member-invitation',
  disposeInvitation: 'identity.dispose-member-invitation',
  leaveOrganization: 'identity.leave-organization',
  changeMember: 'identity.change-member',
  switchTenant: 'identity.switch-current-tenant',
  revokeLogin: 'identity.revoke-login',
  reportAccess: 'identity.report-business-access',
})

export const HANDLERS = Object.freeze({
  issueBasis: 'identity.issue-basis',
  loginByProof: 'identity.login-by-proof',
  standing: 'identity.standing',
  governance: 'identity.governance',
})

export const PERSONAL_ORGANIZATION = 'personal'
export const TEAM_ORGANIZATION = 'team'
export const MEMBERSHIP_ACTIVE = 'active'
export const MEMBERSHIP_REMOVED = 'removed'
export const INVITATION_OPEN = 'open'
export const INVITATION_EXPIRED = 'expired'

export const CLOCK_EARLIER_THAN_RECORD = 'clock-earlier-than-record'

export const GOVERNANCE_LIST_LIMIT = 1000

export function instantOrderKey(encoded: string): string {
  const fraction = encoded.charAt(19) === '.' ? encoded.slice(20, -1) : ''
  return `${encoded.slice(0, 19)}.${fraction.replace(/0+$/u, '')}`
}

export type RegisterFacts = Readonly<{
  kind: 'register'
  loginIdentifier: string
  account: string
  organization: string
  tenantText: string
  material: string
  roleModel: string
  roleModelRevision: string
  role: string
}>

export type IssueLoginFacts = Readonly<{
  kind: 'issue-login'
  login: string
  account: string
  tenantText: string
  proofDigest: string
  issuedAt: string
  maxDeadline: string
  idleDeadline: string
  maxLifetime: string
  idlePeriod: string
}>

export type CallerFacts = Readonly<{ login: string; nowKey: string }>

export type ActingFacts = CallerFacts &
  Readonly<{ actingTenant: string; actingOrganization: string; actingAccount: string }>

export type ModelFacts = Readonly<{
  roleModel: string
  roleModelRevision: string
  superAdminRole: string
  memberRole: string
}>

export type CreateOrganizationFacts = ActingFacts &
  ModelFacts &
  Readonly<{
    kind: 'create-organization'
    createCallId: string
    name: string
    governanceModelId: string
    decision: 'create' | 'deny'
    organization: string
    tenantText: string
  }>

export type IssueInvitationFacts = ActingFacts &
  ModelFacts &
  Readonly<{
    kind: 'issue-invitation'
    bounds: 'ok' | 'unavailable' | 'denied'
    invitation: string
    expiresAt: string | null
    invitedLoginIdentifier: string | null
    invitedAccount: string | null
    invitedTenantText: string | null
  }>

export type DisposeInvitationFacts = ActingFacts &
  ModelFacts &
  Readonly<{
    kind: 'dispose-invitation'
    action: 'accept' | 'reject' | 'withdraw'
    invitation: string | null
    expectedOpen: 'yes' | 'no'
  }>

export type LeaveOrganizationFacts = ActingFacts &
  ModelFacts &
  Readonly<{ kind: 'leave-organization' }>

export type ChangeMemberFacts = ActingFacts &
  ModelFacts &
  Readonly<{
    kind: 'change-member'
    change: 'remove' | 'role'
    organization: string | null
    account: string | null
    expectedRole: string | null
    targetRole: string | null
  }>

export type SwitchTenantFacts = ActingFacts &
  Readonly<{
    kind: 'switch-tenant'
    targetTenant: string | null
    targetOrganization: string | null
    targetAccount: string | null
  }>

export type RevokeLoginFacts = CallerFacts &
  Readonly<{ kind: 'revoke-login'; target: string | null; revokedAt: string }>

export type ReportAccessFacts = CallerFacts &
  Readonly<{ kind: 'report-access'; idleDeadline: string; idleKey: string }>

export type GovernanceFacts =
  | CreateOrganizationFacts
  | IssueInvitationFacts
  | DisposeInvitationFacts
  | LeaveOrganizationFacts
  | ChangeMemberFacts
  | SwitchTenantFacts
  | RevokeLoginFacts
  | ReportAccessFacts

export type IdentityFacts = RegisterFacts | IssueLoginFacts | GovernanceFacts

export type GovernanceReply = Readonly<{ outcome: string } & Record<string, string>>

export type IssueBasisInput = Readonly<{ loginIdentifier: string }>
export type IssueBasisOutput = Readonly<{
  account: Readonly<{ account: string; organization: string; material: string }> | null
}>

export type LoginByProofInput = Readonly<{ proofDigest: string }>
export type LoginByProofOutput = Readonly<{
  login: Readonly<{
    login: string
    account: string
    tenantText: string
    issuedAt: string
    maxDeadline: string
    idleDeadline: string
    revoked: boolean
  }> | null
}>

export type StandingInput = Readonly<{ tenantText: string }>
export type StandingOutput = Readonly<{
  membership: Readonly<{
    state: string
    roleModel: string
    roleModelRevision: string
    role: string
    revision: string
  }> | null
}>

type ActingRead = CallerFacts &
  Readonly<{ actingTenant: string; actingOrganization: string; actingAccount: string }>

export type GovernanceReadInput =
  | (CallerFacts & Readonly<{ query: 'create-receipt'; createCallId: string }>)
  | (ActingRead &
      Readonly<{ query: 'invitation'; invitation: string | null; superAdminRole: string }>)
  | (CallerFacts & Readonly<{ query: 'received' }>)
  | (ActingRead & Readonly<{ query: 'issued'; superAdminRole: string }>)
  | (CallerFacts & Readonly<{ query: 'own-memberships' }>)
  | (ActingRead &
      Readonly<{
        query: 'members'
        organization: string | null
        wanted: 'active' | 'removed' | 'invalid'
        superAdminRole: string
      }>)
  | (CallerFacts & Readonly<{ query: 'current-tenant' }>)
  | (CallerFacts & Readonly<{ query: 'own-logins' }>)
  | Readonly<{ query: 'account-of'; loginIdentifier: string }>
  | (CallerFacts & Readonly<{ query: 'login-terms' }>)

export type GovernanceQuery = GovernanceReadInput['query']

export type GovernanceReadOutput = Readonly<{ outcome: string; [field: string]: JsonValue }>

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isText(value: unknown): value is string {
  return typeof value === 'string'
}
