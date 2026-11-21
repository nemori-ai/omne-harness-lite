import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { MIGRATION, TABLES } from './schema.ts'

const STATEMENTS = [
  'CREATE TABLE ws_workspaces (workspace TEXT PRIMARY KEY, type TEXT NOT NULL, revision INTEGER NOT NULL)',
  'CREATE TABLE ws_relations (workspace TEXT NOT NULL, tenant TEXT NOT NULL, role TEXT NOT NULL, super_admin INTEGER NOT NULL, PRIMARY KEY(workspace, tenant))',
  'CREATE INDEX ws_relations_tenant ON ws_relations(tenant, workspace)',
  'CREATE TABLE ws_instances (instance TEXT PRIMARY KEY, workspace TEXT NOT NULL, node TEXT NOT NULL, occupancy TEXT NOT NULL, address TEXT NOT NULL, material TEXT NOT NULL, active INTEGER NOT NULL)',
  'CREATE INDEX ws_instances_workspace ON ws_instances(workspace, active)',
  'CREATE UNIQUE INDEX ws_instances_occupancy ON ws_instances(node, occupancy) WHERE active = 1',
  'CREATE TABLE ws_operations (tenant TEXT NOT NULL, operation TEXT NOT NULL, kind TEXT NOT NULL, digest TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(tenant, operation))',
]

export default {
  ...MIGRATION,
  up(port) {
    for (const statement of STATEMENTS) port.execute(statement, [])
  },
  verify(port) {
    for (const table of TABLES) port.execute(`SELECT * FROM ${table} LIMIT 0`, [])
    return { kind: 'verified' }
  },
} satisfies MigrationModule
