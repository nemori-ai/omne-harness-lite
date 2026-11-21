import type { JsonValue } from '@omne-harness/sql-contract'
import { isItemKey, itemBytes, itemOutput, itemScope, type ItemKey } from './item-rows.ts'
import { handler, oneRow, PAGE_BYTES, PAGE_ROWS, type Executor } from './support.ts'

const isKeyList = (keys: unknown): keys is readonly ItemKey[] =>
  Array.isArray(keys) && keys.length > 0 && keys.length <= PAGE_ROWS && keys.every(isItemKey)

function keysOf(input: JsonValue): readonly ItemKey[] {
  const keys = (input as Readonly<Record<string, unknown>>)['keys']
  if (!isKeyList(keys)) throw new Error('invalid input')
  return keys
}

const hasRoom = (count: number, bytes: number): boolean => count === 0 || bytes < PAGE_BYTES

function readPage(
  port: Executor,
  tenant: string,
  execution: string,
  keys: readonly ItemKey[],
): Readonly<{ items: JsonValue[]; index: number }> {
  const items: JsonValue[] = []
  let bytes = 0
  let index = 0
  for (; index < keys.length && hasRoom(items.length, bytes); index += 1) {
    const key = keys[index]!
    const row = oneRow(
      port,
      'SELECT family, item, open, pub, body FROM er_item WHERE tenant = ? AND execution = ? AND family = ? AND item = ? LIMIT 1',
      [tenant, execution, key.family, key.item],
    )
    if (row === undefined) continue
    bytes += itemBytes(row)
    items.push(itemOutput(row))
  }
  return { items, index }
}

// Items of one execution by original key, open or closed, as many as fit one page: keys the store
// does not hold are left out, keys the page had no room for are answered as `rest`.
export default handler('execution-record.items', (input, port) => {
  const keys = keysOf(input)
  const named = itemScope(input, port)
  if (named.kind === 'answer') return named.answer
  const { scope, execution, published } = named
  const { items, index } = readPage(port, scope.tenant, execution, keys)
  const rest = keys.slice(index).map(({ family, item }) => ({ family, item }))
  return { kind: 'items', published: String(published), items, rest }
})
