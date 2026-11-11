// The batches of the Agent fact family of one session after a publication (`pub > after`), in
// publication order, one snapshot per page: the incremental read of a view that holds the session
// up to `after`. The rows read are the rows published after it, so a read does not grow with the
// session. With `execution` the read takes only the facts of that execution (the cold start of an
// open execution); the batches it gives may then hold part of a publication.
// A session read without `execution` checks that the publications after `after` are all there,
// each a whole batch: a gap answers `missing`, never a shorter log.
import { isCount } from '../codec.ts'
import {
  batchesOf,
  FACT_COLUMNS,
  FACT_PAGE_ROWS,
  factRows,
  sessionHead,
  wholeBatches,
  type BatchOutput,
} from './fact-rows.ts'
import { handler, scopeOf } from './support.ts'

/** The publications after `after` are there in order, through the last one of the page. */
function contiguous(batches: readonly BatchOutput[], after: bigint): boolean {
  return batches.every((batch, index) => BigInt(batch.published) === after + BigInt(index + 1))
}

export default handler('execution-record.facts', (input, port) => {
  const scope = scopeOf(input)
  if (scope === null) throw new Error('invalid input')
  const raw = input as Readonly<Record<string, unknown>>
  const after = raw['after']
  const execution = raw['execution'] ?? null
  if (!isCount(after)) throw new Error('invalid input')
  if (execution !== null && (typeof execution !== 'string' || execution === ''))
    throw new Error('invalid input')
  const head = sessionHead(port, scope)
  if (head.kind !== 'held') return head
  const from = BigInt(after)
  const published = String(head.published)
  if (from >= head.published) return { kind: 'facts', published, batches: [], next: null }
  const filter = execution === null ? '' : ' AND execution = ?'
  const rows = factRows(
    port,
    `SELECT ${FACT_COLUMNS} FROM er_fact
      WHERE tenant = ? AND session = ? AND pub > ?${filter}
      ORDER BY pub, ord LIMIT ${String(FACT_PAGE_ROWS + 1)}`,
    [scope.tenant, scope.session, from, ...(execution === null ? [] : [execution])],
  )
  const { batches, more } = batchesOf(rows, rows.length > FACT_PAGE_ROWS)
  if (execution === null) {
    const reached = batches.at(-1)?.published ?? after
    const whole = wholeBatches(batches) && contiguous(batches, from)
    if (!whole || (!more && reached !== published)) return { kind: 'missing', published }
  }
  return {
    kind: 'facts',
    published,
    batches,
    next: more ? (batches.at(-1)?.published ?? null) : null,
  }
})
