import { z } from 'zod'
import { SettingsDefinitionRefSchema, SettingsTargetSchema } from './commands.ts'
import { SettingsReferenceSchema } from './schema.ts'
import { SettingsSourceDescriptorSchema, SettingsSourceLayoutSchema } from './sources.ts'

export const SettingsVersionWitnessSchema = z.strictObject({
  ownerRef: SettingsReferenceSchema,
  subjectRef: SettingsReferenceSchema,
  revision: SettingsReferenceSchema,
})
export const SettingsSourceValueWitnessSchema = z.strictObject({
  source: SettingsSourceDescriptorSchema,
  valueOriginRef: SettingsReferenceSchema,
  valueRevision: SettingsReferenceSchema,
  presence: z.enum(['absent', 'present']),
})
export const SettingsPolicyWitnessSchema = z.strictObject({
  policyRef: SettingsReferenceSchema,
  interpretationRef: SettingsReferenceSchema,
  revision: SettingsReferenceSchema,
  inputs: z.array(SettingsSourceValueWitnessSchema).max(32),
  constraints: z.array(SettingsVersionWitnessSchema).max(32),
})

/** A serializable comparison basis. Its shape does not establish currentness or authority. */
export const SettingsCurrentBasisSchema = z.strictObject({
  protocol: z.literal('settings-current-basis/1'),
  target: SettingsTargetSchema,
  definitionRef: SettingsDefinitionRefSchema,
  ownerRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  enabled: z.boolean(),
  valueRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  sources: SettingsSourceLayoutSchema,
  declaration: SettingsVersionWitnessSchema,
  selection: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('not-required'), authority: SettingsVersionWitnessSchema }),
    z.strictObject({ kind: z.literal('current'), authority: SettingsVersionWitnessSchema }),
  ]),
  policies: z
    .array(SettingsPolicyWitnessSchema)
    .min(1)
    .max(32)
    .refine(
      policies => new Set(policies.map(policy => policy.policyRef)).size === policies.length,
      { message: 'Each required Settings policy has one interpretation in the basis' },
    ),
})
export type SettingsVersionWitness = z.infer<typeof SettingsVersionWitnessSchema>
export type SettingsSourceValueWitness = z.infer<typeof SettingsSourceValueWitnessSchema>
export type SettingsPolicyWitness = z.infer<typeof SettingsPolicyWitnessSchema>
export type SettingsCurrentBasis = z.infer<typeof SettingsCurrentBasisSchema>
