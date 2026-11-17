import type { JsonValue } from '@omne-harness/sql-contract'
import { isCount } from '../codec.ts'
import { FACT_COLUMNS, factOutput, factRows, sessionHead } from './fact-rows.ts'
import { big, handler, oneRow, PAGE_ROWS, scopeOf, text, type Row } from './support.ts'

const parse = (cell: Row[string] | undefined): JsonValue =>
  cell === null || cell === undefined ? null : (JSON.parse(text(cell)) as JsonValue)

function eventOutput(row: Row): JsonValue {
  const fact = factOutput(row)
  const event = (fact.event ?? {}) as Readonly<Record<string, JsonValue>>
  return {
    sequence: fact.sequence,
    published: String(big(row['pub'])),
    ord: fact.ord,
    kind: fact.kind,
    kinds: fact.kinds,
    source: event['source'] ?? null,
    consequences: event['consequences'] ?? null,
    control: event['control'] ?? null,
    batch: event['batch'] ?? null,
    body: fact.body,
  }
}

export default handler('execution-record.events', (input, port) => {
  const scope = scopeOf(input)
  if (scope === null) throw new Error('invalid input')
  const raw = input as Readonly<Record<string, unknown>>
  const execution = raw['execution']
  const after = raw['after']
  if (typeof execution !== 'string' || execution === '' || !isCount(after))
    throw new Error('invalid input')
  const gate = sessionHead(port, scope)
  if (gate.kind !== 'held') return gate
  const head = oneRow(
    port,
    `SELECT revision, receipt, emitted_through, ended FROM er_execution
      WHERE tenant = ? AND execution = ? AND session = ? LIMIT 1`,
    [scope.tenant, execution, scope.session],
  )
  if (head === undefined) return { kind: 'denied' }
  const rows = factRows(
    port,
    `SELECT ${FACT_COLUMNS} FROM er_fact
      WHERE tenant = ? AND execution = ? AND eseq > ? AND session = ?
      ORDER BY eseq LIMIT ?`,
    [scope.tenant, execution, BigInt(after), scope.session, PAGE_ROWS + 1],
  )
  const page = rows.slice(0, PAGE_ROWS)
  return {
    kind: 'events',
    revision: text(head['revision']),
    receipt: parse(head['receipt']),
    emittedThrough: text(head['emitted_through']),
    ended: parse(head['ended']),
    events: page.map(eventOutput),
    next: rows.length > PAGE_ROWS ? String(big(page.at(-1)!['eseq'])) : null,
  }
})
