import type { ReadPort } from '@omne-harness/sql-contract/worker'
import { writeEntryText } from '../entry-codec.ts'
import { readSharedEntry } from './shared-messages.ts'
import { big, handler, oneRow, packed, rowsOf, text, type Row } from './support.ts'

// What the history search reads: whole commits of a session after a revision, or single entries.
// An entry's revision is the sequence of its commit, so the commit time is one key lookup away.
type Range = Readonly<{
  mode: 'range'
  tenant: string
  session: string
  after: string
  kinds: string[]
  maxBytes: number
}>
type Points = Readonly<{
  mode: 'points'
  tenant: string
  points: Readonly<{ session: string; position: string }>[]
}>

const PAGE_ROWS = 400
const MAX_POINTS = 256
const MAX_KINDS = 16
const COLUMNS = 'position, revision, entry, bytes'

const strings = (value: unknown, max: number): value is string[] =>
  Array.isArray(value) && value.length <= max && value.every(item => typeof item === 'string')
const named = (value: unknown): value is string => typeof value === 'string' && value !== ''

function timeOf(port: ReadPort, tenant: string, session: string, revision: bigint): string | null {
  const row = oneRow(
    port,
    'SELECT at FROM sl_commit_time WHERE tenant = ? AND session = ? AND commit_seq = ? LIMIT 1',
    [tenant, session, revision],
  )
  const at = row?.['at']
  return at === null || at === undefined ? null : text(at)
}

function shown(port: ReadPort, tenant: string, session: string, row: Row) {
  return {
    text: writeEntryText(readSharedEntry(port, tenant, packed(row['entry']))),
    at: timeOf(port, tenant, session, big(row['revision'])),
  }
}

// Revisions rise with positions, so the first entry past a revision is found by halving.
function firstPast(port: ReadPort, scope: readonly [string, string], after: bigint): bigint | null {
  const head = oneRow(
    port,
    'SELECT COALESCE(MAX(position), 0) AS p FROM sl_entry WHERE tenant = ? AND session = ? LIMIT 1',
    scope,
  )
  let low = 1n
  let high = big(head?.['p'] ?? 0n)
  let found: bigint | null = null
  while (low <= high) {
    const middle = (low + high) / 2n
    const row = oneRow(
      port,
      'SELECT position, revision FROM sl_entry WHERE tenant = ? AND session = ? AND position >= ? ORDER BY position LIMIT 1',
      [...scope, middle],
    )
    if (row === undefined) break
    if (big(row['revision']) > after) {
      found = big(row['position'])
      high = middle - 1n
    } else low = big(row['position']) + 1n
  }
  return found
}

const sizeOf = (rows: readonly Row[]): number =>
  rows.reduce((sum, row) => sum + Number(row['bytes']), 0)

function range(port: ReadPort, input: Range) {
  if (!named(input.session) || !strings(input.kinds, MAX_KINDS) || input.kinds.length === 0)
    throw new Error('invalid input')
  if (!Number.isInteger(input.maxBytes) || input.maxBytes < 1) throw new Error('invalid input')
  const scope = [input.tenant, input.session] as const
  const journal = oneRow(
    port,
    'SELECT tail FROM sl_journal WHERE tenant = ? AND session = ? LIMIT 1',
    scope,
  )
  if (journal === undefined) return { kind: 'absent' }
  const tail = String(journal['tail'])
  const start = firstPast(port, scope, BigInt(input.after))
  if (start === null) return { kind: 'page', entries: [], through: tail, exhausted: true, bytes: 0 }
  const rows = rowsOf(
    port,
    `SELECT ${COLUMNS} FROM sl_entry
      WHERE tenant = ? AND session = ? AND position >= ?
        AND kind IN (${input.kinds.map(() => '?').join(', ')})
      ORDER BY position LIMIT ?`,
    [...scope, start, ...input.kinds, BigInt(PAGE_ROWS + 1)],
  )
  let taken = 0
  let bytes = 0
  while (taken < rows.length && taken < PAGE_ROWS) {
    const size = Number(rows[taken]!['bytes'])
    if (taken > 0 && bytes + size > input.maxBytes) break
    bytes += size
    taken += 1
  }
  if (taken === rows.length)
    return {
      kind: 'page',
      entries: rows.map(row => shown(port, ...scope, row)),
      through: tail,
      exhausted: true,
      bytes,
    }
  // The page ends inside the log: keep whole commits only, and say how far they reach.
  const cut = big(rows[taken]!['revision'])
  const whole = rows.slice(0, taken).filter(row => big(row['revision']) < cut)
  if (whole.length === 0) return oneCommit(port, scope, rows, { cut, tail })
  return {
    kind: 'page',
    entries: whole.map(row => shown(port, ...scope, row)),
    through: String(cut - 1n),
    exhausted: false,
    bytes: sizeOf(whole),
  }
}

// One commit that alone is more than a page asked for: it is given whole, or said to be too large.
function oneCommit(
  port: ReadPort,
  scope: readonly [string, string],
  rows: readonly Row[],
  at: Readonly<{ cut: bigint; tail: string }>,
) {
  const own = rows.filter(row => big(row['revision']) === at.cut)
  if (own.length === rows.length && rows.length > PAGE_ROWS)
    return { kind: 'oversized', revision: String(at.cut) }
  const exhausted = own.length === rows.length
  return {
    kind: 'page',
    entries: own.map(row => shown(port, ...scope, row)),
    through: exhausted ? at.tail : String(at.cut),
    exhausted,
    bytes: sizeOf(own),
  }
}

function points(port: ReadPort, input: Points) {
  if (!Array.isArray(input.points) || input.points.length > MAX_POINTS)
    throw new Error('invalid input')
  return {
    kind: 'points',
    entries: input.points.map(point => {
      if (!named(point?.session) || !named(point.position)) throw new Error('invalid input')
      const row = oneRow(
        port,
        `SELECT ${COLUMNS} FROM sl_entry WHERE tenant = ? AND session = ? AND position = ? LIMIT 1`,
        [input.tenant, point.session, BigInt(point.position)],
      )
      return row === undefined ? null : shown(port, input.tenant, point.session, row)
    }),
  }
}

export default handler('session.search-entries', (raw, port) => {
  const input = raw as unknown as Range | Points
  if (!named(input.tenant)) throw new Error('invalid input')
  if (input.mode === 'range') return range(port, input)
  if (input.mode === 'points') return points(port, input)
  throw new Error('invalid input')
})
