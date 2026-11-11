import { z } from 'zod'
import { SettingsIdSchema, SettingsReferenceSchema } from '@omne-harness/settings'
import { SettingsProjectionBindingSchema, SettingsTargetProjectionSchema } from './projection.ts'

export const settingsStandalonePublicationFact = {
  key: 'settings.standalone-publication',
  protocol: 'settings-publication/1',
}
export const StandalonePublicationRefSchema = z.strictObject({
  publisherRef: SettingsReferenceSchema,
  definitionId: SettingsIdSchema,
  version: SettingsIdSchema,
})
export const StandalonePublicationProjectionSchema = z.strictObject({
  binding: SettingsProjectionBindingSchema,
  views: z
    .array(
      SettingsTargetProjectionSchema.pick({
        target: true,
        definitionRef: true,
        ownerRevision: true,
      }).extend({ publicationRef: StandalonePublicationRefSchema.nullable() }),
    )
    .max(128),
})
export type StandalonePublicationRef = z.infer<typeof StandalonePublicationRefSchema>
export type StandalonePublicationProjection = z.infer<typeof StandalonePublicationProjectionSchema>
