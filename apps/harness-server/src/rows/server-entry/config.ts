// The row configuration of `server-entry`: the numbers the member leaves to the assembly. The
// schema is synchronous and strict, so an unknown key (for example a listen address) or a value
// out of range fails the row. The listen address is not configurable: the row always binds
// 127.0.0.1 in plain text (line pack 2.5). The initial values are the ones of the assembly page
// and the member README.
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
  /** The governance path. */
  small: positive.default(16384),
  /** The session path. */
  input: positive.default(1048576),
})

const serverEntryShape = z.strictObject({
  /** The operator has to know the port, so `0` (a host-chosen port) is not accepted. */
  listenPort: z.number().int().min(1).max(65535).default(8787),
  maxBodyBytes: maxBodyBytes.prefault({}),
  maxInFlightRequests: positive.default(64),
  heartbeatIntervalMs: positive.default(15000),
  jsonBudgets: jsonBudgets.prefault({}),
  maxPageBytes: positive.default(1048576),
  historyKinds: z.array(z.string().min(1)).default(() => ['message.user', 'message.assistant']),
  observation: observation.prefault({}),
  /**
   * The session diagnostics projection (member SPEC「会话诊断投影」): the entry kinds it reads, the
   * most Runs of one page and the most calls of one Run. The three come together; a deployment
   * without them answers `read-session-diagnostics` as `basis-unavailable`. No initial value: the
   * kinds a deployment discloses are the operator's.
   */
  diagnosticsKinds: z.array(z.string().min(1)).optional(),
  maxRuns: positive.optional(),
  maxCallsPerRun: positive.optional(),
})

const DIAGNOSTICS_KEYS = ['diagnosticsKinds', 'maxRuns', 'maxCallsPerRun'] as const

/** The row schema with the projection fields given together or left out together. */
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
