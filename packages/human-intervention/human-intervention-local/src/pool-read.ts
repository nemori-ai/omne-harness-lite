import { RevisionSchema } from '@omne-harness/human-intervention'
import type { ReadHandlerModule, ReadPort } from '@omne-harness/sql-contract/worker'
import { digest, json } from './encoding.ts'
import { REQUEST_PROTOCOL } from './request-schema.ts'
import { POOL_HANDLER, PoolScanSchema, type PoolScan } from './pool-schema.ts'
import { countSchema } from './relational-values.ts'
import { SqlSequenceSchema } from './sql-sequence.ts'
import { readPoolItem } from './request-record.ts'
import { pageBudget, readLimited } from './read-budget.ts'

type CardKey = Readonly<{ sequence: string; ordinal: number }>
export function selectedBuckets(filter: PoolScan['filter']) {
  if (
    (filter.originKind !== undefined && filter.originKind !== 'independent') ||
    filter.sessionRef !== undefined
  )
    return []
  const buckets: string[] = []
  for (const state of new Set(filter.states)) {
    if (state === 'decided')
      for (const delivery of filter.delivery
        ? [filter.delivery]
        : ['pending', 'accepted', 'superseded'])
        buckets.push(`decided-${delivery}`)
    else if (filter.delivery === undefined) buckets.push(state)
  }
  return buckets
}
function compare(a: CardKey, b: CardKey) {
  return BigInt(a.sequence) < BigInt(b.sequence)
    ? -1
    : BigInt(a.sequence) > BigInt(b.sequence)
      ? 1
      : a.ordinal - b.ordinal
}
function keys(port: ReadPort, query: PoolScan, start: CardKey, bucket: string): CardKey[] {
  const requests = port.execute(
    `SELECT CAST(request_sequence AS TEXT) FROM hi_pool_request_buckets_v2 INDEXED BY hi_pool_actor_bucket_v2
 WHERE tenant_ref=? AND actor_ref=? AND bucket=? AND request_sequence>=? ORDER BY request_sequence LIMIT ?`,
    [query.tenantRef, query.actorRef, bucket, BigInt(start.sequence), query.limit + 2],
  ).rows
  const result: CardKey[] = []
  for (const row of requests) {
    const sequence = SqlSequenceSchema.parse(row[0])
    const rows = port.execute(
      `SELECT card_ordinal FROM hi_card_states_v2 INDEXED BY hi_card_bucket_order_v2
 WHERE tenant_ref=? AND request_sequence=? AND bucket=? AND card_ordinal>? ORDER BY card_ordinal LIMIT ?`,
      [
        query.tenantRef,
        BigInt(sequence),
        bucket,
        sequence === start.sequence ? start.ordinal - 1 : -1,
        query.limit + 1 - result.length,
      ],
    ).rows
    if (!rows.length && sequence !== start.sequence) throw new TypeError('Empty pool bucket')
    result.push(...rows.map(row => ({ sequence, ordinal: countSchema.parse(row[0]) })))
    if (result.length === query.limit + 1) break
  }
  return result
}
function startPosition(port: ReadPort, query: PoolScan): CardKey | undefined {
  const { after, offset } = query.position
  if (offset === 0)
    return after === '9223372036854775807'
      ? { sequence: after, ordinal: 64 }
      : { sequence: (BigInt(after) + 1n).toString(), ordinal: 0 }
  const row = port.execute(
    'SELECT CAST(sequence AS TEXT),card_count FROM hi_requests_v2 WHERE tenant_ref=? AND sequence>? ORDER BY sequence LIMIT 1',
    [query.tenantRef, BigInt(after)],
  ).rows[0]
  return row && offset < countSchema.parse(row[1])
    ? { sequence: SqlSequenceSchema.parse(row[0]), ordinal: offset }
    : undefined
}
export default {
  handler: POOL_HANDLER,
  protocol: REQUEST_PROTOCOL,
  read(input, port) {
    const parsed = PoolScanSchema.safeParse(input)
    if (!parsed.success) return { kind: 'failed', diagnostic: 'hitl_pool_query' }
    const query = parsed.data
    const version = port.execute(
      'SELECT revision FROM hi_request_versions WHERE tenant_ref=? LIMIT 1',
      [query.tenantRef],
    ).rows[0]
    const revision = RevisionSchema.parse(version ? version[0] : '0')
    if (query.snapshot !== undefined && query.snapshot !== digest([query.tenantRef, revision]))
      return { kind: 'read', output: { kind: 'conflict', reason: 'pool-snapshot-changed' } }
    const budget = pageBudget({ revision })
    if (!budget.fits) return { kind: 'read', output: json(readLimited) }
    const start = startPosition(port, query)
    if (!start) return { kind: 'read', output: { kind: 'conflict', reason: 'pool-position' } }
    const selected = selectedBuckets(query.filter)
      .flatMap(bucket => keys(port, query, start, bucket))
      .sort(compare)
      .slice(0, query.limit + 1)
    const items: ReturnType<typeof readPoolItem>['item'][] = []
    let next = query.position,
      partial = false
    for (const key of selected.slice(0, query.limit)) {
      const loaded = readPoolItem(port, query.tenantRef, key.sequence, key.ordinal)
      if (!budget.accept(loaded.item)) {
        if (!items.length) return { kind: 'read', output: json(readLimited) }
        partial = true
        break
      }
      items.push(loaded.item)
      next =
        key.ordinal + 1 < loaded.cardCount
          ? { after: (BigInt(key.sequence) - 1n).toString(), offset: key.ordinal + 1 }
          : { after: key.sequence, offset: 0 }
    }
    return {
      kind: 'read',
      output: json({
        kind: 'page',
        revision,
        items,
        next: items.length < selected.length ? next : null,
        completeness: partial ? 'partial' : 'complete',
      }),
    }
  },
} satisfies ReadHandlerModule
