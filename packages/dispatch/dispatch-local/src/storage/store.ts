import { randomUUID } from 'node:crypto'
import type { TenantId } from '@omne-harness/dispatch-contract'
import type { DispatchStore, StoreAnswer, StoreRead } from '@omne-harness/dispatch'
import type { JsonValue, SqlStorage } from '@omne-harness/sql-contract'
import type { ReadName } from './read.ts'
import { HANDLER, PARTICIPANT, PROTOCOL, type ScriptName } from './schema.ts'

/** Where one tenant's dispatches are stored, and under which storage combination. */
export type TenantBinding = Readonly<{
  transactionDomain: string
  combinationVersion: string
  manifestDigest: string
}>

export type DispatchSqlOptions = Readonly<{
  storage: SqlStorage
  /** The binding of a tenant now. Null: the tenant has no storage domain to write to. */
  bind(tenant: TenantId): Promise<TenantBinding | null>
}>

const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue

/** The registry over SQL. A commit is not recalled by the storage: each script is idempotent on the row it reads. */
export function createSqlDispatchStore(options: DispatchSqlOptions): DispatchStore {
  const scopeOf = (tenant: TenantId) => ({ kind: 'tenant', tenant }) as const

  async function commit<T>(
    tenant: TenantId,
    script: ScriptName,
    command: unknown,
  ): Promise<StoreAnswer<T>> {
    try {
      const binding = await options.bind(tenant)
      if (binding === null) return { kind: 'rolled-back' }
      const { transactionDomain, combinationVersion, manifestDigest } = binding
      const result = await options.storage.commit({
        identity: {
          scope: scopeOf(tenant),
          transactionDomain,
          operation: `dispatch.${script}`,
          protocolVersion: '2',
          operationKey: randomUUID(),
          recall: 'never',
        },
        combinationVersion,
        manifestDigest,
        commands: [{ participant: PARTICIPANT, facts: { script, command: json(command) } }],
      })
      if (result.kind === 'unknown') return { kind: 'unknown' }
      if (result.kind !== 'committed') return { kind: 'rolled-back' }
      return { kind: 'committed', value: result.responses[0].reply.response as T }
    } catch {
      return { kind: 'unknown' }
    }
  }

  async function read<T>(
    tenant: TenantId,
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
    accept: (tenant, command) => commit(tenant, 'accept', command),
    apply: (tenant, command) => commit(tenant, 'apply', command),
    recordDelivery: (tenant, command) => commit(tenant, 'recordDelivery', command),
    confirmStop: (tenant, command) => commit(tenant, 'confirmStop', command),
    dispatch: (tenant, id) => read(tenant, 'dispatch', id),
    ofSession: (tenant, session) => read(tenant, 'ofSession', session),
    openOf: (tenant, dispatcher) => read(tenant, 'openOf', dispatcher),
    list: (tenant, query) => read(tenant, 'list', query),
    unfinished: tenant => read(tenant, 'unfinished'),
  }
}
