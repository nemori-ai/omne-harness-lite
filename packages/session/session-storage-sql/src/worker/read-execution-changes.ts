import { sessionHead } from './fact-rows.ts'
import { big, handler, PAGE_ROWS, rowsOf, scopeOf, text } from './support.ts'

export default handler('execution-record.changed-executions', (input, port) => {
  const scope = scopeOf(input)
  const after = (input as Readonly<Record<string, unknown>>)['after']
  if (scope === null || typeof after !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(after))
    throw new Error('invalid changed execution input')
  const gate = sessionHead(port, scope)
  if (gate.kind !== 'held') return gate
  const rows = rowsOf(
    port,
    `SELECT execution, covered FROM er_current_head
    WHERE tenant = ? AND session = ? AND covered > ? ORDER BY covered LIMIT ?`,
    [scope.tenant, scope.session, BigInt(after), PAGE_ROWS + 1],
  )
  const page = rows.slice(0, PAGE_ROWS)
  return {
    kind: 'changed',
    published: String(gate.published),
    executions: page.map(row => text(row['execution'])),
    next: rows.length > PAGE_ROWS ? String(big(page.at(-1)!['covered'])) : null,
  }
})
