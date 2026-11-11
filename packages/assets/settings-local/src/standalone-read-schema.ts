import { z } from 'zod'
import { SettingsTargetSchema } from '@omne-harness/settings'
import { domainSchema, failureSchema } from './schema.ts'
import { SettingsTargetProjectionSchema } from './projection.ts'

export const STANDALONE_READ = {
  handler: 'settings.target-read',
  protocol: 'settings-target-read/1',
}
export const standaloneReadRequestSchema = z.strictObject({
  domain: domainSchema,
  target: SettingsTargetSchema,
})
export const StandaloneTargetReadResultSchema = z.union([
  z.strictObject({
    kind: z.literal('found'),
    projection: SettingsTargetProjectionSchema,
    retired: z.boolean(),
  }),
  z.strictObject({ kind: z.literal('not_found') }),
  failureSchema,
])
export type StandaloneTargetReadResult = z.infer<typeof StandaloneTargetReadResultSchema>
