// The placement of the host's durable facts in the `host` domains of the ledger store (architecture
// principle 6, per-call placement). Every fact of one call lives in a domain of that call, so the
// size of a domain and the cost of one call never depend on how many calls the tenant has settled.
// Only state that spans calls is tenant-level: the start guards and the environment retention
// scopes. This module is the one place that builds host domain names.
import type { LedgerDomain } from '@omne-harness/tool'
import type { ToolCallId } from '@omne-harness/tool-contract'

type TenantId = LedgerDomain['tenant']

/** The per-call aggregates of the host, each one host domain per call. */
export type HostAggregate = 'start' | 'source' | 'delivery' | 'environment' | 'control'

/** The host domain of `aggregate` for one call: `<aggregate>@<call>`. */
export function callHostDomain(
  tenant: TenantId,
  aggregate: HostAggregate,
  call: ToolCallId,
): LedgerDomain {
  return { kind: 'host', tenant, key: `${aggregate}@${call}` }
}

/** The tenant-level domain of the start guards and their invalidations. */
export const START_GUARDS_DOMAIN_KEY = 'start-guards'

/** The tenant-level domain of the environment retention scopes. */
export const ENVIRONMENT_RETENTION_DOMAIN_KEY = 'environment-retention'

/** A tenant-level host domain: state that spans calls and does not grow with them. */
export function tenantHostDomain(
  tenant: TenantId,
  key: typeof START_GUARDS_DOMAIN_KEY | typeof ENVIRONMENT_RETENTION_DOMAIN_KEY,
): LedgerDomain {
  return { kind: 'host', tenant, key }
}
