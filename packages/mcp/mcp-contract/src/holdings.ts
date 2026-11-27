import type { TenantId } from '@omne-harness/legal-identity'
import type { Ack, Outcome } from '@omne-harness/operation-result'
import type { EndpointHolding } from './brands.ts'

/** A holding MCP keeps rows under, with the endpoints its OAuth grants are for. */
export type KeptHolding = Readonly<{ holding: EndpointHolding; grants: readonly string[] }>

/** The rows of a holding that is no longer held go in one commit: its catalogs, its tasks, its OAuth grant and the one waiting for its callback. */
export interface HoldingRows {
  kept(tenant: TenantId): Promise<Outcome<readonly KeptHolding[], 'unavailable'>>
  forget(tenant: TenantId, holding: EndpointHolding): Promise<Ack<'unavailable'>>
}
