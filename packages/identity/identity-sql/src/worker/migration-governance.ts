import type { MigrationModule } from '@omne-harness/sql-contract/worker'

const STATEMENTS: readonly string[] = [
  `CREATE TABLE id_organization_profile (
    organization TEXT NOT NULL PRIMARY KEY, name TEXT NOT NULL, model TEXT NOT NULL,
    model_revision TEXT NOT NULL) STRICT`,
  `CREATE TABLE id_invitation (
    invitation TEXT NOT NULL PRIMARY KEY, organization TEXT NOT NULL,
    invited_account TEXT NOT NULL, tenant_text TEXT NOT NULL, expires_at TEXT NOT NULL,
    state TEXT NOT NULL, revision INTEGER NOT NULL) STRICT`,
  `CREATE TABLE id_create_receipt (
    account TEXT NOT NULL, create_call_id TEXT NOT NULL, name TEXT NOT NULL,
    governance_model_id TEXT NOT NULL, outcome TEXT NOT NULL, organization TEXT,
    tenant_text TEXT, PRIMARY KEY (account, create_call_id)) STRICT`,
  `CREATE TABLE id_login_revocation (
    login TEXT NOT NULL PRIMARY KEY, revoked_at TEXT NOT NULL) STRICT`,
]

const TABLES: readonly string[] = [
  'id_organization_profile',
  'id_invitation',
  'id_create_receipt',
  'id_login_revocation',
]

const migration: MigrationModule = {
  owner: 'identity',
  id: '002-governance',
  up(port) {
    for (const statement of STATEMENTS) port.execute(statement, [])
  },
  verify(port) {
    for (const table of TABLES) port.execute(`SELECT 1 FROM ${table} LIMIT 1`, [])
    return { kind: 'verified' }
  },
}
export default migration
