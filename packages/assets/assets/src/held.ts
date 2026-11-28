import type { Candidate } from './evaluate.ts'
import type { CapabilityId } from './identity.ts'
import type { AssetLayer, AssetLayerInput, AssetLayerSource } from './layers.ts'

/** One held definition as an item on the point of its category: the candidate an evaluation weighs. */
export type HeldItem = Readonly<{
  asset: string
  version: string
  disabled: boolean
  immutable: boolean
  replaceLocked: boolean
  within?: string
  valueAt?: string
  from?: string
}>

export type HeldScope = readonly string[]

export type HeldHolding = Readonly<{ category: string; name: string; item: HeldItem }>

/** Where a store tells all a tenant holds: after each commit that changed something, before the commit is answered. */
export type HeldPort = Readonly<{
  sync(holdings: readonly HeldHolding[]): void
  missed(reason: 'unread' | 'failed'): void
}>

export type HeldPoint = Readonly<{
  name: string
  tree: 'server'
  arity: 'keyed-one'
  keyFrom: null
  key: string
  gives: string
  item: Readonly<{
    kind: 'data'
    fields: Readonly<
      Record<Exclude<keyof HeldItem, 'within' | 'valueAt' | 'from'>, 'string' | 'boolean'>
    >
  }>
  resolve: 'most-specific'
  binding: 'run'
  onError: string
  version: number
  revision: number
  keys: 'private' | 'public'
  conformance: null
  summary: string
}>

/** The rules of the point of one category. Most specific is how a tree shows it; an evaluation takes every layer. */
export function heldPoint(
  rules: Readonly<{ name: string; key: string; summary: string; keys?: 'public' }>,
): HeldPoint {
  return Object.freeze({
    name: rules.name,
    tree: 'server',
    arity: 'keyed-one',
    keyFrom: null,
    key: rules.key,
    gives: 'one held definition: the asset, its version, whether it is disabled, and its two locks',
    item: Object.freeze({
      kind: 'data',
      fields: Object.freeze({
        asset: 'string',
        version: 'string',
        disabled: 'boolean',
        immutable: 'boolean',
        replaceLocked: 'boolean',
      }),
    }),
    resolve: 'most-specific',
    binding: 'run',
    onError: 'nothing is called: the item is data',
    version: 1,
    revision: 1,
    keys: rules.keys ?? 'private',
    conformance: null,
    summary: rules.summary,
  })
}

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
  left.replaceLocked === right.replaceLocked &&
  left.within === right.within &&
  left.valueAt === right.valueAt

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

/** One layer of one tenant as a source: candidates from a reading of the held entries, listing from where it is given. */
export function heldLayerSource(
  input: Readonly<{
    layer: HeldLayer
    tenant: string
    read(capability: CapabilityId): HeldReading | Promise<HeldReading>
    list: AssetLayerSource['list']
  }>,
): AssetLayerSource {
  const { layer, tenant } = input
  return Object.freeze({
    layer,
    list: input.list,
    async candidates(capability: CapabilityId) {
      const layers = layerInputsOf(await input.read(capability), tenant)
      return layers.find(each => each.layer === layer) ?? { layer, state: 'unavailable' }
    },
  })
}

export type HeldBook = HeldPort & Readonly<{ read(capability: CapabilityId): HeldReading }>

/** What one tenant holds, kept in memory as its store tells it: for a use of the assets without a registry. */
export function createHeldBook(tenant: string): HeldBook {
  const scope = scopeOfLayer('tenant', tenant)
  let held: readonly HeldHolding[] | undefined
  return Object.freeze({
    sync(holdings: readonly HeldHolding[]) {
      held = holdings
    },
    missed() {
      held = undefined
    },
    read({ category, name }: CapabilityId): HeldReading {
      if (held === undefined) return { kind: 'unavailable' }
      const mine = held.filter(each => each.category === category && each.name === name)
      return { kind: 'read', entries: mine.map(({ item }) => ({ scope, item })) }
    },
  })
}
