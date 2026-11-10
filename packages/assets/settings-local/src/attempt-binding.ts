import { z } from 'zod'
import { SettingsIdSchema } from '@omne-harness/settings'
import { intentIdentitySchema } from './intent-schema.ts'

export const settingsAttemptBindingSchema = z.strictObject({
  identity: intentIdentitySchema,
  attemptId: SettingsIdSchema,
  commandKind: z.enum(['change', 'rebase']),
  commandDigest: z.string().regex(/^[a-f0-9]{64}$/),
})
export type SettingsAttemptBinding = z.infer<typeof settingsAttemptBindingSchema>
