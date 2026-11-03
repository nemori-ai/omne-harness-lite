// The migration `identity/002-governance`: four new tables for the governance records (identity
// SPEC ID-18). It requires `001-identity` and changes none of its tables: a published table gets no
// new column, a new fact gets a new table (SPEC IS-09). The statements are in this file, so the
// checksum of this file covers them. Published bytes do not change (sqlite-provider §5.4).
import type { MigrationModule } from '@omne-harness/sql-contract/worker'

/**
 * STRICT tables with inline keys only, as in `001-identity`. `id_organization_profile` holds the
 * name and the governance model of a team organization; `id_invitation` one member invitation and
 * its one terminal; `id_create_receipt` the saved outcome of one create call of one account;
 * `id_login_revocation` one row per revoked login.
 */
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
    // A missing table makes the statement throw, which fails the migration transaction.
    for (const table of TABLES) port.execute(`SELECT 1 FROM ${table} LIMIT 1`, [])
    return { kind: 'verified' }
  },
}
export default migration
