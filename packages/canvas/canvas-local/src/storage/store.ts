import { randomUUID } from 'node:crypto'
import type { CanvasStore, StoreAnswer, StoreRead } from '@omne-harness/canvas'
import type { TenantId } from '@omne-harness/canvas-contract'
import type { JsonValue, SqlStorage } from '@omne-harness/sql-contract'
import type { ReadRequest } from './read.ts'
import { HANDLER, PARTICIPANT, PROTOCOL, type ScriptName } from './schema.ts'

/** Where one tenant's canvases are stored, and under which storage combination. */
export type TenantBinding = Readonly<{
  transactionDomain: string
  combinationVersion: string
  manifestDigest: string
}>

export type CanvasSqlOptions = Readonly<{
  storage: Pick<SqlStorage, 'read' | 'commit'>
  /** The binding of a tenant now. Null: the tenant has no storage domain to read from or write to. */
  bind(tenant: TenantId): Promise<TenantBinding | null>
}>

const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue
const scopeOf = (tenant: TenantId) => ({ kind: 'tenant', tenant }) as const

/** The store over SQL. A read that cannot be made answers unavailable, never an empty canvas. A commit
 * is not recalled by the storage: each script answers no change when its state is already there. */
export function createSqlCanvasStore(options: CanvasSqlOptions): CanvasStore {
  async function read<T>(tenant: TenantId, request: ReadRequest): Promise<StoreRead<T>> {
    try {
      const binding = await options.bind(tenant)
      if (binding === null) return { kind: 'unavailable' }
      const requestKey = randomUUID()
      const result = await options.storage.read({
        domain: { scope: scopeOf(tenant), transactionDomain: binding.transactionDomain },
        handler: HANDLER,
        protocol: PROTOCOL,
        requestKey,
        input: json(request),
      })
      if (result.kind !== 'read' || result.requestKey !== requestKey) return { kind: 'unavailable' }
      return { kind: 'read', value: result.output as T }
    } catch {
      return { kind: 'unavailable' }
    }
  }

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
          operation: `canvas.${script}`,
          protocolVersion: '2',
          operationKey: randomUUID(),
          recall: 'never',
        },
        combinationVersion,
        manifestDigest,
        commands: [{ participant: PARTICIPANT, facts: { script, tenant, command: json(command) } }],
      })
      if (result.kind === 'unknown') return { kind: 'unknown' }
      if (result.kind !== 'committed') return { kind: 'rolled-back' }
      return { kind: 'committed', value: result.responses[0].reply.response as T }
    } catch {
      return { kind: 'unknown' }
    }
  }

  return {
    look: (tenant, canvas) => read(tenant, { read: 'look', tenant, canvas }),
    away: (tenant, canvas, page) =>
      read(tenant, {
        read: 'away',
        tenant,
        canvas,
        limit: page.limit,
        ...(page.before === undefined ? {} : { before: page.before }),
      }),
    placing: (tenant, canvas, reference) =>
      read(tenant, { read: 'placing', tenant, canvas, reference }),
    place: (tenant, command) => commit(tenant, 'place', command),
    arrange: (tenant, command) => commit(tenant, 'arrange', command),
    take: (tenant, command) => commit(tenant, 'take', command),
    pile: (tenant, command) => commit(tenant, 'pile', command),
    scatter: (tenant, command) => commit(tenant, 'scatter', command),
    lock: (tenant, command) => commit(tenant, 'lock', command),
  }
}
