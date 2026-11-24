import { isCount } from '../codec.ts'
import {
  batchesOf,
  FACT_COLUMNS,
  FACT_PAGE_ROWS,
  factRows,
  reclaimedBatches,
  sessionHead,
  wholeBatches,
  type BatchOutput,
  type ReclaimedBatch,
} from './fact-rows.ts'
import { handler, scopeOf } from './support.ts'

function contiguous(published: readonly string[], after: bigint): boolean {
  return published.every((pub, index) => BigInt(pub) === after + BigInt(index + 1))
}

const byPub = (left: string, right: string): number =>
  BigInt(left) < BigInt(right) ? -1 : BigInt(left) > BigInt(right) ? 1 : 0

function covered(
  batches: readonly BatchOutput[],
  reclaimed: readonly ReclaimedBatch[],
  from: bigint,
  published: string,
  more: boolean,
): boolean {
  const pubs = [...batches.map(batch => batch.published), ...reclaimed.map(item => item.published)]
  pubs.sort(byPub)
  const reached = pubs.at(-1) ?? String(from)
  return wholeBatches(batches) && contiguous(pubs, from) && (more || reached === published)
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
  let reclaimed: ReclaimedBatch[] = []
  if (execution === null && !covered(batches, reclaimed, from, published, more)) {
    const through = more ? BigInt(batches.at(-1)!.published) : head.published
    reclaimed = reclaimedBatches(port, scope, from, through)
    if (!covered(batches, reclaimed, from, published, more)) return { kind: 'missing', published }
  }
  return {
    kind: 'facts',
    published,
    batches,
    next: more ? (batches.at(-1)?.published ?? null) : null,
    ...(reclaimed.length === 0 ? {} : { reclaimed }),
  }
})
