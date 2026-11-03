// The Agent records of one session, page by page, in one snapshot per page: the publication count,
// the whole state of a writer that does not split it (first page only), and the named parts in
// ascending part order after `after`. `parts` limits the read to the parts it names. `since` reads
// only the parts written by a publication after that count, with the dropped ones (state null);
// without it a dropped part is not read. A page stops before the part that would take it past its
// text budget, but always holds one part when one remains, so a reader that follows `next` reads
// every part.
import type { JsonValue } from '@omne-harness/sql-contract'
import { big, handler, oneRow, rowsOf, scopeOf, text, type Executor, type Row } from './support.ts'

/** The most parts one page holds, and the text length after which it holds no further part. */
export const PART_PAGE_ROWS = 64
export const PART_PAGE_TEXT = 256 * 1024

const COUNT = /^(0|[1-9][0-9]{0,17})$/

function namesOf(input: Record<string, unknown>): readonly string[] | null | 'invalid' {
  const names = input['parts']
  if (names === undefined || names === null) return null
  if (!Array.isArray(names) || names.length === 0 || names.length > PART_PAGE_ROWS) return 'invalid'
  return names.every(name => typeof name === 'string' && name !== '')
    ? (names as string[])
    : 'invalid'
}

function sinceOf(input: Record<string, unknown>): bigint | null | 'invalid' {
  const since = input['since']
  if (since === undefined || since === null) return null
  return typeof since === 'string' && COUNT.test(since) ? BigInt(since) : 'invalid'
}

type Scope = { tenant: string; session: string }
type PartsRead = Readonly<{
  scope: Scope
  after: string | null
  names: readonly string[] | null
  since: bigint | null
}>

/** The input of the read, or null when it is not valid. */
function parseRead(input: unknown): PartsRead | null {
  const scope = scopeOf(input)
  if (scope === null) return null
  const raw = input as Record<string, unknown>
  const after = raw['after'] ?? null
  if (after !== null && (typeof after !== 'string' || after === '')) return null
  const names = namesOf(raw)
  const since = sinceOf(raw)
  return names === 'invalid' || since === 'invalid' ? null : { scope, after, names, since }
}

/** The whole state of a writer that does not split it; only the first page gives it. */
function wholeState(port: Executor, scope: Scope): JsonValue {
  const whole = oneRow(
    port,
    'SELECT state FROM er_state WHERE tenant = ? AND session = ? LIMIT 1',
    [scope.tenant, scope.session],
  )
  return whole === undefined ? null : (JSON.parse(text(whole['state'])) as JsonValue)
}

/** One row more than a page holds, so that the page knows whether a next one follows. */
function partRows(port: Executor, { scope, after, names, since }: PartsRead): Row[] {
  const filter = names === null ? '' : ` AND part IN (${names.map(() => '?').join(', ')})`
  const written = since === null ? ' AND state IS NOT NULL' : ' AND published > ?'
  return rowsOf(
    port,
    `SELECT part, state FROM er_state_part
      WHERE tenant = ? AND session = ? AND part > ?${written}${filter}
      ORDER BY part LIMIT ${PART_PAGE_ROWS + 1}`,
    [
      scope.tenant,
      scope.session,
      after ?? '',
      ...(since === null ? [] : [since]),
      ...(names ?? []),
    ],
  )
}

/** The rows that fit the page, and the `after` of the next page. */
function pageOf(rows: readonly Row[]): {
  parts: { part: string; state: JsonValue }[]
  next: string | null
} {
  const parts: { part: string; state: JsonValue }[] = []
  let used = 0
  for (const row of rows) {
    const body = row['state'] === null ? null : text(row['state'])
    const size = body?.length ?? 0
    if (parts.length === PART_PAGE_ROWS || (parts.length > 0 && used + size > PART_PAGE_TEXT))
      return { parts, next: parts.at(-1)!.part }
    used += size
    parts.push({
      part: text(row['part']),
      state: body === null ? null : (JSON.parse(body) as JsonValue),
    })
  }
  return { parts, next: null }
}

export default handler('execution-record.parts', (input, port) => {
  const read = parseRead(input)
  if (read === null) throw new Error('invalid input')
  const { scope, after } = read
  const root = oneRow(
    port,
    'SELECT published FROM er_root WHERE tenant = ? AND session = ? LIMIT 1',
    [scope.tenant, scope.session],
  )
  if (root === undefined) return { published: '0', state: null, parts: [], next: null }
  const state = after === null ? wholeState(port, scope) : null
  return { published: String(big(root['published'])), state, ...pageOf(partRows(port, read)) }
})
