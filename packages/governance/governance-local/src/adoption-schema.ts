import { z } from 'zod'
import {
  EnforcementBindingSchema,
  GovernanceIdSchema,
  GovernanceRevisionSchema,
} from '@omne-harness/governance-contract'
import { PermissionOriginSchema } from '@omne-harness/permissions'
import {
  SettingDefinitionsSchema,
  SettingsDefinitionRefSchema,
  SettingsTargetSchema,
} from '@omne-harness/settings'
import { bindingSchema } from './operation-schema.ts'

export const adoptionEvidenceSchema = z.strictObject({
  binding: bindingSchema,
  transactionDomain: GovernanceIdSchema,
  epoch: GovernanceIdSchema,
  targets: z
    .array(
      z.strictObject({
        target: SettingsTargetSchema,
        origin: PermissionOriginSchema,
        definitionRef: SettingsDefinitionRefSchema,
        definition: SettingDefinitionsSchema,
        enabled: z.boolean(),
        ownerRevision: GovernanceRevisionSchema,
      }),
    )
    .max(128),
  enforcementBindings: z.array(EnforcementBindingSchema).max(128 * 128),
})
export type AdoptionEvidence = z.infer<typeof adoptionEvidenceSchema>
