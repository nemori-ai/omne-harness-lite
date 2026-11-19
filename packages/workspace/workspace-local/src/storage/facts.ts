import type {
  InstanceRecord,
  Membership,
  OperationRecord,
  WorkspaceRecord,
  WorkspaceState,
  WorkspaceTxn,
} from '@omne-harness/workspace'
import type {
  InstanceId,
  Json,
  OperationKind,
  Relation,
  TypeName,
} from '@omne-harness/workspace-contract'
import type { QueryRows, SqlValue } from '@omne-harness/sql-contract/worker'
import { ROW_LIMIT } from './schema.ts'

/** What both the participant and the read handler are given: one statement at a time, inside one transaction. */
export type SqlPort = Readonly<{ execute(sql: string, params: readonly SqlValue[]): QueryRows }>
type Row = QueryRows['rows'][number]

/** A result that reaches past the row limit fails instead of being cut. */
function select(port: SqlPort, sql: string, params: readonly SqlValue[]): QueryRows['rows'] {
  const found = port.execute(`${sql} LIMIT ${ROW_LIMIT + 1}`, params).rows
  if (found.length > ROW_LIMIT) throw new Error('more rows than one statement may return')
  return found
}

function text(cell: unknown): string {
  if (typeof cell !== 'string') throw new Error('a stored text cell is not text')
  return cell
}

function count(cell: unknown): number {
  if (typeof cell !== 'bigint' && typeof cell !== 'number')
    throw new Error('a stored number cell is not a number')
  return Number(cell)
}

function relationOf(role: unknown, superAdmin: unknown): Relation {
  if (role === 'owner') return { role: 'owner' }
  if (role === 'participant') return { role: 'participant', superAdmin: count(superAdmin) === 1 }
  throw new Error('a stored relation has an unknown role')
}

const workspaceOf = (row: Row): WorkspaceRecord => ({
  workspace: text(row[0]),
  type: text(row[1]) as TypeName,
  revision: count(row[2]),
})

const INSTANCE =
  'SELECT instance, workspace, node, occupancy, address, material, active FROM ws_instances'
const instanceOf = (row: Row): InstanceRecord => ({
  instance: text(row[0]) as InstanceId,
  workspace: text(row[1]),
  node: text(row[2]),
  occupancy: text(row[3]),
  address: text(row[4]),
  material: JSON.parse(text(row[5])) as Json,
  state: count(row[6]) === 1 ? 'active' : 'dissociated',
})

const one = <T>(rows: QueryRows['rows'], read: (row: Row) => T): T | null =>
  rows[0] === undefined ? null : read(rows[0])

const WORKSPACE = 'SELECT workspace, type, revision FROM ws_workspaces WHERE workspace = ?'
const RELATION = 'SELECT role, super_admin FROM ws_relations WHERE workspace = ? AND tenant = ?'

export function sqlTxn(port: SqlPort): WorkspaceTxn {
  const run = (sql: string, params: readonly SqlValue[]) => void port.execute(sql, params)
  return {
    operation: (tenant, operation) =>
      one(
        select(
          port,
          'SELECT kind, digest, value FROM ws_operations WHERE tenant = ? AND operation = ?',
          [tenant, operation],
        ),
        (row): OperationRecord => ({
          tenant,
          operation,
          kind: text(row[0]) as OperationKind,
          digest: text(row[1]),
          value: JSON.parse(text(row[2])) as Json,
        }),
      ),
    insertOperation: ({ tenant, operation, kind, digest, value }) =>
      run(
        'INSERT INTO ws_operations (tenant, operation, kind, digest, value) VALUES (?, ?, ?, ?, ?)',
        [tenant, operation, kind, digest, JSON.stringify(value)],
      ),
    workspace: workspace => one(select(port, WORKSPACE, [workspace]), workspaceOf),
    insertWorkspace: ({ workspace, type, revision }) =>
      run('INSERT INTO ws_workspaces (workspace, type, revision) VALUES (?, ?, ?)', [
        workspace,
        type,
        revision,
      ]),
    setRevision: (workspace, revision) =>
      run('UPDATE ws_workspaces SET revision = ? WHERE workspace = ?', [revision, workspace]),
    relation: (workspace, tenant) =>
      one(select(port, RELATION, [workspace, tenant]), row => relationOf(row[0], row[1])),
    putRelation: (workspace, tenant, relation) =>
      run(
        'INSERT INTO ws_relations (workspace, tenant, role, super_admin) VALUES (?, ?, ?, ?) ON CONFLICT(workspace, tenant) DO UPDATE SET role = excluded.role, super_admin = excluded.super_admin',
        [
          workspace,
          tenant,
          relation.role,
          relation.role === 'participant' && relation.superAdmin ? 1 : 0,
        ],
      ),
    instance: instance =>
      one(select(port, `${INSTANCE} WHERE instance = ?`, [instance]), instanceOf),
    occupant: (node, occupancy) =>
      one(
        select(port, `${INSTANCE} WHERE node = ? AND occupancy = ? AND active = 1`, [
          node,
          occupancy,
        ]),
        instanceOf,
      ),
    insertInstance: ({ instance, workspace, node, occupancy, address, material, state }) =>
      run(
        'INSERT INTO ws_instances (instance, workspace, node, occupancy, address, material, active) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          instance,
          workspace,
          node,
          occupancy,
          address,
          JSON.stringify(material),
          state === 'active' ? 1 : 0,
        ],
      ),
    setInstanceState: (instance, state) =>
      run('UPDATE ws_instances SET active = ? WHERE instance = ?', [
        state === 'active' ? 1 : 0,
        instance,
      ]),
  }
}

/** A workspace as one tenant sees it. Without a relation it reads the same as one that does not exist. */
export function stateOf(port: SqlPort, tenant: string, workspace: string): WorkspaceState | null {
  const txn = sqlTxn(port)
  const relation = txn.relation(workspace, tenant)
  const record = txn.workspace(workspace)
  if (relation === null || record === null) return null
  const active = `${INSTANCE} WHERE workspace = ? AND active = 1 ORDER BY rowid`
  return {
    workspace: record,
    relation,
    instances: select(port, active, [workspace]).map(instanceOf),
  }
}

export function membershipsOf(port: SqlPort, tenant: string): Membership[] {
  const sql =
    'SELECT w.workspace, w.type, w.revision, r.role, r.super_admin FROM ws_relations r JOIN ws_workspaces w ON w.workspace = r.workspace WHERE r.tenant = ? ORDER BY w.workspace'
  return select(port, sql, [tenant]).map(row => ({
    workspace: workspaceOf(row),
    relation: relationOf(row[3], row[4]),
  }))
}
