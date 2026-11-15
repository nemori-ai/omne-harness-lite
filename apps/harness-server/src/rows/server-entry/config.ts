import { z } from 'zod'

const positive = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
const nonNegative = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)

const jsonBudgets = z.strictObject({
  maxDepth: positive.default(32),
  maxItems: positive.default(65536),
  maxMembers: positive.default(1024),
  maxStringLength: positive.default(1048576),
  maxNumberLength: positive.default(64),
})

const observation = z.strictObject({
  perLogin: positive.default(4),
  perInstance: positive.default(1000),
  cancelRetentionMs: nonNegative.default(60000),
})

const maxBodyBytes = z.strictObject({
  small: positive.default(16384),
  input: positive.default(1048576),
})

const serverEntryShape = z.strictObject({
  listenPort: z.number().int().min(1).max(65535).default(8787),
  maxBodyBytes: maxBodyBytes.prefault({}),
  maxInFlightRequests: positive.default(64),
  heartbeatIntervalMs: positive.default(15000),
  jsonBudgets: jsonBudgets.prefault({}),
  maxPageBytes: positive.default(1048576),
  historyKinds: z.array(z.string().min(1)).default(() => ['message.user', 'message.assistant']),
  observation: observation.prefault({}),
  diagnosticsKinds: z.array(z.string().min(1)).optional(),
  maxRuns: positive.optional(),
  maxCallsPerRun: positive.optional(),
})

const DIAGNOSTICS_KEYS = ['diagnosticsKinds', 'maxRuns', 'maxCallsPerRun'] as const

export const serverEntryConfig = serverEntryShape.superRefine((config, ctx) => {
  const given = DIAGNOSTICS_KEYS.filter(key => config[key] !== undefined)
  if (given.length === 0 || given.length === DIAGNOSTICS_KEYS.length) return
  for (const key of DIAGNOSTICS_KEYS)
    if (config[key] === undefined)
      ctx.addIssue({
        code: 'custom',
        path: [key],
        message: 'diagnosticsKinds, maxRuns and maxCallsPerRun are given together',
      })
})

export type ServerEntryRowConfig = z.output<typeof serverEntryConfig>
