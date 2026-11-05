import { z } from 'zod'

const text = z.string().trim().min(1).max(2048)
export const SettingsIdSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,255}$/)
export const SettingsReferenceSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine(value =>
    [...value].every(character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127),
  )
export const SettingPresenceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('absent') }),
  z.strictObject({ kind: z.literal('value'), value: z.json() }),
])
export const SettingGroupSchema = z.strictObject({
  id: SettingsIdSchema,
  parentId: SettingsIdSchema.nullable(),
  title: text,
  description: text,
  order: z.number().int().min(-10000).max(10000),
})
export const SettingPresentationSchema = z.strictObject({
  title: text,
  description: text,
  impact: text,
  clear: text,
  adoption: z.enum(['next-read', 'next-boundary', 'reload', 'creation']),
  localizationKey: SettingsIdSchema.optional(),
  unit: text.optional(),
  enumLabels: z
    .array(z.strictObject({ value: z.json(), title: text, description: text }))
    .max(256)
    .optional(),
})
export const SettingItemSchema = z.strictObject({
  id: SettingsIdSchema,
  groupId: SettingsIdSchema,
  category: z.enum(['preference', 'binding', 'placement-identity', 'governance']),
  presentation: SettingPresentationSchema,
  valueSchema: z.record(z.string(), z.json()),
  default: SettingPresenceSchema,
  merge: z.enum(['override', 'disabled']),
  sensitivity: z.enum(['ordinary', 'secret']),
})
export const SettingDefinitionsSchema = z.strictObject({
  providerId: SettingsIdSchema,
  definitionId: SettingsIdSchema,
  version: SettingsIdSchema,
  groups: z.array(SettingGroupSchema).max(128),
  items: z.array(SettingItemSchema).max(1024),
})
export const SettingSourceSchema = z.strictObject({
  id: SettingsIdSchema,
  values: z
    .array(
      z.strictObject({
        itemId: SettingsIdSchema,
        value: SettingPresenceSchema,
        locked: z.boolean(),
      }),
    )
    .max(1024),
})
export const SettingsEvaluationSchema = z.strictObject({
  definition: SettingDefinitionsSchema,
  sources: z.array(SettingSourceSchema).max(32),
  availability: z.enum(['available', 'unavailable']).default('available'),
})
export type SettingDefinitions = z.infer<typeof SettingDefinitionsSchema>
export type SettingItem = z.infer<typeof SettingItemSchema>
export type SettingPresence = z.infer<typeof SettingPresenceSchema>
export type SettingSource = z.infer<typeof SettingSourceSchema>
export type SettingsEvaluation = z.infer<typeof SettingsEvaluationSchema>
