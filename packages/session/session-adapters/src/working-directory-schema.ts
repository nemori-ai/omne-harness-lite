import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { Adoption } from '@omne-harness/session-contract'

const text = z.string().min(1)

/** The directory file and command tools use by default in the step now in force. */
export const workingDirectorySchema = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('default'), directory: text }).readonly(),
  z
    .strictObject({
      state: z.literal('attached'),
      generation: z.string().optional(),
      workspace: text,
      instance: text,
      directory: text,
    })
    .readonly(),
  z
    .strictObject({ state: z.literal('unusable'), workspace: text, instance: text, reason: text })
    .readonly(),
])
export type WorkingDirectory = z.infer<typeof workingDirectorySchema>

export const SESSION_WORKING_DIRECTORY: Adoption = Object.freeze({
  owner: '@omne-harness/session-adapters',
  name: 'session.working-directory',
  revision: '1',
  digest: `sha256:${createHash('sha256')
    .update(JSON.stringify(z.toJSONSchema(workingDirectorySchema)))
    .digest('hex')}`,
})
