import { z } from 'zod'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import {
  GetRequestSchema,
  GetCardSchema,
  ListPoolSchema,
  HitlIdentifierSchema,
  type HumanInterventionQueries,
  type HitlReadFailure,
  type RequestRef,
  type WaitRef,
} from '@omne-harness/human-intervention'
import {
  createIdentityQualifiedHitl,
  type IdentityHitlOptions,
  type HitlQualification,
} from './identity.ts'
import { createIndependentQueryReads } from './query-reads.ts'
import { createPoolCursors } from './pool-cursor.ts'
import { readPool } from './pool.ts'

type Qualified = Extract<HitlQualification, { kind: 'qualified' }>
type QueryServices = Pick<
  HumanInterventionQueries<ActingForTenantPrincipal>,
  'getRequest' | 'getCard' | 'listPool'
>
export type IndependentHitlQueryOptions = IdentityHitlOptions &
  Readonly<{
    locationRef: string
    cursorKey: Uint8Array
  }>

/** Reads the immutable original-owner audience projection and current Identity standing. */
export function createIndependentHitlQueryRuntime(
  options: IndependentHitlQueryOptions,
): QueryServices & {
  close(): Promise<void>
  route(
    principal: ActingForTenantPrincipal,
    ref: RequestRef,
  ): Promise<{ kind: 'routed'; wait: WaitRef } | HitlReadFailure>
} {
  const location = HitlIdentifierSchema.parse(options.locationRef)
  const cursors = createPoolCursors(options.cursorKey)
  const identity = createIdentityQualifiedHitl(options)
  const reads = createIndependentQueryReads(options)
  const active = new Set<Promise<unknown>>()
  let closing = false
  let closed: Promise<void> | undefined
  function query<Input, Output>(
    principal: ActingForTenantPrincipal,
    schema: z.ZodType<Input>,
    input: Input,
    read: (value: Input, qualified: Qualified) => Promise<Output>,
  ): Promise<Output | HitlReadFailure> {
    if (closing) return Promise.resolve({ kind: 'unavailable', reason: 'closing' })
    const running = Promise.resolve().then(async (): Promise<Output | HitlReadFailure> => {
      try {
        const parsed = schema.safeParse(input)
        if (!parsed.success) return { kind: 'invalid-input', reason: 'query' }
        const qualified = await identity.qualify(principal)
        if (qualified.kind !== 'qualified') return qualified
        const result = await read(parsed.data, qualified)
        const current = await identity.qualify(principal)
        return current.kind === 'qualified' ? result : current
      } catch {
        return { kind: 'unavailable', reason: 'query-read' }
      }
    })
    active.add(running)
    void running.finally(() => active.delete(running))
    return running
  }
  const services: QueryServices = {
    getRequest(principal, input) {
      return query(principal, GetRequestSchema, input, async (value, qualified) => {
        const record =
          value.requestRef.tenantRef === qualified.tenantRef
            ? await reads.request(value.requestRef, qualified.actorRef)
            : null
        if (record && 'kind' in record) return record
        if (!record) return { kind: 'denied', reason: 'request-access' }
        const { actionBasis, ...snapshot } = record
        return {
          kind: 'found',
          request: { ...snapshot, ...(actionBasis === undefined ? {} : { actionBasis }) },
        }
      })
    },
    getCard(principal, input) {
      return query(principal, GetCardSchema, input, async (value, qualified) => {
        const item =
          value.cardRef.request.tenantRef === qualified.tenantRef
            ? await reads.card(value.cardRef, qualified.actorRef)
            : null
        if (item && 'kind' in item) return item
        return item ? { kind: 'found', item } : { kind: 'denied', reason: 'request-access' }
      })
    },
    listPool(principal, input) {
      return query(principal, ListPoolSchema, input, async (value, qualified) => {
        if (value.tenantRef !== qualified.tenantRef || value.locationRef !== location)
          return { kind: 'denied', reason: 'pool-location' }
        return readPool({ query: value, qualified, reads, cursors })
      })
    },
  }
  return {
    ...services,
    route(principal, ref) {
      return query(
        principal,
        GetRequestSchema,
        { protocol: 'hitl/1', requestRef: ref },
        async (value, qualified) => {
          const wait =
            value.requestRef.tenantRef === qualified.tenantRef
              ? await reads.route(value.requestRef, qualified.actorRef)
              : null
          return wait
            ? { kind: 'routed' as const, wait }
            : { kind: 'denied' as const, reason: 'request-access' }
        },
      )
    },
    close() {
      closing = true
      return (closed ??= Promise.allSettled(active).then(() => identity.close()))
    },
  }
}

export function createIndependentHitlQueries(
  options: IndependentHitlQueryOptions,
): QueryServices & { close(): Promise<void> } {
  const runtime = createIndependentHitlQueryRuntime(options)
  return {
    getRequest: runtime.getRequest,
    getCard: runtime.getCard,
    listPool: runtime.listPool,
    close: runtime.close,
  }
}
