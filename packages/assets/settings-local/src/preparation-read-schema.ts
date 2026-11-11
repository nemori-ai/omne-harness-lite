import { z } from 'zod'
import { settingsAttemptBindingSchema } from './attempt-binding.ts'
import { intentIdentitySchema } from './intent-schema.ts'
import {
  sourceCustodyReferenceSchema,
  sourceCustodyMemberSchema,
  sourceCustodyPageSchema,
} from './source-custody-schema.ts'

export const PREPARATION_READ = {
  handler: 'settings.preparation-read',
  protocol: 'settings-preparation-read/1',
}
export const preparationReadSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('terminal'), binding: settingsAttemptBindingSchema }),
  z.strictObject({ kind: z.literal('root'), identity: intentIdentitySchema }),
  z.strictObject({ kind: z.literal('attempt'), input: sourceCustodyReferenceSchema }),
  z.strictObject({ kind: z.literal('standing'), input: sourceCustodyReferenceSchema }),
  z.strictObject({ kind: z.literal('source'), input: sourceCustodyMemberSchema }),
  z.strictObject({ kind: z.literal('sources'), input: sourceCustodyPageSchema }),
])
export type PreparationRead = z.infer<typeof preparationReadSchema>
