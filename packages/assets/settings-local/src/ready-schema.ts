import { z } from 'zod'
import { isQualification, type Qualification } from '@omne-harness/identity'
import {
  SettingsCurrentBasisSchema,
  SettingsReferenceSchema,
  SettingsVersionWitnessSchema,
} from '@omne-harness/settings'
import { settingsAttemptBindingSchema } from './attempt-binding.ts'
import { sourceCustodyPlanSchema } from './source-custody-schema.ts'
const standingSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('identity'),
    destination: SettingsReferenceSchema,
    scopeRef: SettingsReferenceSchema,
    required: z
      .array(z.custom<Qualification>(isQualification))
      .max(16)
      .transform(q => [...new Set(q)].sort()),
  }),
  z.strictObject({ kind: z.literal('maintenance'), authority: SettingsVersionWitnessSchema }),
])
export const readySettingsIntentSchema = z.strictObject({
  binding: settingsAttemptBindingSchema,
  basis: SettingsCurrentBasisSchema,
  terminal: z.strictObject({ kind: z.literal('open'), binding: settingsAttemptBindingSchema }),
  standing: standingSchema,
  sources: sourceCustodyPlanSchema.omit({ identity: true, attemptId: true }),
})
export type ReadySettingsIntent = z.input<typeof readySettingsIntentSchema>
