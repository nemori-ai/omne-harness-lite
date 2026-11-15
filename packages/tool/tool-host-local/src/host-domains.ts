import type { LedgerDomain } from '@omne-harness/tool'
import type { ToolCallId } from '@omne-harness/tool-contract'

type TenantId = LedgerDomain['tenant']

export type HostAggregate = 'start' | 'source' | 'delivery' | 'environment' | 'control'

export function callHostDomain(
  tenant: TenantId,
  aggregate: HostAggregate,
  call: ToolCallId,
): LedgerDomain {
  return { kind: 'host', tenant, key: `${aggregate}@${call}` }
}

export const START_GUARDS_DOMAIN_KEY = 'start-guards'

export function tenantHostDomain(
  tenant: TenantId,
  key: typeof START_GUARDS_DOMAIN_KEY,
): LedgerDomain {
  return { kind: 'host', tenant, key }
}

export function retentionHostDomain(tenant: TenantId, scopeDigest: string): LedgerDomain {
  return { kind: 'host', tenant, key: `retention@${scopeDigest}` }
}
