import type { JsonValue } from '@omne-harness/sql-contract'
import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import { z } from 'zod'
import { examinedBy, owingGoals, sqlTxn, type SqlPort } from './facts.ts'
import { HANDLER, PROTOCOL } from './schema.ts'

/** One request per read of the registry. `args` are the arguments of that read, in order. */
export type ReadRequest = Readonly<{ read: ReadName; args: readonly unknown[] }>
export type ReadName = keyof typeof READS

const READS = {
  latest: (port: SqlPort, session: string) => sqlTxn(port).latest(session),
  owing: owingGoals,
  examinedBy,
} as const

const requestSchema = z.strictObject({
  read: z.enum(Object.keys(READS) as [ReadName, ...ReadName[]]),
  args: z.array(z.unknown()),
})

export default {
  handler: HANDLER,
  protocol: PROTOCOL,
  read(input, port) {
    const request = requestSchema.safeParse(input)
    if (!request.success) return { kind: 'failed', diagnostic: 'invalid_goal_read' }
    const run = READS[request.data.read] as (port: SqlPort, ...args: unknown[]) => unknown
    return { kind: 'read', output: (run(port, ...request.data.args) ?? null) as JsonValue }
  },
} satisfies ReadHandlerModule
