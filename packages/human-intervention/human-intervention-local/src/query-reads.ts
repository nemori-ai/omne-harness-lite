import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  WaitRefSchema,
  type CardRef,
  type RequestRef,
  type WaitRef,
  type ReceiverGeneration,
} from '@omne-harness/human-intervention'
import { json } from './encoding.ts'
import { REQUEST_HANDLER, REQUEST_PROTOCOL, RequestRecordSchema } from './request-schema.ts'
import {
  WAIT_HANDLER,
  WAIT_PROTOCOL,
  IndependentSnapshotSchema,
  IndependentInboxSchema,
} from './independent-schema.ts'
import {
  DELIVERY_HANDLER,
  DeliveryScanResultSchema,
  DeliveryScanSchema,
} from './delivery-schema.ts'
import {
  POOL_HANDLER,
  PoolScanResultSchema,
  PoolItemSchema,
  ReadLimitedSchema,
  type PoolScan,
} from './pool-schema.ts'
import type { HitlSqlTerminalOptions } from './terminals.ts'
import type { HitlQualification } from './identity.ts'
type Qualified = Extract<HitlQualification, { kind: 'qualified' }>
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
    async snapshot(qualified: Qualified, waitRef: WaitRef) {
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
      qualified: Qualified,
      waitRef: WaitRef,
      receiverGeneration: ReceiverGeneration,
      offset: number,
      limit: number,
    ) {
      return IndependentInboxSchema.parse(
        await read(WAIT_HANDLER, WAIT_PROTOCOL, {
          tenantRef: qualified.tenantRef,
          actorRef: qualified.actorRef,
          waitRef,
          receiverGeneration,
          offset,
          limit,
          kind: 'inbox',
        }),
      )
    },
    async request(ref: RequestRef, actorRef: string) {
      return z
        .union([RequestRecordSchema.nullable(), ReadLimitedSchema])
        .parse(await read(REQUEST_HANDLER, REQUEST_PROTOCOL, { kind: 'request', ref, actorRef }))
    },
    async card(ref: CardRef, actorRef: string) {
      return z
        .union([PoolItemSchema.nullable(), ReadLimitedSchema])
        .parse(await read(REQUEST_HANDLER, REQUEST_PROTOCOL, { kind: 'card', ref, actorRef }))
    },
    async route(ref: RequestRef, actorRef: string) {
      return WaitRefSchema.nullable().parse(
        await read(REQUEST_HANDLER, REQUEST_PROTOCOL, { kind: 'route', ref, actorRef }),
      )
    },
    async scan(input: PoolScan) {
      return PoolScanResultSchema.parse(await read(POOL_HANDLER, REQUEST_PROTOCOL, input))
    },
  }
}
export type IndependentQueryReads = ReturnType<typeof createIndependentQueryReads>
