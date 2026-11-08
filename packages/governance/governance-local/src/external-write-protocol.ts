import { z } from 'zod'
import { GovernanceDigestSchema, GovernanceIdSchema } from '@omne-harness/governance-contract'
import { SettingsSourceSnapshotSchema } from '@omne-harness/settings-local/preparation'
import { bindingSchema, businessRequestSchema } from './operation-schema.ts'
import { sqlEnvelopeSchema } from './sql-stage-schema.ts'
import { externalWriteCommandSchema } from './external-write-schema.ts'

export const GovernanceExternalWriteExecutionSchema = z.strictObject({
  protocol: z.literal('governance-external-write-execution/1'),
  requestDigest: GovernanceDigestSchema,
  writer: GovernanceIdSchema,
  commands: z.array(sqlEnvelopeSchema.shape.commands.element).min(1).max(125),
})
export type GovernanceExternalWriteExecution = z.infer<
  typeof GovernanceExternalWriteExecutionSchema
>

export const governanceExternalWriteBasisFact = {
  key: 'governance.external-write-basis',
  protocol: 'governance-external-write-basis/1',
}
export const governanceExternalWriteResultFact = {
  key: 'governance.external-write-result',
  protocol: 'governance-external-write-result/1',
}
export const GovernanceExternalWriteBasisSchema = z.strictObject({
  request: businessRequestSchema,
  epoch: GovernanceIdSchema,
  transactionDomain: GovernanceIdSchema,
  command: externalWriteCommandSchema,
  source: SettingsSourceSnapshotSchema.nullable(),
})
export const GovernanceExternalWriteResultSchema = z.strictObject({
  binding: bindingSchema,
  executionDigest: GovernanceDigestSchema,
  writer: GovernanceIdSchema,
  outcome: z.enum(['committed', 'aborted']),
  result: z.json(),
})
export type GovernanceExternalWriteBasis = z.infer<typeof GovernanceExternalWriteBasisSchema>
export type GovernanceExternalWriteResult = z.infer<typeof GovernanceExternalWriteResultSchema>
