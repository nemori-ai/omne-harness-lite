export const PERMISSION_CURRENT_MIGRATION = {
  owner: 'session',
  id: '006-permission-current',
} as const
export const PERMISSION_CURRENT_TABLES = ['sl_permission_head', 'sl_permission_assignment'] as const
export const PERMISSION_CURRENT_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS sl_permission_head (
    tenant TEXT NOT NULL, session TEXT NOT NULL, revision INTEGER NOT NULL CHECK (revision >= 0),
    adopted TEXT NOT NULL, override TEXT, source TEXT NOT NULL,
    PRIMARY KEY (tenant, session)) STRICT, WITHOUT ROWID`,
  `CREATE TABLE IF NOT EXISTS sl_permission_assignment (
    tenant TEXT NOT NULL, session TEXT NOT NULL, capability TEXT NOT NULL, enforcement TEXT NOT NULL,
    definition TEXT NOT NULL, rule TEXT NOT NULL, source TEXT NOT NULL,
    PRIMARY KEY (tenant, session, capability, enforcement)) STRICT, WITHOUT ROWID`,
] as const

export const AUTHORIZATION_CONTEXT_MIGRATION = {
  owner: 'session',
  id: '011-authorization-context',
} as const
export const AUTHORIZATION_CONTEXT_TABLES = [
  'sl_authorization_head',
  'sl_authorization_once',
  'sl_authorization_session',
] as const
// No backfill: no log written before these entries existed holds an authorization expression.
export const AUTHORIZATION_CONTEXT_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS sl_authorization_head (
    tenant TEXT NOT NULL, session TEXT NOT NULL, revision INTEGER NOT NULL CHECK (revision >= 0),
    PRIMARY KEY (tenant, session)) STRICT, WITHOUT ROWID`,
  `CREATE TABLE IF NOT EXISTS sl_authorization_once (
    tenant TEXT NOT NULL, session TEXT NOT NULL, owner TEXT NOT NULL, work TEXT NOT NULL,
    position TEXT NOT NULL, target TEXT NOT NULL, arguments TEXT NOT NULL, source TEXT NOT NULL,
    PRIMARY KEY (tenant, session, owner, work, position)) STRICT, WITHOUT ROWID`,
  `CREATE TABLE IF NOT EXISTS sl_authorization_session (
    tenant TEXT NOT NULL, session TEXT NOT NULL, gate TEXT NOT NULL, basis TEXT NOT NULL,
    source TEXT NOT NULL, PRIMARY KEY (tenant, session, gate)) STRICT, WITHOUT ROWID`,
] as const
