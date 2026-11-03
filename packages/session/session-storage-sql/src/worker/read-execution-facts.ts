// The events of one execution after a sequence, from the append-only Agent index rows (C-WORKCACHE
// design §5, path P): the head row of the execution (`er_execution`) and, in sequence order, its
// fact rows (`er_fact_idx`) with the body the same publication wrote beside them (`er_fact_body`).
// An interpreter that has read through sequence `after` reads only the rows after it, so a read
// does not grow with the session or with the records of the execution. A fact row without a body
// row (written before the body table, or by a writer that writes none) answers its body as
// `'absent'`; the reader then falls back to the records. Every statement filters on the tenant and
// the session of the call.
import type { JsonValue } from '@omne-harness/sql-contract'
import { handler, oneRow, PAGE_ROWS, rowsOf, scopeOf, text, type Row } from './support.ts'

const COUNT = /^(0|[1-9][0-9]{0,17})$/

/** The JSON of a text cell; a NULL cell is null. */
function json(cell: Row[string] | undefined): JsonValue {
  return cell === null || cell === undefined ? null : (JSON.parse(text(cell)) as JsonValue)
}

/** The body member of a fact: its JSON, null, or `'absent'` when the fact has no body row. */
function body(row: Row, column: string): JsonValue {
  return row['bodied'] === null ? 'absent' : json(row[column])
}

export default handler('execution-record.execution-facts', (input, port) => {
  const scope = scopeOf(input)
  if (scope === null) throw new Error('invalid input')
  const raw = input as Readonly<Record<string, unknown>>
  const execution = raw['execution']
  const after = raw['after']
  if (typeof execution !== 'string' || execution === '') throw new Error('invalid input')
  if (typeof after !== 'string' || !COUNT.test(after)) throw new Error('invalid input')
  const head = oneRow(
    port,
    `SELECT revision, receipt, emitted_through, ended FROM er_execution
      WHERE tenant = ? AND execution = ? AND session = ? LIMIT 1`,
    [scope.tenant, execution, scope.session],
  )
  if (head === undefined) return { kind: 'absent' }
  const rows = rowsOf(
    port,
    `SELECT f.sequence AS sequence, f.source AS source, f.kinds AS kinds,
            b.sequence AS bodied, b.consequences AS consequences, b.control AS control
       FROM er_fact_idx f
       LEFT JOIN er_fact_body b
         ON b.tenant = f.tenant AND b.execution = f.execution AND b.sequence = f.sequence
      WHERE f.tenant = ? AND f.execution = ? AND f.session = ? AND f.sequence > ?
      ORDER BY f.sequence LIMIT ?`,
    [scope.tenant, execution, scope.session, BigInt(after), PAGE_ROWS + 1],
  )
  const page = rows.slice(0, PAGE_ROWS)
  return {
    kind: 'facts',
    revision: text(head['revision']),
    receipt: json(head['receipt']),
    emittedThrough: text(head['emitted_through']),
    ended: json(head['ended']),
    facts: page.map(row => ({
      sequence: text(row['sequence']),
      source: json(row['source']),
      kinds: json(row['kinds']),
      consequences: body(row, 'consequences'),
      control: body(row, 'control'),
    })),
    next: rows.length > PAGE_ROWS ? text(page.at(-1)!['sequence']) : null,
  }
})
