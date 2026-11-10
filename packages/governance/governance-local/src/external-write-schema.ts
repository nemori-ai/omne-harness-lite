import { z } from 'zod'
import { GovernanceIdSchema, GovernanceScopeSchema } from '@omne-harness/governance-contract'
import { SettingsSourceReferenceSchema } from '@omne-harness/settings-local/preparation'

import { qualificationsSchema } from './qualification-schema.ts'

/** The external owner interprets its command, digest and qualification protocol. */
export const externalWriteCommandSchema = z.strictObject({
  scope: GovernanceScopeSchema,
  operationId: GovernanceIdSchema,
  write: z.strictObject({
    owner: GovernanceIdSchema,
    protocol: GovernanceIdSchema,
    targetRef: GovernanceIdSchema,
    commandDigest: GovernanceIdSchema,
    command: z.json(),
    qualification: z.json(),
  }),
  required: qualificationsSchema,
  source: SettingsSourceReferenceSchema.nullable(),
  sourceRoute: GovernanceIdSchema,
})
export const externalWriteRequestSchema = z.strictObject({
  owner: z.literal('internal.external-write'),
  command: externalWriteCommandSchema,
})
export type ExternalWriteCommand = z.infer<typeof externalWriteCommandSchema>
