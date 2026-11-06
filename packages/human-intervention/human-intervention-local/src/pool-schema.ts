import { z } from 'zod'
import {
  TenantRefSchema,
  RevisionSchema,
  HitlIdentifierSchema,
  ListPoolSchema,
  CardSchema,
  OriginSchema,
} from '@omne-harness/human-intervention'
import { SqlSequenceSchema as sequence } from './sql-sequence.ts'
export const POOL_HANDLER = 'hitl.pool-read'
export const PoolPositionSchema = z.strictObject({
  after: sequence,
  offset: z.number().int().min(0).max(63),
})
export const PoolScanSchema = z.strictObject({
  tenantRef: TenantRefSchema,
  actorRef: HitlIdentifierSchema,
  position: PoolPositionSchema,
  filter: ListPoolSchema.unwrap().shape.filter,
  limit: z.number().int().min(1).max(100),
  snapshot: z.string().optional(),
})
export const PoolItemSchema = z.strictObject({
  card: CardSchema,
  origin: OriginSchema,
  displayContext: z.string(),
})
export const ReadLimitedSchema = z.strictObject({
  kind: z.literal('limited'),
  resource: z.string(),
  limit: z.number(),
})
export const PoolScanResultSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('page'),
    revision: RevisionSchema,
    items: z.array(PoolItemSchema),
    next: PoolPositionSchema.nullable(),
    completeness: z.enum(['complete', 'partial']),
  }),
  z.strictObject({ kind: z.literal('conflict'), reason: z.string() }),
  ReadLimitedSchema,
])
export const PoolCursorSchema = PoolPositionSchema.extend({
  snapshot: z.string().regex(/^[a-f0-9]{64}$/),
})
export type PoolPosition = z.infer<typeof PoolPositionSchema>
export type PoolCursor = z.infer<typeof PoolCursorSchema>
export type PoolScan = z.infer<typeof PoolScanSchema>
