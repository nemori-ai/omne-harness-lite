import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { CatalogKey, ConnectionKey, PeerAccount } from '@omne-harness/mcp-contract'

export function tenantTextOf(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new TypeError('the tenant did not come from legal-identity')
  return encoded.value
}

export function accountTextOf(account: PeerAccount): string {
  return account.kind === 'anonymous' ? 'anonymous' : `credential:${account.binding}`
}

export function catalogKeyTextOf(key: CatalogKey): string {
  return JSON.stringify([tenantTextOf(key.tenant), accountTextOf(key.account), key.holding])
}

export function connectionKeyTextOf(key: ConnectionKey): string {
  return JSON.stringify([
    tenantTextOf(key.tenant),
    key.holding,
    key.adoptionRevision,
    accountTextOf(key.account),
  ])
}
