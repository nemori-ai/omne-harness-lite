import { z } from 'zod'
import {
  SettingDefinitionsSchema,
  SettingsIdSchema,
  SettingsTargetSchema,
  SettingsSourceIdentitiesSchema,
} from '@omne-harness/settings'
import { SettingsTargetProjectionSchema } from './projection.ts'
import { StoredSettingsSourceLayoutSchema } from './source-layout.ts'
export const STANDALONE_PARTICIPANT = 'settings.targets'
export const STANDALONE_PROTOCOL = 'settings-targets/1'
export const STANDALONE_TABLES = ['st_targets', 'st_definitions']
export const STANDALONE_SOURCE_LAYOUT_MIGRATION = {
  owner: STANDALONE_PARTICIPANT,
  id: 'settings-target-source-layout-1',
}
export const STANDALONE_MIGRATION = { owner: STANDALONE_PARTICIPANT, id: 'settings-targets-1' }
export const STANDALONE_ENABLEMENT_MIGRATION = {
  owner: STANDALONE_PARTICIPANT,
  id: 'settings-target-enablement-1',
}
export const StandaloneTargetSchema = z.strictObject({
  target: SettingsTargetSchema,
  definition: SettingDefinitionsSchema,
  sources: SettingsSourceIdentitiesSchema,
  grants: SettingsTargetProjectionSchema.shape.grants,
})
export const StandaloneMutationSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('provision'),
    operationId: SettingsIdSchema,
    record: StandaloneTargetSchema,
    expectedRevision: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER - 1)
      .nullable(),
  }),
  z.strictObject({
    kind: z.literal('retire'),
    operationId: SettingsIdSchema,
    target: SettingsTargetSchema,
    expectedRevision: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER - 1),
  }),
])
export const StandaloneRecordSchema = z.strictObject({
  projection: SettingsTargetProjectionSchema.omit({ sources: true }).extend({
    sourceLayout: StoredSettingsSourceLayoutSchema,
  }),
  retired: z.boolean(),
})
export type StandaloneMutation = z.infer<typeof StandaloneMutationSchema>

export const STANDALONE_PROJECTION = 'settings.target-projection'
