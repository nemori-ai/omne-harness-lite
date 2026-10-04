import { definePlugin } from '@omne-harness-lite/kernel-basis'
import { isAbsolute } from 'node:path'
import { z } from 'zod'
import { applySessionLog } from './plugin-owner.ts'
import { isProcessOwnership, type ProcessOwnership, type SessionLogOptions } from './policy.ts'
import type { SessionLog } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    sessionLog: SessionLog
  }
}

const limit = z
  .number()
  .refine(value => Number.isInteger(value) && value >= 1, 'expected a positive integer')
export const Config = z
  .object({
    dir: z
      .string()
      .refine(value => isAbsolute(value) && !value.includes('\0'), 'expected an absolute path'),
    processOwnership: z.custom<ProcessOwnership>(
      isProcessOwnership,
      'expected trusted process ownership',
    ),
    policy: z
      .object({ appendQueueLimit: limit.optional(), residentLogsLimit: limit.optional() })
      .strict()
      .optional(),
    diagnostic: z
      .custom<NonNullable<SessionLogOptions['diagnostic']>>(
        value => typeof value === 'function',
        'expected a diagnostic sink',
      )
      .optional(),
  })
  .strict()
  .transform((value): SessionLogOptions => ({
    dir: value.dir,
    processOwnership: value.processOwnership,
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
    ...(value.diagnostic === undefined ? {} : { diagnostic: value.diagnostic }),
  }))
export const sessionLogJsonl = definePlugin({
  name: 'session-log-jsonl',
  Config,
  apply: applySessionLog,
})
export default sessionLogJsonl
