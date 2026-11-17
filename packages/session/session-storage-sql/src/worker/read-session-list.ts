import type { SqlValue } from '@omne-harness/sql-contract/worker'
import { SESSION_LIST_SCAN_ROWS } from './schema.ts'
import { handler, rowsOf, text, type Executor, type Row } from './support.ts'

type Key = Readonly<{ at: string | null; session: string }>
type Input = Readonly<{
  tenant: string
  after: Key | null
  limit: number
}>
type Item = Readonly<{
  session: string
  createdAt: string | null
  lastActivityAt: string | null
  lifecycle: string
  title: string | null
  archivedAt: null
  archivedBy: null
}>

const COLUMNS = 'session, created_at, last_activity_at, lifecycle, title'
const nullable = (cell: Row[string] | undefined): string | null =>
  cell === null || cell === undefined ? null : text(cell)

function segments(after: Key | null): readonly (readonly [string, readonly SqlValue[]])[] {
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

function* scan(port: Executor, tenant: string, after: Key | null, bound: number): Iterable<Row> {
  let left = bound
  for (const [where, params] of segments(after)) {
    if (left === 0) return
    const rows = rowsOf(
      port,
      `SELECT ${COLUMNS} FROM sl_session_list WHERE tenant = ? AND ${where} LIMIT ?`,
      [tenant, ...params, BigInt(left)],
    )
    left -= rows.length
    yield* rows
  }
}

export default handler('session.list', (raw, port) => {
  const input = raw as unknown as Input
  if (
    typeof input.tenant !== 'string' ||
    input.tenant === '' ||
    !Number.isInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > 1000
  )
    throw new Error('invalid input')
  const items: Item[] = []
  let scanned = 0
  let last: Key | null = null
  for (const row of scan(port, input.tenant, input.after, SESSION_LIST_SCAN_ROWS + 1)) {
    const key = { at: nullable(row['last_activity_at']), session: text(row['session']) }
    const full = items.length === input.limit
    if (scanned === SESSION_LIST_SCAN_ROWS)
      return { items, next: last, completeness: full ? 'complete' : 'partial' }
    scanned += 1
    const lifecycle = text(row['lifecycle'])
    const included = lifecycle !== 'archived'
    if (full) {
      if (included) return { items, next: last, completeness: 'complete' }
      continue
    }
    last = key
    if (!included) continue
    items.push({
      session: key.session,
      createdAt: nullable(row['created_at']),
      lastActivityAt: key.at,
      lifecycle,
      title: nullable(row['title']),
      archivedAt: null,
      archivedBy: null,
    })
  }
  return { items, next: null, completeness: 'complete' }
})
