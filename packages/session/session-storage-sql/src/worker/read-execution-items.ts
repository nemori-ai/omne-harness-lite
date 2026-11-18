import { isItemKey, itemOutput, itemScope } from './item-rows.ts'
import { handler, oneRow, PAGE_ROWS } from './support.ts'

// Items of one execution by original key, open or closed; keys the store does not hold are left out.
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
  const items = keys.flatMap(key => {
    const row = oneRow(
      port,
      'SELECT family, item, open, pub, body FROM er_item WHERE tenant = ? AND execution = ? AND family = ? AND item = ? LIMIT 1',
      [scope.tenant, execution, key.family, key.item],
    )
    return row === undefined ? [] : [itemOutput(row)]
  })
  return { kind: 'items', published: String(published), items }
})
