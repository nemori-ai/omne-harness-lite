import { ReadLimitedSchema } from './pool-schema.ts'
import { z } from 'zod'
import { HitlIdentifierSchema, TenantRefSchema } from '@omne-harness/human-intervention'
import { InboxEntrySchema } from './independent-schema.ts'
import { SqlSequenceSchema } from './sql-sequence.ts'

export const DELIVERY_HANDLER = 'hitl.independent-deliveries'
export const DeliveryScanSchema = z.strictObject({
  tenantRef: TenantRefSchema,
  actorRef: HitlIdentifierSchema,
  destination: HitlIdentifierSchema,
  after: SqlSequenceSchema,
  limit: z.number().int().min(1).max(100),
})
export const DeliveryScanResultSchema = z.union([
  ReadLimitedSchema,
  z.strictObject({
    kind: z.literal('page'),
    items: z.array(InboxEntrySchema).max(100).readonly(),
    next: SqlSequenceSchema.nullable(),
  }),
])

export type DeliveryScan = z.infer<typeof DeliveryScanSchema>
