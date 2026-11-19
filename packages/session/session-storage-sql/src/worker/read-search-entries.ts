import { createJudge, documentsOf, type JudgeSpec } from '@omne-harness/session-search'
import type { JsonValue } from '@omne-harness/sql-contract'
import type { ReadPort } from '@omne-harness/sql-contract/worker'
import { readSharedEntry } from './shared-messages.ts'
import { big, handler, oneRow, packed, rowsOf, text, type Row } from './support.ts'

// What the history search reads: whole commits of a session after a revision, or single entries,
// each judged against a query or turned into index rows here; only that outcome leaves the thread.
type As = Readonly<{ kind: 'judged'; spec: JudgeSpec }> | Readonly<{ kind: 'rows' }>
type Range = Readonly<{
  mode: 'range'
  tenant: string
  session: string
  after: string
  kinds: string[]
  maxBytes: number
  as: As
}>
type Points = Readonly<{
  mode: 'points'
  tenant: string
  points: Readonly<{ session: string; position: string }>[]
  as: As
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

type Judge = NonNullable<ReturnType<typeof createJudge>>
const JUDGES = 8
const judges = new Map<string, Judge>()

function judgeOf(spec: JudgeSpec): Judge {
  const key = JSON.stringify(spec)
  const held = judges.get(key)
  if (held !== undefined) return held
  const judge = createJudge(spec)
  if (judge === null) throw new Error('invalid input')
  if (judges.size >= JUDGES) judges.delete(judges.keys().next().value!)
  judges.set(key, judge)
  return judge
}

type Show = (session: string, row: Row) => JsonValue

function showing(port: ReadPort, tenant: string, as: As): Show {
  const judge = as?.kind === 'judged' ? judgeOf(as.spec) : null
  if (judge === null && as?.kind !== 'rows') throw new Error('invalid input')
  return (session, row) => {
    const entry = readSharedEntry(port, tenant, packed(row['entry']))
    const outcome = judge === null ? { documents: documentsOf(entry) } : { match: judge(entry) }
    return {
      position: String(row['position']),
      revision: String(row['revision']),
      at: timeOf(port, tenant, session, big(row['revision'])),
      ...outcome,
    } as unknown as JsonValue
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

const validRange = (input: Range): boolean =>
  named(input.session) &&
  strings(input.kinds, MAX_KINDS) &&
  input.kinds.length > 0 &&
  Number.isInteger(input.maxBytes) &&
  input.maxBytes >= 1

// How many of the rows fit the page: at least one, then as many as the bytes asked for allow.
function fitting(
  rows: readonly Row[],
  maxBytes: number,
): Readonly<{ taken: number; bytes: number }> {
  let taken = 0
  let bytes = 0
  while (taken < rows.length && taken < PAGE_ROWS) {
    const size = Number(rows[taken]!['bytes'])
    if (taken > 0 && bytes + size > maxBytes) break
    bytes += size
    taken += 1
  }
  return { taken, bytes }
}

function range(port: ReadPort, input: Range) {
  if (!validRange(input)) throw new Error('invalid input')
  const scope = [input.tenant, input.session] as const
  const show = showing(port, input.tenant, input.as)
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
  const { taken, bytes } = fitting(rows, input.maxBytes)
  if (taken === rows.length)
    return {
      kind: 'page',
      entries: rows.map(row => show(input.session, row)),
      through: tail,
      exhausted: true,
      bytes,
    }
  // The page ends inside the log: keep whole commits only, and say how far they reach.
  const cut = big(rows[taken]!['revision'])
  const whole = rows.slice(0, taken).filter(row => big(row['revision']) < cut)
  if (whole.length === 0) return oneCommit(show, input.session, rows, { cut, tail })
  return {
    kind: 'page',
    entries: whole.map(row => show(input.session, row)),
    through: String(cut - 1n),
    exhausted: false,
    bytes: sizeOf(whole),
  }
}

// One commit that alone is more than a page asked for: it is given whole, or said to be too large.
function oneCommit(
  show: Show,
  session: string,
  rows: readonly Row[],
  at: Readonly<{ cut: bigint; tail: string }>,
) {
  const own = rows.filter(row => big(row['revision']) === at.cut)
  if (own.length === rows.length && rows.length > PAGE_ROWS)
    return { kind: 'oversized', revision: String(at.cut) }
  const exhausted = own.length === rows.length
  return {
    kind: 'page',
    entries: own.map(row => show(session, row)),
    through: exhausted ? at.tail : String(at.cut),
    exhausted,
    bytes: sizeOf(own),
  }
}

function points(port: ReadPort, input: Points) {
  if (!Array.isArray(input.points) || input.points.length > MAX_POINTS)
    throw new Error('invalid input')
  const show = showing(port, input.tenant, input.as)
  return {
    kind: 'points',
    entries: input.points.map(point => {
      if (!named(point?.session) || !named(point.position)) throw new Error('invalid input')
      const row = oneRow(
        port,
        `SELECT ${COLUMNS} FROM sl_entry WHERE tenant = ? AND session = ? AND position = ? LIMIT 1`,
        [input.tenant, point.session, BigInt(point.position)],
      )
      return row === undefined ? null : show(point.session, row)
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
