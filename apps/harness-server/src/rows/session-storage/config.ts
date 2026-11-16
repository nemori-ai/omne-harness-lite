import { isAbsolute } from 'node:path'
import { z } from 'zod'
import { DEFAULT_SESSION_INTAKE_LIMITS } from '@omne-harness/session-contract'

export const DOMAIN_RULE = 'organization-account/1'

export const sessionStorageRowConfigSchema = z.strictObject({
  combinationVersion: z.string().min(1).max(1024),
  directoryFile: z.string().refine(isAbsolute, 'directoryFile must be an absolute path'),
  domainRule: z.literal(DOMAIN_RULE),
  intakeLimits: z
    .strictObject({
      maxPendingInputs: z
        .number()
        .int()
        .min(1)
        .max(Number.MAX_SAFE_INTEGER)
        .default(DEFAULT_SESSION_INTAKE_LIMITS.maxPendingInputs),
      maxInputBytes: z
        .number()
        .int()
        .min(1)
        .max(Number.MAX_SAFE_INTEGER)
        .default(DEFAULT_SESSION_INTAKE_LIMITS.maxInputBytes),
    })
    .prefault({}),
})

export type SessionStorageRowConfig = z.infer<typeof sessionStorageRowConfigSchema>
