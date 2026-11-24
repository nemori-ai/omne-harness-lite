import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { Adoption } from '@omne-harness/session-contract'

const text = z.string().min(1)

/** Where file requests may read and where they may write; a side left out is not limited. */
const filesReachSchema = z
  .strictObject({ read: text.exactOptional(), write: text.exactOptional() })
  .readonly()

/** Where file and command tools work in the step now in force, and how far their file requests reach. */
export const workingDirectorySchema = z.discriminatedUnion('state', [
  z
    .strictObject({ state: z.literal('default'), directory: text, files: filesReachSchema })
    .readonly(),
  z
    .strictObject({
      state: z.literal('attached'),
      workspace: text,
      instance: text,
      directory: text,
      files: filesReachSchema,
    })
    .readonly(),
  z
    .strictObject({ state: z.literal('unusable'), workspace: text, instance: text, reason: text })
    .readonly(),
])
export type WorkingDirectory = z.infer<typeof workingDirectorySchema>
export type FilesReach = z.infer<typeof filesReachSchema>

export const SESSION_WORKING_DIRECTORY: Adoption = Object.freeze({
  owner: '@omne-harness/session-adapters',
  name: 'session.working-directory',
  revision: '2',
  digest: `sha256:${createHash('sha256')
    .update(JSON.stringify(z.toJSONSchema(workingDirectorySchema)))
    .digest('hex')}`,
})
