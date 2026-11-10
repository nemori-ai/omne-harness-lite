import { z } from 'zod'
import { SettingDefinitionsSchema } from '@omne-harness/settings'
import { readySettingsIntentSchema } from './ready-schema.ts'
import { settingsAttemptBindingSchema } from './attempt-binding.ts'
import { grantsSchema } from './schema.ts'

export const COMMIT_CURRENT = {
  key: 'settings.commit-current',
  protocol: 'settings-commit-current/1',
}
export const businessRefusalSchema = z.enum([
  'forbidden',
  'revision_conflict',
  'definition_changed',
  'locked',
  'incompatible',
])
export const commitMaterialSchema = readySettingsIntentSchema
  .omit({ binding: true, terminal: true })
  .extend({
    definition: SettingDefinitionsSchema,
    grants: grantsSchema,
  })
export const commitCurrentSchema = z.strictObject({
  binding: settingsAttemptBindingSchema,
  observation: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('available'), material: commitMaterialSchema }),
    z.strictObject({ kind: z.literal('refused'), reason: businessRefusalSchema }),
    z.strictObject({ kind: z.literal('unavailable') }),
  ]),
})
export type CommitMaterial = z.infer<typeof commitMaterialSchema>
export type CommitCurrent = z.infer<typeof commitCurrentSchema>
