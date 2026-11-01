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

export const serverEntryConfig = z.strictObject({
  /** The operator has to know the port, so `0` (a host-chosen port) is not accepted. */
  listenPort: z.number().int().min(1).max(65535).default(8787),
  maxBodyBytes: maxBodyBytes.prefault({}),
  heartbeatIntervalMs: positive.default(15000),
  jsonBudgets: jsonBudgets.prefault({}),
  maxPageBytes: positive.default(1048576),
  historyKinds: z.array(z.string().min(1)).default(() => ['message.user', 'message.assistant']),
  observation: observation.prefault({}),
})

export type ServerEntryRowConfig = z.output<typeof serverEntryConfig>
