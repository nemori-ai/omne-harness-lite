import { z } from 'zod'
import { DecisionRefSchema, OperationRefSchema } from '@omne-harness/human-intervention'
import { AudienceExportSchema } from './read-audience.ts'
import { digestSchema } from './relational-values.ts'

export const MigrationExportSchema = AudienceExportSchema.safeExtend({
  protocol: z.literal('hitl-migration-export/1'),
  registrationOperation: OperationRefSchema,
  decisions: z
    .array(z.strictObject({ ref: DecisionRefSchema, digest: digestSchema }))
    .max(64)
    .readonly(),
})
  .refine(
    value =>
      new Set(value.decisions.map(item => item.ref.card.cardId)).size === value.decisions.length,
    { message: 'Duplicate migration decision card' },
  )
  .refine(
    value =>
      new Set(value.decisions.map(item => item.ref.decisionId)).size === value.decisions.length,
    { message: 'Duplicate migration decision identity' },
  )
