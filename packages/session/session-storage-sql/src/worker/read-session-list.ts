import type { SqlValue } from '@omne-harness/sql-contract/worker'
import {
  referenceOf,
  STANDING_COLUMNS,
  standingClauses,
  standingOfRow,
  type Clause,
  type StandingQuery,
} from './list-standing.ts'
import { handler, rowsOf, text, type Executor, type Row } from './support.ts'

type Key = Readonly<{ at: string | null; session: string }>
type Input = StandingQuery &
  Readonly<{
    tenant: string
    after: Key | null
    limit: number
    lifecycle?: string
    titleContains?: string
  }>

const COLUMNS = `session, created_at, last_activity_at, lifecycle, title, ${STANDING_COLUMNS}`
const nullable = (cell: Row[string] | undefined): string | null =>
  cell === null || cell === undefined ? null : text(cell)
const optionalText = (value: unknown): boolean => value === undefined || typeof value === 'string'

function valid(input: Input): boolean {
  return (
    typeof input.tenant === 'string' &&
    input.tenant !== '' &&
    Number.isInteger(input.limit) &&
    input.limit >= 1 &&
    input.limit <= 1000 &&
    optionalText(input.lifecycle) &&
    optionalText(input.titleContains)
  )
}

// Newest activity first; the sessions without an activity time come last, by their identity.
function segments(after: Key | null): readonly Clause[] {
  const timed = 'last_activity_at IS NOT NULL ORDER BY last_activity_at DESC, session'
  const untimed = 'last_activity_at IS NULL AND session > ? ORDER BY session'
  if (after === null)
    return [
      [timed, []],
      [untimed, ['']],
    ]
  if (after.at === null) return [[untimed, [after.session]]]
  return [
    ['last_activity_at = ? AND session > ? ORDER BY session', [after.at, after.session]],
    ['last_activity_at < ? ORDER BY last_activity_at DESC, session', [after.at]],
    [untimed, ['']],
  ]
}

function own(input: Pick<Input, 'lifecycle' | 'titleContains'>): readonly Clause[] {
  return [
    input.lifecycle === undefined
      ? ["lifecycle <> 'archived'", []]
      : ['lifecycle = ?', [input.lifecycle]],
    ...(input.titleContains === undefined
      ? []
      : [["INSTR(COALESCE(title, ''), ?) > 0", [input.titleContains]] as const]),
  ]
}

/** One statement a segment, each ordered as its segment says; the caller appends the row limit. */
export function listStatements(
  input: Pick<Input, 'tenant' | 'after'>,
  filters: readonly Clause[],
): readonly (readonly [string, readonly SqlValue[]])[] {
  const where = filters.map(([clause]) => clause).join(' AND ')
  const params: readonly SqlValue[] = filters.flatMap(([, values]) => values)
  return segments(input.after).map(([segment, values]) => [
    `SELECT ${COLUMNS} FROM sl_session_list WHERE tenant = ? AND ${where} AND ${segment} LIMIT ?`,
    [input.tenant, ...params, ...values],
  ])
}

function page(port: Executor, input: Input, filters: readonly Clause[]): Row[] {
  const rows: Row[] = []
  for (const [sql, params] of listStatements(input, filters)) {
    const left = input.limit + 1 - rows.length
    if (left === 0) break
    rows.push(...rowsOf(port, sql, [...params, BigInt(left)]))
  }
  return rows
}

/** The clauses of one listing of the sessions not archived. */
export function listFilters(
  input: Omit<Input, 'tenant' | 'after' | 'limit'>,
  reference: Parameters<typeof standingClauses>[1],
): readonly Clause[] {
  return [...own(input), ...standingClauses(input.filter ?? {}, reference)]
}

export default handler('session.list', (raw, port) => {
  const input = raw as unknown as Input
  if (!valid(input)) throw new Error('invalid input')
  const reference =
    input.reference === undefined ? null : referenceOf(port, input.tenant, input.reference)
  if (input.reference !== undefined && reference === null) return { reference: 'absent' }
  const rows = page(port, input, listFilters(input, reference))
  const shown = rows.slice(0, input.limit)
  const items = shown.map(row => ({
    session: text(row['session']),
    createdAt: nullable(row['created_at']),
    lastActivityAt: nullable(row['last_activity_at']),
    lifecycle: text(row['lifecycle']),
    title: nullable(row['title']),
    archivedAt: null,
    archivedBy: null,
    ...standingOfRow(row, reference),
  }))
  const last = shown.at(-1)
  const next =
    rows.length > input.limit && last !== undefined
      ? { at: nullable(last['last_activity_at']), session: text(last['session']) }
      : null
  return { items, next, completeness: 'complete' }
})
