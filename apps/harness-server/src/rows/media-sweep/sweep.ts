import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { Media } from '@omne-harness/media-contract'
import type { TenantDomainListing } from '@omne-harness/sql-contract'

export type MediaSweepPorts = Readonly<{
  /** The custody now; undefined while media is not loaded. */
  custody(): Pick<Media['custody'], 'sweep'> | undefined
  listing(): Promise<TenantDomainListing>
  limit: number
  warn(message: string): void
}>

export type SweepBeat = Readonly<{ tenants: number; removed: number; failed: number }>

/** One beat: every tenant that has a storage domain is swept once, up to the limit, one after another. */
export async function sweepEveryTenant(ports: MediaSweepPorts): Promise<SweepBeat> {
  const custody = ports.custody()
  const listing = custody === undefined ? null : await ports.listing().catch(() => null)
  if (custody === undefined || listing === null || listing.kind !== 'ready')
    return { tenants: 0, removed: 0, failed: 0 }
  const tenants = listing.entries.flatMap(({ tenant, domain }): TenantId[] => {
    const parsed = tenantCodec.parse(tenant)
    return domain.scope.kind === 'tenant' && parsed.ok ? [parsed.value] : []
  })
  let removed = 0
  let failed = 0
  for (const tenant of tenants) {
    const swept = await custody.sweep({ tenant, limit: ports.limit }).catch(() => null)
    if (swept !== null && 'ok' in swept) removed += swept.ok.removed
    else failed += 1
  }
  if (failed > 0) ports.warn(`the media sweep failed for ${failed} of ${tenants.length} tenants`)
  return { tenants: tenants.length, removed, failed }
}
