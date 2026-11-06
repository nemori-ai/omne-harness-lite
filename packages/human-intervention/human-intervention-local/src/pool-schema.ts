import { z } from 'zod'
import { TenantRefSchema, RevisionSchema } from '@omne-harness/human-intervention'
import { RequestRecordSchema } from './request-schema.ts'

export const POOL_HANDLER = 'hitl.pool-read'
const sequence = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,18})$/)
  .refine(value => BigInt(value) <= 9223372036854775807n)
export const PoolPositionSchema = z.strictObject({
  after: sequence,
  offset: z.number().int().min(0).max(63),
})
export const PoolScanSchema = z.strictObject({
  tenantRef: TenantRefSchema,
  after: PoolPositionSchema.shape.after,
})
export const PoolScanResultSchema = z.strictObject({
  revision: RevisionSchema,
  entry: z
    .strictObject({
      sequence: sequence.refine(value => value !== '0'),
      request: RequestRecordSchema,
    })
    .nullable(),
})
export const PoolCursorSchema = PoolPositionSchema.extend({
  snapshot: z.string().regex(/^[a-f0-9]{64}$/),
})
export type PoolPosition = z.infer<typeof PoolPositionSchema>
export type PoolCursor = z.infer<typeof PoolCursorSchema>
