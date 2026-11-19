import type { JsonValue } from '@omne-harness/sql-contract'
import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import { membershipsOf, sqlTxn, stateOf, type SqlPort } from './facts.ts'
import { HANDLER, PROTOCOL } from './schema.ts'

/** Each read of the repository port, by its name. Every one is for a tenant and returns only what that tenant is related to. */
const READS = {
  state: stateOf,
  memberships: membershipsOf,
  operation: (port: SqlPort, tenant: string, operation: string) =>
    sqlTxn(port).operation(tenant, operation),
} as const

export type ReadName = keyof typeof READS

function requestOf(input: JsonValue): { read: ReadName; args: string[] } | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null
  const { read, args } = input as { read?: JsonValue; args?: JsonValue }
  if (typeof read !== 'string' || !Object.hasOwn(READS, read)) return null
  if (!Array.isArray(args) || !args.every(arg => typeof arg === 'string')) return null
  return { read: read as ReadName, args: args as string[] }
}

export default {
  handler: HANDLER,
  protocol: PROTOCOL,
  read(input, port) {
    const request = requestOf(input)
    if (request === null) return { kind: 'failed', diagnostic: 'invalid_workspace_read' }
    const run = READS[request.read] as (port: SqlPort, ...args: string[]) => unknown
    return { kind: 'read', output: (run(port, ...request.args) ?? null) as JsonValue }
  },
} satisfies ReadHandlerModule
