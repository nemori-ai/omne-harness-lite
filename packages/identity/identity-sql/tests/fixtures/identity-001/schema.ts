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

export const OPERATIONS = Object.freeze({
  register: 'identity.register-and-activate',
  issueLogin: 'identity.issue-login',
})

export const HANDLERS = Object.freeze({
  issueBasis: 'identity.issue-basis',
  loginByProof: 'identity.login-by-proof',
  standing: 'identity.standing',
})

export const PERSONAL_ORGANIZATION = 'personal'
export const MEMBERSHIP_ACTIVE = 'active'

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

export type IdentityFacts = RegisterFacts | IssueLoginFacts

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

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isText(value: unknown): value is string {
  return typeof value === 'string'
}
