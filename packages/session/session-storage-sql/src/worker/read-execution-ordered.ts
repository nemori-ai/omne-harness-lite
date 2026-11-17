import { isCount } from '../codec.ts'
import { executionProjectionHead } from './execution-projection-head.ts'
import { big, handler, oneRow, rowsOf, scopeOf } from './support.ts'

export default handler('execution-record.ordered', (input, port) => {
  const scope = scopeOf(input)
  if (scope === null) throw new Error('invalid ordered scope')
  const { execution, collection, after, limit, through } = input as Readonly<
    Record<string, unknown>
  >
  if (
    typeof execution !== 'string' ||
    execution === '' ||
    !isCount(after) ||
    !['entries', 'inputs', 'admissions'].includes(String(collection)) ||
    typeof limit !== 'number' ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !(through === undefined || isCount(through))
  )
    throw new Error('invalid ordered query')
  const head = executionProjectionHead(port, scope, execution)
  if (head.kind !== 'ready') return head
  const last = oneRow(
    port,
    `SELECT position FROM er_ordered
    WHERE tenant = ? AND execution = ? AND collection = ? ORDER BY position DESC LIMIT 1`,
    [scope.tenant, execution, String(collection)],
  )
  const total = last === undefined ? 0n : big(last['position'])
  if (BigInt(after) > total || (through !== undefined && BigInt(through as string) > total))
    return { kind: 'invalid' }
  const rows = rowsOf(
    port,
    `SELECT position, pub, ord FROM er_ordered
    WHERE tenant = ? AND execution = ? AND collection = ? AND position > ? AND position <= ?
      AND session = ? ORDER BY position LIMIT ?`,
    [
      scope.tenant,
      execution,
      String(collection),
      BigInt(after),
      through === undefined ? total : BigInt(through as string),
      scope.session,
      limit + 1,
    ],
  )
  const page = rows.slice(0, limit)
  return {
    ...head,
    kind: 'ordered',
    total: String(total),
    rows: page.map(row => ({
      sequence: String(big(row['position'])),
      published: String(big(row['pub'])),
      ord: Number(big(row['ord'])),
    })),
    next: rows.length > limit ? String(big(page.at(-1)!['position'])) : null,
  }
})
