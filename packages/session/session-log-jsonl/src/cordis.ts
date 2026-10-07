import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import { isAbsolute } from 'node:path'
import { z } from 'zod'
import { applySessionLog } from './plugin-owner.ts'
import { isProcessOwnership, type ProcessOwnership, type SessionLogOptions } from './policy.ts'

const limit = z
  .number()
  .refine(value => Number.isInteger(value) && value >= 1, 'expected a positive integer')
export const Config = z
  .object({
    dir: z
      .string()
      .refine(value => isAbsolute(value) && !value.includes('\0'), 'expected an absolute path'),
    policy: z
      .object({ appendQueueLimit: limit.optional(), residentLogsLimit: limit.optional() })
      .strict()
      .optional(),
  })
  .strict()
  .transform((value): Omit<SessionLogOptions, 'processOwnership' | 'diagnostic'> => ({
    dir: value.dir,
    ...(value.policy === undefined
      ? {}
      : {
          policy: {
            ...(value.policy.appendQueueLimit === undefined
              ? {}
              : { appendQueueLimit: value.policy.appendQueueLimit }),
            ...(value.policy.residentLogsLimit === undefined
              ? {}
              : { residentLogsLimit: value.policy.residentLogsLimit }),
          },
        }),
  }))
/** Live ownership and diagnostics are trusted factory bindings, never plugin Config. */
export function createSessionLogJsonl(bindings: {
  readonly processOwnership: ProcessOwnership
  readonly diagnostic?: SessionLogOptions['diagnostic']
}) {
  if (!isProcessOwnership(bindings.processOwnership))
    throw new TypeError('invalid trusted process ownership')
  if (bindings.diagnostic !== undefined && typeof bindings.diagnostic !== 'function')
    throw new TypeError('invalid trusted diagnostic sink')
  const ownership = bindings.processOwnership
  const processOwnership: ProcessOwnership = Object.freeze({
    current: ownership.current,
    observeExit: ownership.observeExit.bind(ownership),
    ...(ownership.observeLegacyExit
      ? { observeLegacyExit: ownership.observeLegacyExit.bind(ownership) }
      : {}),
  })
  const diagnostic = bindings.diagnostic
  return definePlugin({
    name: 'session-log-jsonl',
    Config,
    apply(ctx, config) {
      return applySessionLog(ctx, {
        ...config,
        processOwnership,
        ...(diagnostic ? { diagnostic } : {}),
      })
    },
  })
}
