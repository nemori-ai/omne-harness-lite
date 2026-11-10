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
