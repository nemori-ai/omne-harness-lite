import {
  ITEM_COLUMNS,
  ITEM_FROM,
  isItemKey,
  itemOutput,
  itemScope,
  pageLength,
} from './item-rows.ts'
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
  const only = families === null ? '' : ` AND i.family IN (${families.map(() => '?').join(', ')})`
  const within = under === null ? '' : ' AND i.item >= ? AND i.item < ?'
  const rows = rowsOf(
    port,
    `SELECT ${ITEM_COLUMNS} FROM ${ITEM_FROM}
      WHERE i.tenant = ? AND i.execution = ?${all ? '' : ' AND i.open = 1'}${only}${within}
        AND (i.family > ? OR (i.family = ? AND i.item > ?))
      ORDER BY i.family, i.item LIMIT ?`,
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
  const page = rows.slice(0, pageLength(rows, PAGE_ROWS))
  const last = page.at(-1)
  return {
    kind: 'open',
    published: String(published),
    items: page.map(itemOutput),
    next:
      rows.length > page.length && last !== undefined
        ? { family: String(last['family']), item: String(last['item']) }
        : null,
  }
})
