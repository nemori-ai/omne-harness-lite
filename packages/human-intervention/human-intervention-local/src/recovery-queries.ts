import { z } from 'zod'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import {
  GetWaitSchema,
  ReadInboxSchema,
  ListDeliveriesSchema,
  type HumanInterventionQueries,
  type RecoveryQueries,
  type WaitSnapshot,
  type HitlReadFailure,
} from '@omne-harness/human-intervention'
import type { createIdentityQualifiedHitl, HitlQualification } from './identity.ts'
import { createIndependentQueryReads } from './query-reads.ts'
import { createSignedCursors } from './pool-cursor.ts'
import { SqlSequenceSchema } from './sql-sequence.ts'
import { digest } from './encoding.ts'
import type { IndependentHitlQueryOptions } from './queries.ts'
import type { IndependentSnapshotSchema } from './independent-schema.ts'

type Snapshot = Extract<z.infer<typeof IndependentSnapshotSchema>, { kind: 'snapshot' }>
function waitSnapshot(snapshot: Snapshot): WaitSnapshot {
  const state = snapshot.state
  const base = {
    waitRef: state.preparation.registration.origin.wait,
    adoptionRef: state.preparation.registration.origin.adoptionRef,
    receiverGeneration: state.receiver.generation,
    deliveryCursor: null,
  }
  if (state.lifecycle.kind === 'terminal')
    return { ...base, state: 'terminal', terminalEvidenceRef: state.lifecycle.evidenceRef }
  if (state.checkpoint === 'resume-ready')
    return { ...base, state: 'accepted', receipts: state.receipts }
  return { ...base, state: snapshot.decisions.length ? 'replied' : 'waiting' }
}
export function createIndependentRecoveryQueries(
  options: IndependentHitlQueryOptions,
  identity: ReturnType<typeof createIdentityQualifiedHitl>,
): Pick<RecoveryQueries<ActingForTenantPrincipal>, 'getWait' | 'readInbox'> &
  Pick<HumanInterventionQueries<ActingForTenantPrincipal>, 'listDeliveries'> {
  const reads = createIndependentQueryReads(options)
  const cursors = createSignedCursors(
    z.strictObject({ after: z.number().int().min(0).max(64) }),
    options.cursorKey,
  )
  const deliveryCursors = createSignedCursors(
    z.strictObject({ after: SqlSequenceSchema }),
    options.cursorKey,
  )
  async function read<T>(
    access: ActingForTenantPrincipal,
    work: (qualified: Extract<HitlQualification, { kind: 'qualified' }>) => Promise<T>,
  ): Promise<T | HitlReadFailure> {
    const qualified = await identity.qualify(access)
    if (qualified.kind !== 'qualified') return qualified
    const result = await work(qualified)
    const current = await identity.qualify(access)
    return current.kind === 'qualified' ? result : current
  }
  return {
    listDeliveries(access, input) {
      return read(access, async qualified => {
        const parsed = ListDeliveriesSchema.safeParse(input)
        if (!parsed.success) return { kind: 'invalid-input', reason: 'query' }
        const query = parsed.data
        if (query.destination !== options.destination)
          return { kind: 'denied', reason: 'delivery-destination' }
        const context = digest([
          'independent-deliveries/1',
          qualified.tenantRef,
          qualified.actorRef,
          query.destination,
        ])
        const cursor = query.after ? deliveryCursors.decode(query.after, context) : undefined
        if (query.after && !cursor) return { kind: 'invalid-input', reason: 'delivery-cursor' }
        const result = await reads.deliveries({
          tenantRef: qualified.tenantRef,
          actorRef: qualified.actorRef,
          destination: query.destination,
          after: cursor?.after ?? '0',
          limit: query.limit,
        })
        return {
          kind: 'page',
          items: result.items,
          next:
            result.next === null ? null : deliveryCursors.encode({ after: result.next }, context),
        }
      })
    },
    getWait(access, input) {
      return read(access, async qualified => {
        const parsed = GetWaitSchema.safeParse(input)
        if (!parsed.success) return { kind: 'invalid-input', reason: 'query' }
        const snapshot = await reads.snapshot(qualified, parsed.data.waitRef)
        if (snapshot.kind === 'denied') return { kind: 'denied', reason: 'wait-access' }
        return snapshot.active
          ? { kind: 'found', wait: waitSnapshot(snapshot) }
          : { kind: 'not-found' }
      })
    },
    readInbox(access, input) {
      return read(access, async qualified => {
        const parsed = ReadInboxSchema.safeParse(input)
        if (!parsed.success) return { kind: 'invalid-input', reason: 'query' }
        const query = parsed.data
        const context = digest([
          'independent-inbox/1',
          qualified.tenantRef,
          qualified.actorRef,
          query.waitRef,
          query.receiverGeneration,
        ])
        const cursor = query.cursor ? cursors.decode(query.cursor, context) : undefined
        if (query.cursor && !cursor) return { kind: 'invalid-input', reason: 'inbox-cursor' }
        const result = await reads.inbox(qualified, query.waitRef, query.receiverGeneration)
        if (result.kind === 'denied') return { kind: 'denied', reason: 'wait-access' }
        if (result.kind === 'stale-generation') return result
        const after = cursor?.after ?? 0
        if (after > result.decisions.length) return { kind: 'conflict', reason: 'inbox-position' }
        const decisions = result.decisions.slice(after, after + query.limit)
        const next = after + decisions.length
        return {
          kind: 'page',
          decisions,
          next: next < result.decisions.length ? cursors.encode({ after: next }, context) : null,
        }
      })
    },
  }
}
