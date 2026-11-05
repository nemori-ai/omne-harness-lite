import { z } from 'zod'
import {
  SettingDefinitionsSchema,
  SettingsDefinitionRefSchema,
  SettingsIdSchema,
  SettingsReferenceSchema,
  SettingsTargetSchema,
} from '@omne-harness/settings'
import { domainSchema } from './schema.ts'

export const settingsStandaloneProjectionFact = {
  key: 'settings.standalone-projection',
  protocol: 'settings-projection/1',
}
export const settingsAssetsProjectionFact = {
  key: 'settings.assets-projection',
  protocol: 'settings-projection/1',
}
export const SettingsProjectionBindingSchema = z.strictObject({
  domain: domainSchema,
  principalRef: SettingsReferenceSchema,
  captureId: SettingsIdSchema,
  request: z.strictObject({
    deploymentRef: SettingsIdSchema,
    mode: z.enum(['management', 'runtime']),
    targets: z.array(SettingsTargetSchema).max(128),
    selectionRef: SettingsIdSchema.nullable(),
  }),
})
export const SettingsTargetProjectionSchema = z.strictObject({
  target: SettingsTargetSchema,
  definitionRef: SettingsDefinitionRefSchema,
  definition: SettingDefinitionsSchema,
  sourceIds: z
    .array(SettingsIdSchema)
    .min(1)
    .max(32)
    .refine(ids => new Set(ids).size === ids.length),
  grants: z
    .array(
      z.strictObject({
        sourceId: SettingsIdSchema,
        actions: z.array(z.enum(['set', 'clear', 'lock', 'unlock'])).max(4),
      }),
    )
    .max(32),
  ownerRevision: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER - 1),
})
export const SettingsOwnerProjectionSchema = z.strictObject({
  binding: SettingsProjectionBindingSchema,
  views: z.array(SettingsTargetProjectionSchema).max(128),
})
export type SettingsProjectionBinding = z.infer<typeof SettingsProjectionBindingSchema>
export type SettingsTargetProjection = z.infer<typeof SettingsTargetProjectionSchema>
export type SettingsOwnerProjection = z.infer<typeof SettingsOwnerProjectionSchema>
