import type { SqlValue } from '@omne-harness/sql-contract/worker'
import { handler, rowsOf, text, type Row } from './support.ts'

// Newest archive first; a session archived before the archive columns sorts last (time unknown).
type Key = Readonly<{ at: string; session: string }>
type Input = Readonly<{
  tenant: string
  after: Key | null
  limit: number
  from: string | null
  to: string | null
  by: 'person' | 'auto' | 'parent' | null
  titleContains: string | null
}>

const COLUMNS =
  'l.session, l.created_at, l.last_activity_at, l.lifecycle, l.title, a.archived_at, a.archived_by'
const ORDER = "COALESCE(a.archived_at, '')"
const nullable = (cell: Row[string] | undefined): string | null =>
  cell === null || cell === undefined ? null : text(cell)
const optionalText = (value: unknown): boolean => value === null || typeof value === 'string'

function valid(input: Input): boolean {
  return (
    typeof input.tenant === 'string' &&
    input.tenant !== '' &&
    Number.isInteger(input.limit) &&
    input.limit >= 1 &&
    input.limit <= 1000 &&
    optionalText(input.from) &&
    optionalText(input.to) &&
    optionalText(input.titleContains) &&
    (input.by === null || ['person', 'auto', 'parent'].includes(input.by))
  )
}

function filters(input: Input): readonly (readonly [string, readonly SqlValue[]])[] {
  const after = input.after
  return [
    ["l.lifecycle = 'archived'", []],
    ...(input.from === null ? [] : [['a.archived_at >= ?', [input.from]] as const]),
    ...(input.to === null ? [] : [['a.archived_at < ?', [input.to]] as const]),
    ...(input.by === null ? [] : [['a.archived_by = ?', [input.by]] as const]),
    ...(input.titleContains === null
      ? []
      : [["INSTR(COALESCE(l.title, ''), ?) > 0", [input.titleContains]] as const]),
    ...(after === null
      ? []
      : [
          [
            `(${ORDER} < ? OR (${ORDER} = ? AND l.session > ?))`,
            [after.at, after.at, after.session],
          ] as const,
        ]),
  ]
}

export default handler('session.list-archived', (raw, port) => {
  const input = raw as unknown as Input
  if (!valid(input)) throw new Error('invalid input')
  const where = filters(input)
  const rows = rowsOf(
    port,
    `SELECT ${COLUMNS} FROM sl_session_list l
      LEFT JOIN sl_session_archive a ON a.tenant = l.tenant AND a.session = l.session
      WHERE l.tenant = ? AND ${where.map(([clause]) => clause).join(' AND ')}
      ORDER BY ${ORDER} DESC, l.session LIMIT ?`,
    [input.tenant, ...where.flatMap(([, params]) => params), BigInt(input.limit + 1)],
  )
  const page = rows.slice(0, input.limit)
  const items = page.map(row => ({
    session: text(row['session']),
    createdAt: nullable(row['created_at']),
    lastActivityAt: nullable(row['last_activity_at']),
    lifecycle: text(row['lifecycle']),
    title: nullable(row['title']),
    archivedAt: nullable(row['archived_at']),
    archivedBy: nullable(row['archived_by']),
  }))
  const last = page.at(-1)
  const next =
    rows.length > input.limit && last !== undefined
      ? { at: nullable(last['archived_at']) ?? '', session: text(last['session']) }
      : null
  return { items, next, completeness: 'complete' }
})
