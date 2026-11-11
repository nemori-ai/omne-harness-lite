import { z } from 'zod'
import { SettingsIdSchema, SettingsReferenceSchema } from '@omne-harness/settings'
import {
  SettingsProjectionBindingSchema,
  SettingsTargetProjectionSchema,
} from '@omne-harness/settings-local'
export const assetsPublicationFact = {
  key: 'assets.current-publication',
  protocol: 'assets-publication/2',
}
export const AssetPublicationRefSchema = z.strictObject({
  assetRef: SettingsReferenceSchema,
  category: SettingsIdSchema,
  name: SettingsIdSchema,
  version: SettingsIdSchema,
  source: SettingsReferenceSchema,
  bodyDigest: z.string().regex(/^[a-f0-9]{64}$/),
})
export const AssetsPublicationProjectionSchema = z.strictObject({
  binding: SettingsProjectionBindingSchema,
  views: z
    .array(
      SettingsTargetProjectionSchema.pick({
        target: true,
        ownerRevision: true,
      }).extend({
        definitionRef: SettingsTargetProjectionSchema.shape.definitionRef.nullable(),
        publicationRef: AssetPublicationRefSchema,
      }),
    )
    .max(128),
})
export type AssetPublicationRef = z.infer<typeof AssetPublicationRefSchema>
export type AssetsPublicationProjection = z.infer<typeof AssetsPublicationProjectionSchema>
