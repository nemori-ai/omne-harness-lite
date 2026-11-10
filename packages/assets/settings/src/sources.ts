import { z } from 'zod'
import { SettingsIdSchema, SettingsReferenceSchema } from './schema.ts'

export const SettingsSourceIdentitySchema = z.strictObject({
  sourceId: SettingsIdSchema,
  ownerRef: SettingsReferenceSchema,
  scope: z.strictObject({
    kind: z.enum(['organization', 'tenant', 'session', 'owner']),
    subjectRef: SettingsReferenceSchema,
  }),
})
export const SettingsSourceDescriptorSchema = SettingsSourceIdentitySchema.extend({
  authorityRevision: SettingsReferenceSchema,
})
export const SettingsSourceIdentitiesSchema = z
  .array(SettingsSourceIdentitySchema)
  .min(1)
  .max(32)
  .refine(sources => new Set(sources.map(source => source.sourceId)).size === sources.length, {
    message: 'Each Settings source has one position in the target layout',
  })
export const SettingsSourceLayoutSchema = z
  .array(SettingsSourceDescriptorSchema)
  .min(1)
  .max(32)
  .refine(sources => new Set(sources.map(source => source.sourceId)).size === sources.length, {
    message: 'Each Settings source has one position in the target layout',
  })
export type SettingsSourceIdentity = z.infer<typeof SettingsSourceIdentitySchema>
export type SettingsSourceDescriptor = z.infer<typeof SettingsSourceDescriptorSchema>
export type SettingsSourceLayout = z.infer<typeof SettingsSourceLayoutSchema>

export function settingsSourceIdentities(
  sources: readonly SettingsSourceDescriptor[],
): SettingsSourceIdentity[] {
  return sources.map(({ sourceId, ownerRef, scope }) => ({
    sourceId,
    ownerRef,
    scope: { ...scope },
  }))
}
