import type {
  HitlConflict,
  HitlReadFailure,
  ListPool,
  PoolPage,
} from '@omne-harness/human-intervention'
import { digest } from './encoding.ts'
import type { HitlQualification } from './identity.ts'
import type { IndependentQueryReads } from './query-reads.ts'
import type { createPoolCursors } from './pool-cursor.ts'
export async function readPool(
  input: Readonly<{
    query: ListPool
    qualified: Extract<HitlQualification, { kind: 'qualified' }>
    reads: IndependentQueryReads
    cursors: ReturnType<typeof createPoolCursors>
  }>,
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
  const page = await reads.scan({
    tenantRef: qualified.tenantRef,
    actorRef: qualified.actorRef,
    position: cursor ? { after: cursor.after, offset: cursor.offset } : { after: '0', offset: 0 },
    filter: query.filter,
    limit: query.limit,
    ...(cursor ? { snapshot: cursor.snapshot } : {}),
  })
  if (page.kind !== 'page') return page
  const snapshot = digest([qualified.tenantRef, page.revision])
  return {
    kind: 'page',
    items: page.items,
    next: page.next ? cursors.encode({ ...page.next, snapshot }, context) : null,
    snapshotRef: snapshot,
    completeness: page.completeness,
  }
}
