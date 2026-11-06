import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { RequestRef, WaitRef, ReceiverGeneration } from '@omne-harness/human-intervention'
import { json, equal } from './encoding.ts'
import {
  REQUEST_HANDLER,
  REQUEST_PROTOCOL,
  RequestRecordSchema,
  type RequestRecord,
} from './request-schema.ts'
import {
  WAIT_HANDLER,
  WAIT_PROTOCOL,
  ActiveWaitSchema,
  IndependentControlSchema,
  IndependentSnapshotSchema,
  IndependentInboxSchema,
} from './independent-schema.ts'
import {
  DELIVERY_HANDLER,
  DeliveryScanResultSchema,
  DeliveryScanSchema,
} from './delivery-schema.ts'
import { POOL_HANDLER, PoolScanResultSchema } from './pool-schema.ts'
import type { HitlSqlTerminalOptions } from './terminals.ts'
import type { HitlQualification } from './identity.ts'

const audienceResult = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('denied') }),
  z.strictObject({
    kind: z.literal('found'),
    state: IndependentControlSchema,
    active: ActiveWaitSchema.nullable(),
  }),
])
export function createIndependentQueryReads(options: HitlSqlTerminalOptions) {
  async function read(handler: string, protocol: string, input: unknown) {
    const result = await options.storage.read({
      domain: options.domain,
      handler,
      protocol,
      requestKey: randomUUID(),
      input: json(input),
    })
    if (result.kind !== 'read') throw new Error('HITL query unavailable')
    return result.output
  }
  return {
    async deliveries(input: z.infer<typeof DeliveryScanSchema>) {
      return DeliveryScanResultSchema.parse(await read(DELIVERY_HANDLER, WAIT_PROTOCOL, input))
    },
    async snapshot(qualified: Extract<HitlQualification, { kind: 'qualified' }>, waitRef: WaitRef) {
      return IndependentSnapshotSchema.parse(
        await read(WAIT_HANDLER, WAIT_PROTOCOL, {
          tenantRef: qualified.tenantRef,
          actorRef: qualified.actorRef,
          waitRef,
          kind: 'snapshot',
        }),
      )
    },
    async inbox(
      qualified: Extract<HitlQualification, { kind: 'qualified' }>,
      waitRef: WaitRef,
      receiverGeneration: ReceiverGeneration,
    ) {
      return IndependentInboxSchema.parse(
        await read(WAIT_HANDLER, WAIT_PROTOCOL, {
          tenantRef: qualified.tenantRef,
          actorRef: qualified.actorRef,
          waitRef,
          receiverGeneration,
          kind: 'inbox',
        }),
      )
    },
    async request(ref: RequestRef) {
      return RequestRecordSchema.nullable().parse(
        await read(REQUEST_HANDLER, REQUEST_PROTOCOL, ref),
      )
    },
    async scan(tenantRef: string, after: string) {
      return PoolScanResultSchema.parse(
        await read(POOL_HANDLER, REQUEST_PROTOCOL, { tenantRef, after }),
      )
    },
    async audience(
      request: RequestRecord,
      qualified: Extract<HitlQualification, { kind: 'qualified' }>,
    ) {
      if (request.ref.tenantRef !== qualified.tenantRef)
        throw new Error('HITL query tenant mismatch')
      if (request.origin.kind !== 'independent')
        throw new Error('Original wait provider unavailable')
      const result = audienceResult.parse(
        await read(WAIT_HANDLER, WAIT_PROTOCOL, {
          tenantRef: qualified.tenantRef,
          waitRef: request.origin.wait,
          actorRef: qualified.actorRef,
          kind: 'state',
        }),
      )
      if (result.kind === 'denied') return false
      if (
        !result.active ||
        !equal(result.active.requestRef, request.ref) ||
        !equal(result.state.preparation.registration.origin, request.origin)
      )
        throw new Error('Original wait association mismatch')
      return true
    },
  }
}
export type IndependentQueryReads = ReturnType<typeof createIndependentQueryReads>
