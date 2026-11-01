// The generation check of the policy tables (DP-4 §3.3) and the holder projection (§4.2). The
// audit reads the tables as data and returns findings; it decides nothing about a request. Row
// completeness against the enumerations is a type-level fact (`satisfies` in the tables, and
// `tests/rows/authorization/policy.spec-d.ts`); the audit checks what types cannot: sources are
// non-empty, matrix cells name a row of `SYSTEM_ACTION_MATRIX` for the same operation, matrix
// cells sit in the system column only, and every pending cell is the cell its D item names.
import { SYSTEM_ACTION_MATRIX, type SystemActionRow } from '@omne-harness/authorization'
import type { AgentAccessOperation } from '@omne-harness/agent-contract'
import type { SessionAccessOperation } from '@omne-harness/session-contract'
import { AGENT_POLICY } from './agent-policy.ts'
import type {
  DenyCell,
  MatrixCell,
  MemberCell,
  PendingCell,
  PolicyCell,
  PolicyRow,
  PrincipalColumn,
  SystemPurpose,
} from './cells.ts'
import { DECISION_ITEMS, type DecisionItem } from './decision-items.ts'
import type { ReleaseGrant } from './grants.ts'
import { SESSION_POLICY } from './session-policy.ts'

export type PolicyTable = 'session' | 'agent'
export const COLUMNS: readonly PrincipalColumn[] = Object.freeze(['login', 'work', 'system'])

export type TableAudit = Readonly<{
  rows: number
  allowedCells: number
  allowedCellsWithoutSource: number
  /** `<operation> × <column>: <item>` for each `deny-pending` cell, in table order. */
  pendingCells: readonly string[]
}>

export type PolicyAudit = Readonly<{
  session: TableAudit
  agent: TableAudit
  /** Empty when the tables are in order. Each finding names the table, the operation and the column. */
  findings: readonly string[]
}>

export type PolicyTables = Readonly<{
  session: Readonly<Record<SessionAccessOperation, PolicyRow>>
  agent: Readonly<Record<AgentAccessOperation, PolicyRow>>
  matrix: readonly SystemActionRow[]
  items: Readonly<Record<string, DecisionItem>>
}>

const DEFAULT_TABLES: PolicyTables = Object.freeze({
  session: SESSION_POLICY,
  agent: AGENT_POLICY,
  matrix: SYSTEM_ACTION_MATRIX,
  items: DECISION_ITEMS,
})

type Cell = Readonly<{ operation: string; column: PrincipalColumn; cell: PolicyCell }>

function cellsOf(table: Readonly<Record<string, PolicyRow>>): readonly Cell[] {
  return Object.entries(table).flatMap(([operation, row]) =>
    COLUMNS.map(column => ({ operation, column, cell: row[column] })),
  )
}

function hasSource(cell: PolicyCell): boolean {
  return (
    (cell.verdict === 'member' || cell.verdict === 'matrix') &&
    typeof cell.source === 'string' &&
    cell.source.trim() !== ''
  )
}

type Tally = {
  allowedCells: number
  allowedCellsWithoutSource: number
  pendingCells: string[]
}

/** What the audit of one table carries from cell to cell. */
type AuditContext = Readonly<{
  table: PolicyTable
  input: PolicyTables
  purposes: ReadonlyMap<string, SystemActionRow>
  findings: string[]
  tally: Tally
}>

const where = (context: AuditContext, value: Cell) =>
  `${context.table} \`${value.operation}\` × ${value.column}`

function auditMatrixCell(context: AuditContext, value: Cell, cell: MatrixCell): void {
  if (value.column !== 'system')
    context.findings.push(`${where(context, value)} gives a tenant principal a matrix cell`)
  const row = context.purposes.get(cell.purpose)
  if (row === undefined)
    context.findings.push(
      `${where(context, value)} names purpose ${cell.purpose} outside the matrix`,
    )
  else if (row.operation.owner !== context.table || row.operation.name !== value.operation)
    context.findings.push(
      `${where(context, value)} names purpose ${cell.purpose}, whose row is ${row.operation.owner} ${row.operation.name}`,
    )
}

function auditAllowingCell(
  context: AuditContext,
  value: Cell,
  cell: MemberCell | MatrixCell,
): void {
  context.tally.allowedCells += 1
  if (!hasSource(cell)) {
    context.tally.allowedCellsWithoutSource += 1
    context.findings.push(`${where(context, value)} allows without a source`)
  }
  if (cell.verdict === 'member' && value.column === 'system')
    context.findings.push(`${where(context, value)} gives a system principal a member cell`)
  if (cell.verdict === 'matrix') auditMatrixCell(context, value, cell)
}

function auditDenyCell(context: AuditContext, value: Cell, cell: DenyCell): void {
  if (typeof cell.basis !== 'string' || cell.basis.trim() === '')
    context.findings.push(`${where(context, value)} denies without a basis`)
}

function auditPendingCell(context: AuditContext, value: Cell, cell: PendingCell): void {
  context.tally.pendingCells.push(`${value.operation} × ${value.column}: ${cell.item}`)
  const item = context.input.items[cell.item]
  if (item === undefined)
    context.findings.push(`${where(context, value)} cites ${cell.item}, which has no item`)
  else if (
    item.table !== context.table ||
    item.operation !== value.operation ||
    item.column !== value.column
  )
    context.findings.push(
      `${where(context, value)} cites ${cell.item}, which names ${item.table} \`${item.operation}\` × ${item.column}`,
    )
  else if (item.missingRule.trim() === '' || item.defaultVerdict !== 'denied')
    context.findings.push(`${cell.item} lacks the missing product rule or the default denial`)
}

function auditCell(context: AuditContext, value: Cell): void {
  const { cell } = value
  switch (cell.verdict) {
    case 'member':
    case 'matrix':
      return auditAllowingCell(context, value, cell)
    case 'deny':
      return auditDenyCell(context, value, cell)
    case 'deny-pending':
      return auditPendingCell(context, value, cell)
    default: {
      const _exhaustive: never = cell
      context.findings.push(
        `${where(context, value)} has an unknown verdict ${String(_exhaustive)}`,
      )
    }
  }
}

function auditTable(
  table: PolicyTable,
  rows: Readonly<Record<string, PolicyRow>>,
  input: PolicyTables,
  findings: string[],
): TableAudit {
  const tally: Tally = { allowedCells: 0, allowedCellsWithoutSource: 0, pendingCells: [] }
  const purposes = new Map(input.matrix.map(row => [row.purpose, row]))
  const context: AuditContext = { table, input, purposes, findings, tally }
  for (const value of cellsOf(rows)) auditCell(context, value)
  return Object.freeze({
    rows: Object.keys(rows).length,
    allowedCells: tally.allowedCells,
    allowedCellsWithoutSource: tally.allowedCellsWithoutSource,
    pendingCells: Object.freeze(tally.pendingCells),
  })
}

/** Audits the release tables, or the given ones. Findings are empty when the tables are in order. */
export function auditPolicy(overrides: Partial<PolicyTables> = {}): PolicyAudit {
  const input: PolicyTables = { ...DEFAULT_TABLES, ...overrides }
  const findings: string[] = []
  const session = auditTable('session', input.session, input, findings)
  const agent = auditTable('agent', input.agent, input, findings)
  for (const [id, item] of Object.entries(input.items)) {
    const cell = input[item.table][item.operation]?.[item.column]
    if (cell?.verdict !== 'deny-pending' || cell.item !== id)
      findings.push(
        `${id} names ${item.table} \`${item.operation}\` × ${item.column}, which does not cite it`,
      )
  }
  return Object.freeze({ session, agent, findings: Object.freeze(findings) })
}

export type ProjectedCell = Readonly<{
  table: PolicyTable
  operation: string
  purpose: SystemPurpose
}>

/**
 * Which matrix cells each grant holder passes: a holder passes a cell when the cell is a matrix
 * cell and its record holds the purpose (policy draft §4.2). A rendered view, not a judgment column.
 */
export function holderProjection(
  input: Readonly<{
    session: Readonly<Record<string, PolicyRow>>
    agent: Readonly<Record<string, PolicyRow>>
    grants: Readonly<Record<string, ReleaseGrant>>
  }>,
): Readonly<Record<string, readonly ProjectedCell[]>> {
  const matrixCells: ProjectedCell[] = []
  for (const table of ['session', 'agent'] as const) {
    for (const { operation, cell } of cellsOf(input[table])) {
      if (cell.verdict === 'matrix') matrixCells.push({ table, operation, purpose: cell.purpose })
    }
  }
  return Object.freeze(
    Object.fromEntries(
      Object.entries(input.grants).map(([holder, grant]) => [
        holder,
        Object.freeze(matrixCells.filter(value => grant.purposes.includes(value.purpose))),
      ]),
    ),
  )
}
