import { isItemKey, itemOutput, itemScope } from './item-rows.ts'
import { handler, PAGE_ROWS, rowsOf } from './support.ts'

const MAX_FAMILIES = 8

function familiesOf(value: unknown): readonly string[] | null {
  if (value === undefined || value === null) return null
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_FAMILIES ||
    !value.every(family => typeof family === 'string' && family !== '') ||
    new Set(value).size !== value.length
  )
    throw new Error('invalid input')
  return value as string[]
}

// The open items of one execution (or all its items when asked), of every family or the named ones
// and under a key prefix when given, a page at a time after a key, with the head they were read at.
export default handler('execution-record.open-items', (input, port) => {
  const fields = input as Readonly<Record<string, unknown>>
  const after = fields['after'] ?? null
  if (after !== null && !isItemKey(after)) throw new Error('invalid input')
  const families = familiesOf(fields['families'])
  const all = fields['all'] ?? false
  if (typeof all !== 'boolean') throw new Error('invalid input')
  const under = fields['under'] ?? null
  if (under !== null && (typeof under !== 'string' || under === ''))
    throw new Error('invalid input')
  const named = itemScope(input, port)
  if (named.kind === 'answer') return named.answer
  const { scope, execution, published } = named
  const only = families === null ? '' : ` AND family IN (${families.map(() => '?').join(', ')})`
  const within = under === null ? '' : ' AND item >= ? AND item < ?'
  const rows = rowsOf(
    port,
    `SELECT family, item, open, pub, body FROM er_item
      WHERE tenant = ? AND execution = ?${all ? '' : ' AND open = 1'}${only}${within}
        AND (family > ? OR (family = ? AND item > ?))
      ORDER BY family, item LIMIT ?`,
    [
      scope.tenant,
      execution,
      ...(families ?? []),
      ...(under === null ? [] : [under, `${under}\u{10FFFF}`]),
      after?.family ?? '',
      after?.family ?? '',
      after?.item ?? '',
      PAGE_ROWS + 1,
    ],
  )
  const page = rows.slice(0, PAGE_ROWS)
  const last = page.at(-1)
  return {
    kind: 'open',
    published: String(published),
    items: page.map(itemOutput),
    next:
      rows.length > PAGE_ROWS && last !== undefined
        ? { family: String(last['family']), item: String(last['item']) }
        : null,
  }
})
