import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { Access, DurableEvidence, Reply, ToolFailure } from '@omne-harness/tool-contract'
import { sameBindingKey, type ToolBindingKey } from '@omne-harness/tool-contract/provider'
import type { ToolListing } from './bindings.ts'
import { catalogDigest } from './catalog-ranking.ts'

export type LocalToolCatalogView = Readonly<{
  scope: DurableEvidence
  revision: string
  entries: readonly Readonly<{ key: ToolBindingKey; resident: boolean }>[]
}>

/** The assembly supplies current, exact-version inclusion and disclosure evidence. */
export interface LocalToolCatalogViewSource<P> {
  read(access: Access<P>): Reply<LocalToolCatalogView>
}

export async function readCatalogView<P>(
  source: LocalToolCatalogViewSource<P> | null,
  access: Access<P>,
): Promise<Outcome<Readonly<{ view: LocalToolCatalogView; digest: string }>, ToolFailure>> {
  if (source === null)
    return fail({
      kind: 'unavailable',
      dependency: 'toolCatalogView',
      diagnostic: 'catalog view source is absent',
    } as const)
  try {
    const result = await source.read(access)
    if ('failure' in result) return result
    // Capture both projection and comparison before any availability judgment can suspend.
    const view: LocalToolCatalogView = {
      scope: { ...result.ok.scope },
      revision: result.ok.revision,
      entries: result.ok.entries.map(entry => ({
        key: {
          layer: { ...entry.key.layer },
          asset: { name: entry.key.asset.name, adoption: { ...entry.key.asset.adoption } },
        },
        resident: entry.resident,
      })),
    }
    return succeed({ view, digest: catalogDigest(view) })
  } catch {
    return fail({
      kind: 'unavailable',
      dependency: 'toolCatalogView',
      diagnostic: 'catalog view source failed',
    } as const)
  }
}

export function visibleCatalogListings(
  listings: readonly ToolListing[],
  view: LocalToolCatalogView,
): Readonly<{ listing: ToolListing; resident: boolean }>[] {
  return listings.flatMap(listing => {
    if (listing.entry.state !== 'live') return []
    const entry = view.entries.find(candidate => sameBindingKey(candidate.key, listing.entry.key))
    return entry === undefined ? [] : [{ listing, resident: entry.resident }]
  })
}
