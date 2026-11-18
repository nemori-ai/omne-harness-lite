import { isItemKey, itemBytes, itemOutput, itemScope, type ItemKey } from './item-rows.ts'
import { handler, oneRow, PAGE_BYTES, PAGE_ROWS } from './support.ts'

// Items of one execution by original key, open or closed, as many as fit one page: keys the store
// does not hold are left out, keys the page had no room for are answered as `rest`.
export default handler('execution-record.items', (input, port) => {
  const keys = (input as Readonly<Record<string, unknown>>)['keys']
  if (
    !Array.isArray(keys) ||
    keys.length === 0 ||
    keys.length > PAGE_ROWS ||
    !keys.every(isItemKey)
  )
    throw new Error('invalid input')
  const named = itemScope(input, port)
  if (named.kind === 'answer') return named.answer
  const { scope, execution, published } = named
  const items = []
  let bytes = 0
  let index = 0
  for (; index < keys.length && (items.length === 0 || bytes < PAGE_BYTES); index += 1) {
    const key = keys[index] as ItemKey
    const row = oneRow(
      port,
      'SELECT family, item, open, pub, body FROM er_item WHERE tenant = ? AND execution = ? AND family = ? AND item = ? LIMIT 1',
      [scope.tenant, execution, key.family, key.item],
    )
    if (row === undefined) continue
    bytes += itemBytes(row)
    items.push(itemOutput(row))
  }
  const rest = (keys as ItemKey[]).slice(index).map(({ family, item }) => ({ family, item }))
  return { kind: 'items', published: String(published), items, rest }
})
