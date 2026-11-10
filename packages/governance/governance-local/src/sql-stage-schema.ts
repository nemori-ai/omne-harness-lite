import { z } from 'zod'
import type { CommitRequestV2 } from '@omne-harness/sql-contract'
import { GovernanceIdSchema, GovernanceDigestSchema } from '@omne-harness/governance-contract'
import { bindingSchema, recordSchema } from './operation-schema.ts'

export const sqlStageSchema = z.enum([
  'standing-prepare',
  'standing-held',
  'submit',
  'apply',
  'seal',
  'standing-seal',
  'standing-settled',
  'source-held',
  'source-settled',
])
export type SqlStage = z.infer<typeof sqlStageSchema>
export const sqlEnvelopeSchema = z.strictObject({
  identity: recordSchema.shape.sqlIdentity,
  combinationVersion: GovernanceIdSchema,
  manifestDigest: GovernanceDigestSchema,
  commands: z
    .array(
      z.strictObject({
        participant: GovernanceIdSchema,
        facts: z.record(z.string(), z.json()),
      }),
    )
    .min(2)
    .max(128),
}) satisfies z.ZodType<CommitRequestV2>
export const stageRequestSchema = z.strictObject({ binding: bindingSchema, stage: sqlStageSchema })
export const persistStageSchema = stageRequestSchema.extend({ envelope: sqlEnvelopeSchema })
export type PersistStage = z.infer<typeof persistStageSchema>
export const storedStageSchema = z.strictObject({
  kind: z.literal('stored'),
  stage: sqlStageSchema,
  envelope: sqlEnvelopeSchema,
  inputDigest: GovernanceDigestSchema,
})
