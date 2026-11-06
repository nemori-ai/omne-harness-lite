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

/** Queries independent requests through their original owner's audience and current Identity standing. */
export function createIndependentHitlQueries(
  options: IndependentHitlQueryOptions,
): QueryServices & { close(): Promise<void> } {
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
  async function request(ref: RequestRef, qualified: Qualified) {
    if (ref.tenantRef !== qualified.tenantRef) return undefined
    const record = await reads.request(ref)
    return record && (await reads.audience(record, qualified)) ? record : undefined
  }
  const services: QueryServices = {
    getRequest(principal, input) {
      return query(principal, GetRequestSchema, input, async (value, qualified) => {
        const record = await request(value.requestRef, qualified)
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
        const record = await request(value.cardRef.request, qualified)
        const card = record?.cards.find(item => item.ref.cardId === value.cardRef.cardId)
        return record && card
          ? {
              kind: 'found',
              item: { card, origin: record.origin, displayContext: record.displayContext },
            }
          : { kind: 'denied', reason: 'request-access' }
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
    close() {
      closing = true
      return (closed ??= Promise.allSettled(active).then(() => identity.close()))
    },
  }
}
