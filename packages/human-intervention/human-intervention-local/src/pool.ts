import type {
  HitlConflict,
  HitlReadFailure,
  ListPool,
  PoolItem,
  PoolPage,
} from '@omne-harness/human-intervention'
import { digest } from './encoding.ts'
import type { HitlQualification } from './identity.ts'
import type { IndependentQueryReads } from './query-reads.ts'
import type { createPoolCursors } from './pool-cursor.ts'
import type { PoolPosition } from './pool-schema.ts'
import { requestMatches, selectPoolCards } from './pool-selection.ts'

type PoolInput = Readonly<{
  query: ListPool
  qualified: Extract<HitlQualification, { kind: 'qualified' }>
  reads: IndependentQueryReads
  cursors: ReturnType<typeof createPoolCursors>
}>
type ScanPage = Awaited<ReturnType<IndependentQueryReads['scan']>>
function snapshotOf(tenant: string, page: ScanPage) {
  return digest([tenant, page.revision])
}

async function scanPool(
  input: PoolInput,
  start: PoolPosition,
  initial: ScanPage,
  snapshot: string,
): Promise<
  { kind: 'scanned'; position: PoolPosition; items: PoolItem[]; ended: boolean } | HitlConflict
> {
  const { query, qualified, reads } = input
  let position = start,
    page = initial
  const items: PoolItem[] = []
  for (let scanned = 0; scanned < 64 && items.length < query.limit; scanned++) {
    if (snapshotOf(qualified.tenantRef, page) !== snapshot)
      return { kind: 'conflict', reason: 'pool-snapshot-changed' }
    if (!page.entry) return { kind: 'scanned', position, items, ended: true }
    const { sequence, request } = page.entry
    if (position.offset >= request.cards.length)
      return { kind: 'conflict', reason: 'pool-position' }
    if (requestMatches(request, query.filter) && (await reads.audience(request, qualified))) {
      const selected = selectPoolCards({
        request,
        sequence,
        position,
        filter: query.filter,
        remaining: query.limit - items.length,
      })
      items.push(...selected.items)
      position = selected.position
    } else position = { after: sequence, offset: 0 }
    page = await reads.scan(qualified.tenantRef, position.after)
  }
  if (snapshotOf(qualified.tenantRef, page) !== snapshot)
    return { kind: 'conflict', reason: 'pool-snapshot-changed' }
  return { kind: 'scanned', position, items, ended: page.entry === null }
}
export async function readPool(
  input: PoolInput,
): Promise<PoolPage | HitlReadFailure | HitlConflict> {
  const { query, qualified, reads, cursors } = input
  const context = digest({
    tenant: qualified.tenantRef,
    actor: qualified.actorRef,
    location: query.locationRef,
    filter: { ...query.filter, states: [...new Set(query.filter.states)].sort() },
  })
  const cursor = query.cursor ? cursors.decode(query.cursor, context) : undefined
  if (query.cursor && !cursor) return { kind: 'invalid-input', reason: 'pool-cursor' }
  const position = cursor ?? { after: '0', offset: 0 }
  const initial = await reads.scan(qualified.tenantRef, position.after)
  const snapshot = cursor?.snapshot ?? snapshotOf(qualified.tenantRef, initial)
  const result = await scanPool(input, position, initial, snapshot)
  if (result.kind === 'conflict') return result
  return {
    kind: 'page',
    items: result.items,
    next: result.ended ? null : cursors.encode({ ...result.position, snapshot }, context),
    snapshotRef: snapshot,
    completeness: !result.ended && result.items.length < query.limit ? 'partial' : 'complete',
  }
}
