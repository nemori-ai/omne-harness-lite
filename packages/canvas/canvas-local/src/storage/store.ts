import { randomUUID } from 'node:crypto'
import type { Arrangement, CanvasStore, StoreRead } from '@omne-harness/canvas'
import type { CanvasId, TenantId } from '@omne-harness/canvas-contract'
import type { JsonValue, SqlStorage } from '@omne-harness/sql-contract'
import type { ReadRequest } from './read.ts'
import { HANDLER, PROTOCOL } from './schema.ts'

/** Where one tenant's canvases are stored, and under which storage combination. */
export type TenantBinding = Readonly<{
  transactionDomain: string
  combinationVersion: string
  manifestDigest: string
}>

export type CanvasSqlOptions = Readonly<{
  storage: Pick<SqlStorage, 'read'>
  /** The binding of a tenant now. Null: the tenant has no storage domain to read from. */
  bind(tenant: TenantId): Promise<TenantBinding | null>
}>

/** The store over SQL. A read that cannot be made answers unavailable, never an empty canvas. */
export function createSqlCanvasStore(options: CanvasSqlOptions): CanvasStore {
  async function read(tenant: TenantId, request: ReadRequest): Promise<StoreRead<Arrangement>> {
    try {
      const binding = await options.bind(tenant)
      if (binding === null) return { kind: 'unavailable' }
      const requestKey = randomUUID()
      const result = await options.storage.read({
        domain: { scope: { kind: 'tenant', tenant }, transactionDomain: binding.transactionDomain },
        handler: HANDLER,
        protocol: PROTOCOL,
        requestKey,
        input: request as unknown as JsonValue,
      })
      if (result.kind !== 'read' || result.requestKey !== requestKey) return { kind: 'unavailable' }
      return { kind: 'read', value: result.output as unknown as Arrangement }
    } catch {
      return { kind: 'unavailable' }
    }
  }

  return {
    look: (tenant, canvas: CanvasId) => read(tenant, { read: 'look', tenant, canvas }),
  }
}
