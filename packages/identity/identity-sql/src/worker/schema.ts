// The tables of the identity records, the names that the participant, the migrations and the read
// handlers share, and the shapes of the facts and the read inputs and outputs that cross the Worker
// boundary. This file has no runtime import, so the Worker modules load it as it is.
// Every value in a fact or a read output is text: instants and durations travel encoded, integers
// travel as decimal text. The participant executes SQL only; the provider does every computation.
import type { JsonValue } from '@omne-harness/sql-contract'

export const IDENTITY_PARTICIPANT = 'identity'
export const PROTOCOL = '1'
export const MIGRATION = Object.freeze({ owner: IDENTITY_PARTICIPANT, id: '001-identity' })

// --- Migration `identity/001-identity`. Published: `migration.ts` reads these three values, and
// its checksum does not cover them, so they stay as they are. A new shape is a new migration. ---

export const IDENTITY_TABLES: readonly string[] = Object.freeze([
  'id_account',
  'id_credential',
  'id_organization',
  'id_tenant',
  'id_membership',
  'id_login',
])

/**
 * Plain STRICT tables: no deferred foreign key, no time default, no temporary table (sqlite-provider
 * §4.5). Unique columns are inline constraints: the provider's migration authorizer denies the
 * REINDEX step of an explicit CREATE INDEX, and an inline constraint builds its index with the table.
 */
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

// --- Migration `identity/002-governance`: the module holds its own statements, so its checksum
// covers them. The names here are the tables it creates. ---

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

/**
 * The outcome of a governance command or read whose reading is earlier than the issue time of a
 * login that it judges (IS-05 step 5, IS-10). The provider answers it as `basis-unavailable` with
 * this text as the diagnostic, the same one that recognition gives.
 */
export const CLOCK_EARLIER_THAN_RECORD = 'clock-earlier-than-record'

/**
 * The most entries one governance list holds. A longer list is not cut: the read fails, and the
 * provider answers `basis-unavailable` with no list (identity SPEC ID-18, list completeness).
 */
export const GOVERNANCE_LIST_LIMIT = 1000

/**
 * The order key of an encoded instant (`YYYY-MM-DDTHH:MM:SS[.digits]Z`): the civil text, a dot, and
 * the fraction digits without trailing zeros. The text order of two keys is the order of
 * utc-instant `compareInstants`: the civil text has a fixed width, and among fractions without
 * trailing zeros the text order is the numeric order. `support.ts` writes the same key in SQL.
 */
export function instantOrderKey(encoded: string): string {
  const fraction = encoded.charAt(19) === '.' ? encoded.slice(20, -1) : ''
  return `${encoded.slice(0, 19)}.${fraction.replace(/0+$/u, '')}`
}

// --- Facts: what the provider sends the participant. ---

/** The five rows of one registration (SPEC: one commit, one command). */
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

/** The one row of one issued login. The proof itself is never a fact: only its digest is. */
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

/** The initiating login of a governance command and the order key of this call's clock reading. */
export type CallerFacts = Readonly<{ login: string; nowKey: string }>

/** A call that acts for a tenant: the tenant text and its two halves, decoded by the provider. */
export type ActingFacts = CallerFacts &
  Readonly<{ actingTenant: string; actingOrganization: string; actingAccount: string }>

/** The role names of the adopted governance model. The participant knows no role by itself. */
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
    /** `create` when the name is not blank and the model is adopted. */
    decision: 'create' | 'deny'
    /** A new organization and the creator's tenant in it, used only when nothing is saved yet. */
    organization: string
    tenantText: string
  }>

export type IssueInvitationFacts = ActingFacts &
  ModelFacts &
  Readonly<{
    kind: 'issue-invitation'
    /** The invitation terms and the duration, judged by the provider at this call. */
    bounds: 'ok' | 'unavailable' | 'denied'
    invitation: string
    expiresAt: string | null
    invitedLoginIdentifier: string | null
    /** The account the provider read for the identifier before the commit, and its tenant. */
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
    /** A role of the model, or `null` when the request named none (a role change is then denied). */
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

/**
 * The response of a governance command: an `outcome` and text fields that depend on it. Refusals
 * write nothing; an expiry or an acceptance of an active member writes its terminal and answers
 * `no-change`. The provider maps it to the outcome of identity SPEC ID-18.
 */
export type GovernanceReply = Readonly<{ outcome: string } & Record<string, string>>

// --- Read handler inputs and outputs. ---

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
    /** True when a revocation of this login is recorded (002). */
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

/**
 * The queries of `identity.governance`. Every one but the two pre-reads first checks the initiating
 * login in the same snapshot; an acting one also checks the selection.
 */
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

/** `denied` or `not-visible` for a refused read, `read` with the query's fields otherwise. */
export type GovernanceReadOutput = Readonly<{ outcome: string; [field: string]: JsonValue }>

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isText(value: unknown): value is string {
  return typeof value === 'string'
}
