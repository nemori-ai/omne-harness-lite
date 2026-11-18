import { randomUUID } from 'node:crypto'
import type { TenantId } from '@omne-harness/notification-contract'
import type { NotificationStore, StoreAnswer, StoreRead } from '@omne-harness/notification'
import type { JsonValue, SqlStorage } from '@omne-harness/sql-contract'
import type { ReadName } from './read.ts'
import { HANDLER, PARTICIPANT, PROTOCOL, type ScriptName } from './schema.ts'

/** Where one tenant's notifications are stored, and under which storage combination. */
export type TenantBinding = Readonly<{
  transactionDomain: string
  combinationVersion: string
  manifestDigest: string
}>

export type NotificationSqlOptions = Readonly<{
  storage: SqlStorage
  /** The binding of a tenant now. Null: the tenant has no storage domain to write to. */
  bind(tenant: TenantId): Promise<TenantBinding | null>
}>

const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue

/** The repository over SQL. A commit is not recalled by the storage: each script is idempotent on the facts it reads. */
export function createSqlNotificationStore(options: NotificationSqlOptions): NotificationStore {
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
          operation: `notification.${script}`,
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
    mark: (tenant, command) => commit(tenant, 'mark', command),
    subscribe: (tenant, command) => commit(tenant, 'subscribe', command),
    setBeat: (tenant, command) => commit(tenant, 'setBeat', command),
    destination: (tenant, command) => commit(tenant, 'destination', command),
    formStrong: (tenant, command) => commit(tenant, 'formStrong', command),
    formBeat: (tenant, command) => commit(tenant, 'formBeat', command),
    remind: (tenant, command) => commit(tenant, 'remind', command),
    recordDelivery: (tenant, command) => commit(tenant, 'recordDelivery', command),
    send: (tenant, identity) => read(tenant, 'send', identity),
    box: (tenant, query) => read(tenant, 'box', query),
    notification: (tenant, ref) => read(tenant, 'notification', ref),
    subscription: (tenant, key) => read(tenant, 'subscription', key),
    subscriptions: (tenant, recipient) => read(tenant, 'subscriptions', recipient),
    beat: (tenant, recipient) => read(tenant, 'beat', recipient),
    destinations: (tenant, recipient) => read(tenant, 'destinations', recipient),
    delivery: (tenant, now) => read(tenant, 'delivery', now),
    pendingStrong: (tenant, ref) => read(tenant, 'pendingStrong', ref),
    unresolved: (tenant, recipient) => read(tenant, 'unresolved', recipient),
    subscriptionsFor: (tenant, source, type) => read(tenant, 'subscriptionsFor', source, type),
    reminded: (tenant, recipient) => read(tenant, 'reminded', recipient),
  }
}
