import { z } from 'zod'
import { SettingsIdSchema, SettingsReferenceSchema } from '@omne-harness/settings'
import { intentIdentitySchema } from './intent-schema.ts'
import {
  sourceReferenceSchema,
  sourceRequestSchema,
  sourceSnapshotSchema,
} from './source-retention-schema.ts'
import { sourceKey, sourceReservationKey } from './source-retention-records.ts'
import { equal } from './encoding.ts'
export const sourceCustodyReferenceSchema = z.strictObject({
  identity: intentIdentitySchema,
  attemptId: SettingsIdSchema,
})
export const sourceCustodyPlanSchema = sourceCustodyReferenceSchema.extend({
  route: SettingsReferenceSchema,
  sources: z
    .array(sourceReferenceSchema)
    .max(1024)
    .refine(sources => new Set(sources.map(sourceKey)).size === sources.length),
})
export const sourceCustodyMemberSchema = sourceCustodyReferenceSchema.extend({
  source: sourceReferenceSchema,
})
const receiptBinding = {
  reservationId: z.string().regex(/^[a-f0-9]{64}$/),
  request: sourceRequestSchema,
}
export const sourceCustodyReceiptSchema = z
  .discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('held'), ...receiptBinding, snapshot: sourceSnapshotSchema }),
    z.strictObject({
      kind: z.literal('settled'),
      ...receiptBinding,
      outcome: z.enum(['committed', 'aborted']),
    }),
  ])
  .refine(
    receipt =>
      receipt.reservationId === sourceReservationKey(receipt.request) &&
      (receipt.kind !== 'held' || equal(receipt.request.source, receipt.snapshot.source)),
  )
export const sourceCustodyRecordSchema = sourceCustodyReferenceSchema.extend({
  receipt: sourceCustodyReceiptSchema,
})
export const sourceCustodyPageSchema = sourceCustodyReferenceSchema.extend({
  after: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  limit: z.number().int().min(1).max(64),
})
export type SourceCustodyPlan = z.infer<typeof sourceCustodyPlanSchema>
export type SourceCustodyMember = z.infer<typeof sourceCustodyMemberSchema>
export type SourceCustodyRecord = z.infer<typeof sourceCustodyRecordSchema>
export type SourceCustodyPage = z.infer<typeof sourceCustodyPageSchema>
