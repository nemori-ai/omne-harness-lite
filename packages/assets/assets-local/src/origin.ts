import type { AssetOrigin } from '@omne-harness/assets'
import type { Holding } from './schema.ts'

/** The owner of the source a tenant publication gives its holding. */
export const TENANT_PUBLISHING_OWNER = 'assets.tenant-publishing'

/** Where a holding came from: a tenant publication, or the deployment that installed it. */
export function originOf(holding: Pick<Holding, 'sourceLayout'>): AssetOrigin {
  return holding.sourceLayout.some(source => source.ownerRef === TENANT_PUBLISHING_OWNER)
    ? 'customized'
    : 'official'
}
