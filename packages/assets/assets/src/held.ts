import type { Candidate } from './evaluate.ts'
import type { AssetLayer, AssetLayerInput } from './layers.ts'

/** One held definition as an item on the point of its category: the candidate an evaluation weighs. */
export type HeldItem = Readonly<{
  asset: string
  version: string
  disabled: boolean
  immutable: boolean
  replaceLocked: boolean
}>

export type HeldScope = readonly string[]

export type HeldLayer = Extract<AssetLayer, 'official' | 'tenant'>

export type HeldEntry = Readonly<{ scope: HeldScope; item: HeldItem }>

export type HeldReading =
  | Readonly<{ kind: 'read'; entries: readonly HeldEntry[] }>
  | Readonly<{ kind: 'unavailable' }>

const OFFICIAL: HeldScope = Object.freeze([])
const TENANT = 'tenant'
const HELD_LAYERS: readonly HeldLayer[] = ['official', 'tenant']

export function scopeOfLayer(layer: 'official'): HeldScope
export function scopeOfLayer(layer: 'tenant', tenant: string): HeldScope
export function scopeOfLayer(layer: HeldLayer, tenant?: string): HeldScope {
  if (layer === 'official') return OFFICIAL
  if (tenant === undefined || tenant === '')
    throw new TypeError('the scope of the tenant layer needs a tenant')
  return Object.freeze([TENANT, tenant])
}

export function layerOfScope(scope: HeldScope): HeldLayer | null {
  if (scope.length === 0) return 'official'
  return scope.length === 2 && scope[0] === TENANT && scope[1] !== '' ? 'tenant' : null
}

const same = (left: Candidate, right: Candidate): boolean =>
  left.asset === right.asset &&
  left.version === right.version &&
  left.disabled === right.disabled &&
  left.immutable === right.immutable &&
  left.replaceLocked === right.replaceLocked

/** The entries one tenant sees on a point, as the layers of an evaluation. Another tenant's entries join no layer. */
export function layerInputsOf(reading: HeldReading, tenant: string): readonly AssetLayerInput[] {
  if (reading.kind !== 'read') return HELD_LAYERS.map(layer => ({ layer, state: 'unavailable' }))
  const held: Record<HeldLayer, Candidate[]> = { official: [], tenant: [] }
  for (const { scope, item } of reading.entries) {
    const layer = layerOfScope(scope)
    if (layer === null || (layer === 'tenant' && scope[1] !== tenant)) continue
    if (!held[layer].some(known => same(known, item))) held[layer].push(item)
  }
  return HELD_LAYERS.map(layer => ({ layer, state: 'read', candidates: held[layer] }))
}
