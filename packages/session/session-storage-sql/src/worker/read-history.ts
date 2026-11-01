// R2: one byte-bounded page of the log, in either direction, by position. The continuation is the
// last position examined; the port seals it.
import { big, handler, oneRow, PAGE_ROWS, rowsOf, scopeOf, text } from './support.ts'

const MAX_KINDS = 64

type Input = Readonly<{
  mode: 'begin' | 'since' | 'next'
  kinds: string[]
  direction: 'forward' | 'backward'
  from: string | null
  edge: string | null
  upper: string | null
  pageBytes: number
}>

export default handler('session.history', (raw, port) => {
  const scope = scopeOf(raw)
  const input = raw as unknown as Input
  if (
    scope === null ||
    !Array.isArray(input.kinds) ||
    input.kinds.length > MAX_KINDS ||
    !input.kinds.every(kind => typeof kind === 'string') ||
    !Number.isInteger(input.pageBytes) ||
    input.pageBytes < 1
  )
    throw new Error('invalid input')
  const bind = [scope.tenant, scope.session]
  const journal = oneRow(
    port,
    'SELECT tail FROM sl_journal WHERE tenant = ? AND session = ? LIMIT 1',
    bind,
  )
  if (journal === undefined) return { kind: 'absent' }
  const head = oneRow(
    port,
    'SELECT COALESCE(MAX(position), 0) AS p FROM sl_entry WHERE tenant = ? AND session = ?',
    bind,
  )
  const forward = input.direction === 'forward'
  let upper = big(head?.['p'] ?? 0n)
  let edge: bigint
  if (input.mode === 'next') {
    if (input.edge === null || input.upper === null) throw new Error('invalid input')
    edge = BigInt(input.edge)
    upper = BigInt(input.upper)
  } else if (input.from !== null) {
    const found = oneRow(
      port,
      'SELECT position FROM sl_entry WHERE tenant = ? AND session = ? AND position = ? LIMIT 1',
      [...bind, BigInt(input.from)],
    )
    if (found === undefined)
      return { kind: 'invalid', field: input.mode === 'since' ? 'after' : 'from' }
    edge = BigInt(input.from)
  } else edge = forward ? 0n : upper + 1n
  const kindClause =
    input.kinds.length > 0 ? `AND kind IN (${input.kinds.map(() => '?').join(', ')})` : ''
  const rows = rowsOf(
    port,
    `SELECT position, entry, bytes FROM sl_entry
      WHERE tenant = ? AND session = ? AND position ${forward ? '>' : '<'} ? AND position <= ?
        ${kindClause}
      ORDER BY position ${forward ? 'ASC' : 'DESC'} LIMIT ?`,
    [...bind, edge, upper, ...input.kinds, BigInt(PAGE_ROWS + 1)],
  )
  const taken: typeof rows = []
  let bytes = 0
  let cut = false
  for (const row of rows.slice(0, PAGE_ROWS)) {
    const size = Number(row['bytes'])
    if (taken.length > 0 && bytes + size > input.pageBytes) {
      cut = true
      break
    }
    taken.push(row)
    bytes += size
  }
  const exhausted = !cut && rows.length <= PAGE_ROWS
  const lastTaken = taken[taken.length - 1]
  const lastPosition = lastTaken === undefined ? edge : big(lastTaken['position'])
  const positions = new Set(taken.map(row => big(row['position'])))
  let annotations: unknown[] = []
  if (taken.length > 0) {
    const all = [...positions]
    const low = all.reduce((a, b) => (a < b ? a : b))
    const high = all.reduce((a, b) => (a > b ? a : b))
    const seen = new Set<bigint>()
    annotations = rowsOf(
      port,
      `SELECT a.target AS target, e.position AS position, e.entry AS entry
         FROM sl_annotation_idx a JOIN sl_entry e
           ON e.tenant = a.tenant AND e.session = a.session AND e.position = a.position
        WHERE a.tenant = ? AND a.session = ? AND a.target BETWEEN ? AND ? AND a.position <= ?
        ORDER BY a.position LIMIT ?`,
      [...bind, low, high, upper, BigInt(PAGE_ROWS)],
    )
      .filter(row => {
        const position = big(row['position'])
        if (!positions.has(big(row['target'])) || positions.has(position) || seen.has(position))
          return false
        seen.add(position)
        return true
      })
      .map(row => JSON.parse(text(row['entry'])))
  }
  const upperRow = oneRow(
    port,
    'SELECT revision FROM sl_entry WHERE tenant = ? AND session = ? AND position = ? LIMIT 1',
    [...bind, upper],
  )
  const sample =
    taken[0] ??
    oneRow(
      port,
      'SELECT entry FROM sl_entry WHERE tenant = ? AND session = ? ORDER BY position DESC LIMIT 1',
      bind,
    )
  return {
    kind: 'page',
    upper: String(upperRow?.['revision'] ?? journal['tail']),
    interpreter:
      sample === undefined
        ? null
        : (JSON.parse(text(sample['entry'])) as { schema: never }).schema,
    entries: taken.map(row => JSON.parse(text(row['entry']))),
    scannedThrough: String(lastPosition),
    next: exhausted
      ? null
      : { edge: String(lastPosition), upper: String(upper), direction: input.direction },
    exhausted,
    annotations: annotations as never,
  }
})
