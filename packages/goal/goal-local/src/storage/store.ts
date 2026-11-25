import { randomUUID } from 'node:crypto'
import type { GoalStore, StoreAnswer, StoreRead } from '@omne-harness/goal'
import type { JsonValue, SqlStorage } from '@omne-harness/sql-contract'
import type { ReadName } from './read.ts'
import { HANDLER, PARTICIPANT, PROTOCOL } from './schema.ts'

/** Where one tenant's goals are stored, and under which storage combination. */
export type TenantBinding = Readonly<{
  transactionDomain: string
  combinationVersion: string
  manifestDigest: string
}>

export type GoalSqlOptions = Readonly<{
  storage: SqlStorage
  /** The binding of a tenant now. Null: the tenant has no storage domain to write to. */
  bind(tenant: string): Promise<TenantBinding | null>
}>

const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue

/** The goals over SQL. A commit is not recalled by the storage: the write stands only on the version it names. */
export function createSqlGoalStore(options: GoalSqlOptions): GoalStore {
  const scopeOf = (tenant: string) => ({ kind: 'tenant', tenant }) as const

  async function commit<T>(tenant: string, command: unknown): Promise<StoreAnswer<T>> {
    try {
      const binding = await options.bind(tenant)
      if (binding === null) return { kind: 'rolled-back' }
      const { transactionDomain, combinationVersion, manifestDigest } = binding
      const result = await options.storage.commit({
        identity: {
          scope: scopeOf(tenant),
          transactionDomain,
          operation: 'goal.commit',
          protocolVersion: '2',
          operationKey: randomUUID(),
          recall: 'never',
        },
        combinationVersion,
        manifestDigest,
        commands: [
          { participant: PARTICIPANT, facts: { script: 'commit', command: json(command) } },
        ],
      })
      if (result.kind === 'unknown') return { kind: 'unknown' }
      if (result.kind !== 'committed') return { kind: 'rolled-back' }
      return { kind: 'committed', value: result.responses[0].reply.response as T }
    } catch {
      return { kind: 'unknown' }
    }
  }

  async function read<T>(
    tenant: string,
    name: ReadName,
    ...args: unknown[]
  ): Promise<StoreRead<T>> {
    try {
      const binding = await options.bind(tenant)
      if (binding === null) return { kind: 'unavailable' }
      const requestKey = randomUUID()
      const result = await options.storage.read({
        domain: { scope: scopeOf(tenant), transactionDomain: binding.transactionDomain },
        handler: HANDLER,
        protocol: PROTOCOL,
        requestKey,
        input: json({ read: name, args }),
      })
      if (result.kind !== 'read' || result.requestKey !== requestKey) return { kind: 'unavailable' }
      return { kind: 'read', value: result.output as T }
    } catch {
      return { kind: 'unavailable' }
    }
  }

  return {
    commit: (tenant, command) => commit(tenant, command),
    latest: (tenant, session) => read(tenant, 'latest', session),
    owing: tenant => read(tenant, 'owing'),
  }
}
