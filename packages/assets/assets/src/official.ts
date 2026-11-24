import type { CategoryView } from './category-point.ts'
import type { CapabilityId, JsonValue } from './identity.ts'
import { admitSummary } from './summary.ts'
import type { AssetRow } from './management.ts'

/** An official asset on the point of its category, with the body the one who brought it gave. */
export type OfficialAsset = Readonly<{
  capability: CapabilityId
  asset: string
  version: string
  body: JsonValue
}>

/** Every official asset there is now; unavailable when the points cannot be read, never an empty list instead. */
export type OfficialAssets = () => readonly OfficialAsset[] | 'unavailable'

type Contracts = Pick<CategoryView, 'lookup'>

export function readOfficial(official: OfficialAssets): readonly OfficialAsset[] | undefined {
  try {
    const read = official()
    return read === 'unavailable' ? undefined : read
  } catch {
    return undefined
  }
}

export const sameCapability = (left: CapabilityId, right: CapabilityId): boolean =>
  left.category === right.category && left.name === right.name

const contextOf = (asset: OfficialAsset) => ({
  capabilityName: asset.capability.name,
  definition: asset.version,
})

/** An official asset as a row of its category: every tenant holds it, pinned, and it cannot be disabled. */
export function officialRow(contracts: Contracts, asset: OfficialAsset): AssetRow {
  const contract = contracts.lookup(asset.capability.category)
  let summary: AssetRow['summary'] = null
  try {
    summary = admitSummary(contract?.summarize?.(asset.body, contextOf(asset)))
  } catch {
    summary = null
  }
  return {
    capability: asset.capability,
    layer: 'official',
    asset: asset.asset,
    version: asset.version,
    selection: 'pinned',
    enabled: true,
    holding: asset.asset,
    origin: 'official',
    summary,
  }
}

export function officialSettings(contracts: Contracts, asset: OfficialAsset): boolean {
  const contract = contracts.lookup(asset.capability.category)
  try {
    return (contract?.settings?.(asset.body, contextOf(asset)) ?? null) !== null
  } catch {
    return false
  }
}

/** Where a page starts: the official part after a name, or the tenant layer after its own cursor. */
export type ListCursor = Readonly<{ part: 'official' | 'tenant'; after: string | null }>

const OFFICIAL = 'o:'
const TENANT = 't:'

export function readListCursor(after: string | null): ListCursor | undefined {
  if (after === null) return { part: 'official', after: null }
  const rest = after.slice(2)
  if (after.startsWith(OFFICIAL) && rest !== '') return { part: 'official', after: rest }
  if (after.startsWith(TENANT)) return { part: 'tenant', after: rest === '' ? null : rest }
  return undefined
}

export const officialCursor = (name: string): string => `${OFFICIAL}${name}`
export const tenantCursor = (after: string | null): string => `${TENANT}${after ?? ''}`

const byName = (left: OfficialAsset, right: OfficialAsset): number =>
  left.capability.name === right.capability.name
    ? 0
    : left.capability.name < right.capability.name
      ? -1
      : 1

export function officialOf(
  all: readonly OfficialAsset[],
  category: string,
  after: string | null,
): readonly OfficialAsset[] {
  return all
    .filter(
      asset =>
        asset.capability.category === category && (after === null || asset.capability.name > after),
    )
    .sort(byName)
}
