import { z } from 'zod'
import {
  sourcePageSchema,
  sourceRequestSchema,
  sourceSettlementSchema,
  sourceReferenceSchema,
  sourceUpdateSchema,
} from './source-retention-schema.ts'
import { sourceCustodyReceiptSchema } from './source-custody-schema.ts'
export const SOURCE_SERVICE_READ = {
  handler: 'settings.source-read',
  protocol: 'settings-source-read/1',
}
export const sourceServiceReadSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('reservation'), request: sourceRequestSchema }),
  z.strictObject({ kind: z.literal('holds'), page: sourcePageSchema }),
  z.strictObject({ kind: z.literal('updates'), page: sourcePageSchema }),
])
export const sourceSettlementFactSchema = z.strictObject({
  kind: z.literal('settlement'),
  settlement: sourceSettlementSchema,
})
export const sourceReservationObservationSchema = z.union([
  sourceCustodyReceiptSchema,
  z.strictObject({ kind: z.enum(['not_found', 'conflict', 'blocked', 'limited']) }),
  z.strictObject({
    kind: z.literal('unavailable'),
    reason: z.enum([
      'unsupported',
      'forbidden',
      'definition_changed',
      'basis_changed',
      'incompatible',
    ]),
  }),
])
export const sourceHeldPageSchema = z.strictObject({
  items: z
    .array(z.strictObject({ reservationId: z.string(), request: sourceRequestSchema }))
    .max(100),
  after: sourcePageSchema.shape.after,
})
export const sourcePendingPageSchema = z.strictObject({
  items: z
    .array(
      z.strictObject({ source: sourceReferenceSchema, pending: sourceUpdateSchema.nullable() }),
    )
    .max(100),
  after: sourcePageSchema.shape.after,
})
export const sourceDestinationResultSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('terminal'),
    request: sourceRequestSchema,
    outcome: z.enum(['committed', 'aborted']),
  }),
  z.strictObject({ kind: z.literal('unavailable') }),
])
export const sourceRecognitionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('known'), request: sourceRequestSchema }),
  z.strictObject({ kind: z.literal('unavailable') }),
])
export type SettingsSourceDestination = {
  recognize(
    request: z.infer<typeof sourceRequestSchema>,
  ): Promise<z.infer<typeof sourceRecognitionSchema>>
  seal(
    request: z.infer<typeof sourceRequestSchema>,
  ): Promise<z.infer<typeof sourceDestinationResultSchema>>
}
