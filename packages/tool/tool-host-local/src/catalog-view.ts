import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  Access,
  DurableEvidence,
  Reply,
  ToolDefinition,
  ToolFailure,
} from '@omne-harness/tool-contract'
import {
  judgeToolDefinition,
  sameBindingKey,
  type ToolBindingKey,
} from '@omne-harness/tool-contract/provider'
import type { ToolListing } from './bindings.ts'
import { catalogDigest } from './catalog-ranking.ts'

export type LocalToolCatalogView = Readonly<{
  scope: DurableEvidence
  revision: string
  entries: readonly Readonly<{
    key: ToolBindingKey
    resident: boolean
    /** Last lawful plain definition supplied by the current adoption owner, without a live binding. */
    knownDefinition?: ToolDefinition
  }>[]
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
    const entries: LocalToolCatalogView['entries'][number][] = []
    for (const entry of result.ok.entries) {
      const key: ToolBindingKey = Object.freeze({
        layer: Object.freeze({ ...entry.key.layer }),
        asset: Object.freeze({
          name: entry.key.asset.name,
          adoption: Object.freeze({ ...entry.key.asset.adoption }),
        }),
      })
      if (entry.knownDefinition === undefined) {
        entries.push(Object.freeze({ key, resident: entry.resident }))
        continue
      }
      const definition = judgeToolDefinition(entry.knownDefinition)
      if ('failure' in definition) return fail({ kind: 'invalid', ...definition.failure })
      if (
        !sameBindingKey(key, {
          layer: key.layer,
          asset: { name: definition.ok.name, adoption: definition.ok.adoption },
        })
      )
        return fail({
          kind: 'invalid',
          field: 'knownDefinition',
          reason: 'definition-key-mismatch',
        })
      entries.push(Object.freeze({ key, resident: entry.resident, knownDefinition: definition.ok }))
    }
    const view: LocalToolCatalogView = Object.freeze({
      scope: Object.freeze({ ...result.ok.scope }),
      revision: result.ok.revision,
      entries: Object.freeze(entries),
    })
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
