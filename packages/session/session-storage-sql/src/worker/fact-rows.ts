// Shared by the read handlers of the Agent fact family: the gate of a session read, the output form
// of a fact row and the grouping of rows into whole batches. A session that is not of the tenant
// of the call answers `denied`, the same as a session that does not exist, so a read tells nothing
// of another tenant. A session whose publications are older than `execution-record/006-fact-blob`
// has a publication count but no batch at publication 1 (the migration dropped its records and
// moved none): it answers `missing`, and its reader answers `unavailable`.
import type { JsonValue } from '@omne-harness/sql-contract'
import { EXECUTION_BATCH_MAX_FACTS } from '../codec.ts'
import { big, oneRow, text, type Executor, type Row, type Scope } from './support.ts'

/** The most fact rows one page reads: two whole batches of the largest size fit. */
export const FACT_PAGE_ROWS = 2 * EXECUTION_BATCH_MAX_FACTS
/** The text length after which a page takes no further batch (it always takes one). */
export const FACT_PAGE_TEXT = 256 * 1024

export const FACT_COLUMNS = 'pub, ord, execution, kind, eseq, op, kinds, event, body'

/** One fact row as a reader gets it. `event` and `body` are the JSON the writer gave. */
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

/** The text a row adds to a page. */
const rowText = (row: Row): number =>
  text(row['body']).length + (row['event'] === null ? 0 : text(row['event']).length)

export type SessionHead =
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'missing'; published: string }>
  | Readonly<{ kind: 'held'; published: bigint }>

/** The gate of every session read of the fact family: one point read per table. */
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
  const first = oneRow(
    port,
    'SELECT ord FROM er_fact WHERE tenant = ? AND session = ? AND pub = 1 AND ord = 0 LIMIT 1',
    [scope.tenant, scope.session],
  )
  return first === undefined
    ? { kind: 'missing', published: String(published) }
    : { kind: 'held', published }
}

/**
 * The rows grouped into batches, in publication order. `full` says the read hit its row bound (it
 * read one row past `FACT_PAGE_ROWS`): the last batch may then be cut, so it is left for the next
 * page; a batch holds at most half the bound, so whole batches remain. A page stops before the batch
 * that takes it past `FACT_PAGE_TEXT`, but always holds the first batch. `more` says a next page
 * follows.
 */
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

/** Whole batches: each starts at `ord` 0 and has no gap in its places. */
export function wholeBatches(batches: readonly BatchOutput[]): boolean {
  return batches.every(batch => batch.facts.every((fact, index) => fact.ord === index))
}
