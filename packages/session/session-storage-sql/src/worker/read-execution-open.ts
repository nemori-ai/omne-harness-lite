// The open executions of one session: the head rows without an ended event, in execution order,
// one page at a time, with the publication count of the same snapshot. The cold start of a view
// reads them and then the facts of each (`execution-record.facts` with `execution`); it reads no
// fact of an ended execution.
import type { JsonValue } from '@omne-harness/sql-contract'
import { sessionHead } from './fact-rows.ts'
import { handler, PAGE_ROWS, rowsOf, scopeOf, text } from './support.ts'

export default handler('execution-record.open-executions', (input, port) => {
  const scope = scopeOf(input)
  if (scope === null) throw new Error('invalid input')
  const after = (input as Readonly<Record<string, unknown>>)['after'] ?? null
  if (after !== null && (typeof after !== 'string' || after === ''))
    throw new Error('invalid input')
  const gate = sessionHead(port, scope)
  if (gate.kind !== 'held') return gate
  const rows = rowsOf(
    port,
    `SELECT execution, revision, receipt, emitted_through FROM er_execution
      WHERE tenant = ? AND session = ? AND execution > ? AND ended IS NULL
      ORDER BY execution LIMIT ?`,
    [scope.tenant, scope.session, after ?? '', PAGE_ROWS + 1],
  )
  const page = rows.slice(0, PAGE_ROWS)
  return {
    kind: 'open',
    published: String(gate.published),
    executions: page.map(row => ({
      execution: text(row['execution']),
      revision: text(row['revision']),
      receipt: JSON.parse(text(row['receipt'])) as JsonValue,
      emittedThrough: text(row['emitted_through']),
    })),
    next: rows.length > PAGE_ROWS ? text(page.at(-1)!['execution']) : null,
  }
})
