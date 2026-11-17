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
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_ASSET_PAGE) return INVALID
  const layers = inLayerOrder(sources)
  const start = startOf(layers, request.after)
  if (start === undefined) return INVALID
  const items: AssetEntry[] = []
  let completeness: AssetPage['completeness'] = 'complete'
  for (const [index, source] of layers.entries()) {
    if (index < start.index) continue
    if (items.length >= limit) return page(items, cursor(source.layer, null), completeness)
    const after = index === start.index ? start.after : null
    const answer = await settled(() =>
      source.list({ category, after, limit: limit - items.length }),
    )
    if (answer === undefined || answer.state === 'unavailable')
      return { state: 'unavailable', layer: source.layer }
    if (answer.state === 'invalid') return INVALID
    if (answer.state === 'not-applicable') continue
    items.push(...answer.page.items)
    if (answer.page.completeness === 'partial') completeness = 'partial'
    if (answer.page.next !== null)
      return page(items, cursor(source.layer, answer.page.next), completeness)
  }
  return page(items, null, completeness)
}

function inLayerOrder(sources: readonly AssetLayerSource[]): readonly AssetLayerSource[] {
  const byLayer = new Map<AssetLayer, AssetLayerSource>()
  for (const source of sources) {
    if (byLayer.has(source.layer)) throw new TypeError(`two sources for the ${source.layer} layer`)
    byLayer.set(source.layer, source)
  }
  return ASSET_LAYERS.flatMap(layer => byLayer.get(layer) ?? [])
}

async function settled<T>(ask: () => Promise<T>): Promise<T | undefined> {
  try {
    return await ask()
  } catch {
    return undefined
  }
}

function page(
  items: readonly AssetEntry[],
  next: string | null,
  completeness: AssetPage['completeness'],
): AssetListing {
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

function decodeCursor(text: string): { layer: string; after: string | null } | undefined {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return undefined
  }
  if (!Array.isArray(value) || value.length !== 2) return undefined
  const [layer, after]: unknown[] = value
  return typeof layer === 'string' && (after === null || typeof after === 'string')
    ? { layer, after }
    : undefined
}
