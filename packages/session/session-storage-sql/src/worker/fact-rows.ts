import type { JsonValue } from '@omne-harness/sql-contract'
import type { SqlValue } from '@omne-harness/sql-contract/worker'
import { EXECUTION_BATCH_MAX_FACTS } from '../codec.ts'
import {
  big,
  oneRow,
  packed,
  rowsOf,
  text,
  type Executor,
  type Row,
  type Scope,
} from './support.ts'

export const FACT_PAGE_ROWS = 2 * EXECUTION_BATCH_MAX_FACTS
export const FACT_PAGE_TEXT = 256 * 1024

export const FACT_COLUMNS = 'pub, ord, execution, kind, eseq, op, kinds, event, body'

export function factRows(port: Executor, sql: string, params: readonly SqlValue[]): Row[] {
  return rowsOf(port, sql, params).map(row => ({
    ...row,
    event: row['event'] === null ? null : packed(row['event']),
    body: packed(row['body']),
  }))
}

export type FactOutput = {
  ord: number
  execution: string
  kind: string
  sequence: string | null
  kinds: JsonValue
  event: JsonValue
  body: JsonValue
}
export type BatchOutput = { published: string; operation: string | null; facts: FactOutput[] }

const parse = (cell: Row[string] | undefined): JsonValue =>
  cell === null || cell === undefined ? null : (JSON.parse(text(cell)) as JsonValue)

export function factOutput(row: Row): FactOutput {
  return {
    ord: Number(big(row['ord'])),
    execution: text(row['execution']),
    kind: text(row['kind']),
    sequence: row['eseq'] === null ? null : String(big(row['eseq'])),
    kinds: parse(row['kinds']),
    event: parse(row['event']),
    body: parse(row['body']),
  }
}

const rowText = (row: Row): number =>
  text(row['body']).length + (row['event'] === null ? 0 : text(row['event']).length)

export type SessionHead =
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'missing'; published: string }>
  | Readonly<{ kind: 'held'; published: bigint }>

export function sessionHead(port: Executor, scope: Scope): SessionHead {
  const journal = oneRow(
    port,
    'SELECT tail FROM sl_journal WHERE tenant = ? AND session = ? LIMIT 1',
    [scope.tenant, scope.session],
  )
  if (journal === undefined) return { kind: 'denied' }
  const root = oneRow(
    port,
    'SELECT published FROM er_root WHERE tenant = ? AND session = ? LIMIT 1',
    [scope.tenant, scope.session],
  )
  const published = root === undefined ? 0n : big(root['published'])
  if (published === 0n) return { kind: 'held', published }
  return olderRecords(port, scope)
    ? { kind: 'missing', published: String(published) }
    : { kind: 'held', published }
}

function olderRecords(port: Executor, scope: Scope): boolean {
  const where = [scope.tenant, scope.session]
  if (oneRow(port, 'SELECT 1 FROM er_fact WHERE tenant = ? AND session = ? LIMIT 1', where))
    return false
  return (
    oneRow(
      port,
      'SELECT 1 FROM er_execution WHERE tenant = ? AND session = ? AND settled IS NULL LIMIT 1',
      where,
    ) !== undefined
  )
}

export type ReclaimedBatch = Readonly<{ published: string; execution: string }>

export function reclaimedBatches(
  port: Executor,
  scope: Scope,
  after: bigint,
  through: bigint,
): ReclaimedBatch[] {
  return rowsOf(
    port,
    `SELECT o.published, o.execution FROM er_operation o
      JOIN er_execution e ON e.tenant = o.tenant AND e.execution = o.execution
      WHERE o.tenant = ? AND o.session = ? AND o.published > ? AND o.published <= ?
        AND e.settled IS NOT NULL
      ORDER BY o.published LIMIT ?`,
    [scope.tenant, scope.session, after, through, through - after],
  ).map(row => ({ published: String(big(row['published'])), execution: text(row['execution']) }))
}

export function batchesOf(
  rows: readonly Row[],
  full: boolean,
): Readonly<{ batches: BatchOutput[]; more: boolean }> {
  const groups: { pub: bigint; rows: Row[] }[] = []
  for (const row of rows) {
    const pub = big(row['pub'])
    const last = groups.at(-1)
    if (last !== undefined && last.pub === pub) last.rows.push(row)
    else groups.push({ pub, rows: [row] })
  }
  if (full && groups.length > 1) groups.pop()
  const batches: BatchOutput[] = []
  let used = 0
  let more = full
  for (const group of groups) {
    const size = group.rows.reduce((total, row) => total + rowText(row), 0)
    if (batches.length > 0 && used + size > FACT_PAGE_TEXT) {
      more = true
      break
    }
    used += size
    const envelope = group.rows.find(row => big(row['ord']) === 0n)
    batches.push({
      published: String(group.pub),
      operation: envelope === undefined || envelope['op'] === null ? null : text(envelope['op']),
      facts: group.rows.map(factOutput),
    })
  }
  return { batches, more }
}

export function wholeBatches(batches: readonly BatchOutput[]): boolean {
  return batches.every(batch => batch.facts.every((fact, index) => fact.ord === index))
}
