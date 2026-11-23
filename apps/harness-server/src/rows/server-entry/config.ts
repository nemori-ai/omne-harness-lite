import { z } from 'zod'

const positive = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)

const jsonBudgets = z.strictObject({
  maxDepth: positive.default(32),
  maxItems: positive.default(65536),
  maxMembers: positive.default(1024),
  maxStringLength: positive.default(1048576),
  maxNumberLength: positive.default(64),
})

const observation = z.strictObject({
  perLogin: positive.default(16),
  perInstance: positive.default(1000),
})

const maxBodyBytes = z.strictObject({
  small: positive.default(16384),
  input: positive.default(1048576),
})

export const serverEntryConfig = z.strictObject({
  listenPort: z.number().int().min(1).max(65535).default(8787),
  maxBodyBytes: maxBodyBytes.prefault({}),
  maxInFlightRequests: positive.default(64),
  heartbeatIntervalMs: positive.default(15000),
  jsonBudgets: jsonBudgets.prefault({}),
  observation: observation.prefault({}),
})
