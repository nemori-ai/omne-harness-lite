import type { LayerInput } from './evaluate.ts'
import type { AssetVersionSelection } from './holding.ts'
import type { CapabilityId } from './identity.ts'

export const ASSET_LAYERS = ['official', 'organization', 'tenant', 'workspace'] as const

export type AssetLayer = (typeof ASSET_LAYERS)[number]

export const MAX_ASSET_PAGE = 100

export type AssetEntry = Readonly<{
  capability: CapabilityId
  layer: AssetLayer
  asset: string
  version: string
  selection: AssetVersionSelection['kind']
  enabled: boolean
  /** The plugin that brought this definition; it has no holding of its own. */
  from?: string
}>

export type AssetPage = Readonly<{
  items: readonly AssetEntry[]
  next: string | null
  completeness: 'complete' | 'partial'
}>

export type AssetListRequest = Readonly<{
  category: string
  after: string | null
  limit: number
}>

export type AssetLayerListing =
  | Readonly<{ layer: AssetLayer; state: 'not-applicable' }>
  | Readonly<{ layer: AssetLayer; state: 'unavailable' }>
  | Readonly<{ layer: AssetLayer; state: 'read'; page: AssetPage }>

export type AssetListInvalid = Readonly<{ state: 'invalid' }>

export type AssetLayerSource = Readonly<{
  layer: AssetLayer
  list(request: AssetListRequest): Promise<AssetLayerListing | AssetListInvalid>
  candidates(capability: CapabilityId): Promise<LayerInput>
}>

export type AssetListing =
  | Readonly<{ state: 'read'; page: AssetPage }>
  | Readonly<{ state: 'unavailable'; layer: AssetLayer }>
  | AssetListInvalid

export type AssetLayerInput = LayerInput & Readonly<{ layer: AssetLayer }>

const INVALID: AssetListInvalid = Object.freeze({ state: 'invalid' })

export async function collectCandidates(
  sources: readonly AssetLayerSource[],
  capability: CapabilityId,
): Promise<readonly AssetLayerInput[]> {
  return Promise.all(
    inLayerOrder(sources).map(async (source): Promise<AssetLayerInput> => {
      const answer = await settled(() => source.candidates(capability))
      return answer === undefined
        ? { layer: source.layer, state: 'unavailable' }
        : { ...answer, layer: source.layer }
    }),
  )
}

export async function listAssets(
  sources: readonly AssetLayerSource[],
  request: AssetListRequest,
): Promise<AssetListing> {
  const { category, limit } = request
  if (!isPageLimit(limit)) return INVALID
  const layers = inLayerOrder(sources)
  const start = startOf(layers, request.after)
  if (start === undefined) return INVALID
  const gathered: Gathered = { items: [], completeness: 'complete' }
  for (const [index, source] of layers.slice(start.index).entries()) {
    if (gathered.items.length >= limit) return page(gathered, cursor(source.layer, null))
    const after = index === 0 ? start.after : null
    const answer = await settled(() =>
      source.list({ category, after, limit: limit - gathered.items.length }),
    )
    const stop = absorb(gathered, source.layer, answer)
    if (stop !== undefined) return stop
  }
  return page(gathered, null)
}

type Gathered = { items: AssetEntry[]; completeness: AssetPage['completeness'] }

function isPageLimit(limit: number): boolean {
  return Number.isInteger(limit) && limit >= 1 && limit <= MAX_ASSET_PAGE
}

function absorb(
  gathered: Gathered,
  layer: AssetLayer,
  answer: AssetLayerListing | AssetListInvalid | undefined,
): AssetListing | undefined {
  if (answer === undefined || answer.state === 'unavailable') return { state: 'unavailable', layer }
  if (answer.state === 'invalid') return INVALID
  if (answer.state === 'not-applicable') return undefined
  gathered.items.push(...answer.page.items)
  if (answer.page.completeness === 'partial') gathered.completeness = 'partial'
  return answer.page.next === null ? undefined : page(gathered, cursor(layer, answer.page.next))
}

function inLayerOrder(sources: readonly AssetLayerSource[]): readonly AssetLayerSource[] {
  const byLayer = new Map<AssetLayer, AssetLayerSource>()
  for (const source of sources) {
    if (byLayer.has(source.layer)) throw new TypeError(`two sources for the ${source.layer} layer`)
    byLayer.set(source.layer, source)
  }
  return ASSET_LAYERS.flatMap(layer => byLayer.get(layer) ?? [])
}

function settled<T>(ask: () => Promise<T>): Promise<T | undefined> {
  return Promise.resolve()
    .then(ask)
    .catch(() => undefined)
}

function page({ items, completeness }: Gathered, next: string | null): AssetListing {
  return { state: 'read', page: { items, next, completeness } }
}

function cursor(layer: AssetLayer, after: string | null): string {
  return JSON.stringify([layer, after])
}

function startOf(
  layers: readonly AssetLayerSource[],
  after: string | null,
): { readonly index: number; readonly after: string | null } | undefined {
  if (after === null) return { index: 0, after: null }
  const decoded = decodeCursor(after)
  if (decoded === undefined) return undefined
  const index = layers.findIndex(source => source.layer === decoded.layer)
  return index < 0 ? undefined : { index, after: decoded.after }
}

function decodeCursor(text: string): { layer: unknown; after: string | null } | undefined {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return undefined
  }
  if (!Array.isArray(value) || value.length !== 2) return undefined
  const [layer, after]: unknown[] = value
  return after === null || typeof after === 'string' ? { layer, after } : undefined
}
