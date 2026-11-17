import { executionProjectionHead } from './execution-projection-head.ts'
import { handler, packed, rowsOf, scopeOf, text } from './support.ts'

const PAGE = 64
export default handler('execution-record.current', (input, port) => {
  const scope = scopeOf(input)
  if (scope === null) throw new Error('invalid input')
  const { execution, after } = input as Readonly<Record<string, unknown>>
  if (
    typeof execution !== 'string' ||
    execution === '' ||
    !(after === null || typeof after === 'string')
  )
    throw new Error('invalid current execution input')
  const head = executionProjectionHead(port, scope, execution)
  if (head.kind !== 'ready') return head
  const rows = rowsOf(
    port,
    `SELECT path, value FROM er_current INDEXED BY er_current_active
    WHERE tenant = ? AND execution = ? AND session = ? AND active = 1 AND path > ? ORDER BY path LIMIT ?`,
    [scope.tenant, execution, scope.session, after ?? '', PAGE + 1],
  )
  const page = rows.slice(0, PAGE)
  return {
    ...head,
    kind: 'current',
    rows: page.map(row => ({ key: text(row['path']), value: packed(row['value']) })),
    next: rows.length > PAGE ? text(page.at(-1)!['path']) : null,
  }
})
