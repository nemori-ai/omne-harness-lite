import { z } from 'zod'
import { SettingsIdSchema, SettingsReferenceSchema } from './schema.ts'

export const SettingsSourceDescriptorSchema = z.strictObject({
  sourceId: SettingsIdSchema,
  ownerRef: SettingsReferenceSchema,
  scope: z.strictObject({
    kind: z.enum(['organization', 'tenant', 'session', 'owner']),
    subjectRef: SettingsReferenceSchema,
  }),
  authorityRevision: SettingsReferenceSchema,
})
export const SettingsSourceLayoutSchema = z
  .array(SettingsSourceDescriptorSchema)
  .min(1)
  .max(32)
  .refine(sources => new Set(sources.map(source => source.sourceId)).size === sources.length, {
    message: 'Each Settings source has one position in the target layout',
  })
export type SettingsSourceDescriptor = z.infer<typeof SettingsSourceDescriptorSchema>
export type SettingsSourceLayout = z.infer<typeof SettingsSourceLayoutSchema>
