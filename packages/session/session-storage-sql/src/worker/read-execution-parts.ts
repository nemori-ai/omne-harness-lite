// The Agent records of one session, page by page, in one snapshot per page: the publication count,
// the whole state of a writer that does not split it (first page only), and the named parts in
// ascending part order after `after`. `parts` limits the read to the parts it names. `since` reads
// only the parts written by a publication after that count, with the dropped ones (state null);
// without it a dropped part is not read. A page stops before the part that would take it past its
// text budget, but always holds one part when one remains, so a reader that follows `next` reads
// every part.
import type { JsonValue } from '@omne-harness/sql-contract'
import { big, handler, oneRow, rowsOf, scopeOf, text } from './support.ts'

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

export default handler('execution-record.parts', (input, port) => {
  const scope = scopeOf(input)
  if (scope === null) throw new Error('invalid input')
  const raw = input as Record<string, unknown>
  const after = raw['after'] ?? null
  if (after !== null && (typeof after !== 'string' || after === '')) throw new Error('invalid input')
  const names = namesOf(raw)
  const since = sinceOf(raw)
  if (names === 'invalid' || since === 'invalid') throw new Error('invalid input')
  const root = oneRow(
    port,
    'SELECT published FROM er_root WHERE tenant = ? AND session = ? LIMIT 1',
    [scope.tenant, scope.session],
  )
  if (root === undefined) return { published: '0', state: null, parts: [], next: null }
  let state: JsonValue = null
  if (after === null) {
    const whole = oneRow(
      port,
      'SELECT state FROM er_state WHERE tenant = ? AND session = ? LIMIT 1',
      [scope.tenant, scope.session],
    )
    if (whole !== undefined) state = JSON.parse(text(whole['state'])) as JsonValue
  }
  const filter = names === null ? '' : ` AND part IN (${names.map(() => '?').join(', ')})`
  const written = since === null ? ' AND state IS NOT NULL' : ' AND published > ?'
  const rows = rowsOf(
    port,
    `SELECT part, state FROM er_state_part
      WHERE tenant = ? AND session = ? AND part > ?${written}${filter}
      ORDER BY part LIMIT ${PART_PAGE_ROWS + 1}`,
    [scope.tenant, scope.session, after ?? '', ...(since === null ? [] : [since]), ...(names ?? [])],
  )
  const parts: { part: string; state: JsonValue }[] = []
  let used = 0
  let next: string | null = null
  for (const row of rows) {
    const body = row['state'] === null ? null : text(row['state'])
    const size = body?.length ?? 0
    if (parts.length === PART_PAGE_ROWS || (parts.length > 0 && used + size > PART_PAGE_TEXT)) {
      next = parts.at(-1)!.part
      break
    }
    used += size
    parts.push({ part: text(row['part']), state: body === null ? null : (JSON.parse(body) as JsonValue) })
  }
  return { published: String(big(root['published'])), state, parts, next }
})
