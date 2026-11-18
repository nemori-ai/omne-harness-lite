import { isItemKey, itemOutput, itemScope, pageLength } from './item-rows.ts'
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

// The open items of one execution (or all its items, closed too, when asked), of every family or of
// the named ones, a page at a time after a key, with the session head they were read at.
export default handler('execution-record.open-items', (input, port) => {
  const fields = input as Readonly<Record<string, unknown>>
  const after = fields['after'] ?? null
  if (after !== null && !isItemKey(after)) throw new Error('invalid input')
  const families = familiesOf(fields['families'])
  const all = fields['all'] ?? false
  if (typeof all !== 'boolean') throw new Error('invalid input')
  const named = itemScope(input, port)
  if (named.kind === 'answer') return named.answer
  const { scope, execution, published } = named
  const only = families === null ? '' : ` AND family IN (${families.map(() => '?').join(', ')})`
  const rows = rowsOf(
    port,
    `SELECT family, item, open, pub, body FROM er_item
      WHERE tenant = ? AND execution = ?${all ? '' : ' AND open = 1'}${only}
        AND (family > ? OR (family = ? AND item > ?))
      ORDER BY family, item LIMIT ?`,
    [
      scope.tenant,
      execution,
      ...(families ?? []),
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
