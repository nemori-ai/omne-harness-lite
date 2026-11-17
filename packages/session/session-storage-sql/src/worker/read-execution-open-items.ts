import { isItemKey, itemOutput, itemScope } from './item-rows.ts'
import { handler, PAGE_ROWS, rowsOf } from './support.ts'

// The open items of one execution, a page at a time after a key, with the session head they were read at.
export default handler('execution-record.open-items', (input, port) => {
  const after = (input as Readonly<Record<string, unknown>>)['after'] ?? null
  if (after !== null && !isItemKey(after)) throw new Error('invalid input')
  const named = itemScope(input, port)
  if (named.kind === 'answer') return named.answer
  const { scope, execution, published } = named
  const rows = rowsOf(
    port,
    `SELECT family, item, open, pub, body FROM er_item
      WHERE tenant = ? AND execution = ? AND open = 1 AND (family > ? OR (family = ? AND item > ?))
      ORDER BY family, item LIMIT ?`,
    [
      scope.tenant,
      execution,
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
