import { SYSTEM_ACTION_MATRIX, type SystemActionRow } from '@omne-harness/authorization'
import type { AgentAccessOperation } from '@omne-harness/agent-contract'
import type { SessionAccessOperation } from '@omne-harness/session-contract'
import { AGENT_POLICY } from './agent-policy.ts'
import type {
  DenyCell,
  MatrixCell,
  MemberCell,
  PolicyCell,
  PolicyRow,
  PrincipalColumn,
  SystemPurpose,
} from './cells.ts'
import type { ReleaseGrant } from './grants.ts'
import { SESSION_POLICY } from './session-policy.ts'

export type PolicyTable = 'session' | 'agent'
export const COLUMNS: readonly PrincipalColumn[] = Object.freeze(['login', 'work', 'system'])

export type TableAudit = Readonly<{
  rows: number
  allowedCells: number
  allowedCellsWithoutSource: number
}>

export type PolicyAudit = Readonly<{
  session: TableAudit
  agent: TableAudit
  findings: readonly string[]
}>

export type PolicyTables = Readonly<{
  session: Readonly<Record<SessionAccessOperation, PolicyRow>>
  agent: Readonly<Record<AgentAccessOperation, PolicyRow>>
  matrix: readonly SystemActionRow[]
}>

const DEFAULT_TABLES: PolicyTables = Object.freeze({
  session: SESSION_POLICY,
  agent: AGENT_POLICY,
  matrix: SYSTEM_ACTION_MATRIX,
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
}

type AuditContext = Readonly<{
  table: PolicyTable
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

function auditCell(context: AuditContext, value: Cell): void {
  const { cell } = value
  switch (cell.verdict) {
    case 'member':
    case 'matrix':
      return auditAllowingCell(context, value, cell)
    case 'deny':
      return auditDenyCell(context, value, cell)
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
  const tally: Tally = { allowedCells: 0, allowedCellsWithoutSource: 0 }
  const purposes = new Map(input.matrix.map(row => [row.purpose, row]))
  const context: AuditContext = { table, purposes, findings, tally }
  for (const value of cellsOf(rows)) auditCell(context, value)
  return Object.freeze({
    rows: Object.keys(rows).length,
    allowedCells: tally.allowedCells,
    allowedCellsWithoutSource: tally.allowedCellsWithoutSource,
  })
}

export function auditPolicy(overrides: Partial<PolicyTables> = {}): PolicyAudit {
  const input: PolicyTables = { ...DEFAULT_TABLES, ...overrides }
  const findings: string[] = []
  const session = auditTable('session', input.session, input, findings)
  const agent = auditTable('agent', input.agent, input, findings)
  return Object.freeze({ session, agent, findings: Object.freeze(findings) })
}

export type ProjectedCell = Readonly<{
  table: PolicyTable
  operation: string
  purpose: SystemPurpose
}>

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
