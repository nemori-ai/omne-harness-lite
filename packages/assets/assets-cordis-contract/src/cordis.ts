import { Service, type Context, type Plugin } from '@deepseek-ai/cordis'
import {
  admitCategory,
  capabilityId,
  categoryViewOf,
  scopeOfLayer,
  type JsonValue,
  type OfficialAsset,
  type PackageReader,
  type CategoryContribution,
  type HeldHolding,
  type HeldItem,
  type HeldPoint,
  type HeldReading,
  type CategoryReading,
  type CategoryView,
  type TenantManagement,
  type TenantPublishing,
  type TenantPublishOutcome,
  type TenantPublishRequest,
} from '@omne-harness/assets'
import {
  candidates,
  declare,
  deployment,
  type Contract,
  type Entry,
  type Instance,
  type Registry,
} from '@omne-harness/dynamis'
import { dynamisKey, type DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import type {
  IndependentSettingsPoint,
  IndependentSettingsView,
  SettingDefinitions,
} from '@omne-harness/settings'
import {
  ASSET_CATEGORIES_POINT,
  assetCategoriesKey,
  assetChangesKey,
  assetManagementKey,
  assetPublishingKey,
  createHeldSync,
  heldEntry,
  independentSettingsKey,
} from './index.ts'

const categoriesContract: Contract = Object.freeze({
  name: ASSET_CATEGORIES_POINT,
  tree: 'server',
  arity: 'keyed-one',
  keyFrom: null,
  key: 'the category name',
  gives: 'the contribution of one category: its body contract, how it is shown, and its point',
  item: Object.freeze({
    kind: 'pure',
    fields: Object.freeze({
      category: 'string',
      point: 'string',
      contract: 'object',
      display: 'object',
    }),
  }),
  resolve: 'conflict',
  binding: 'run',
  onError: 'a category with two contributions gives no contract, and neither is called',
  version: 1,
  revision: 1,
  keys: 'public',
  conformance: null,
  summary: 'The asset categories now registered: each item is the contribution of one category.',
})

const UNREAD: HeldReading = Object.freeze({ kind: 'unavailable' })

type Brought = Readonly<{
  point: string
  name: string
  item: HeldItem
  body: JsonValue
  files?: PackageReader
}>

export type BroughtDefinition = Readonly<{
  name: string
  item: HeldItem
  body: JsonValue
  files?: PackageReader
}>

const broughtAs = (brought: Brought, point: string, name: string, item: HeldItem): boolean =>
  brought.point === point &&
  brought.name === name &&
  brought.item.asset === item.asset &&
  brought.item.version === item.version

type Contributed = CategoryContribution & Readonly<{ category: string }>

function contributed(contribution: CategoryContribution, by: Instance): Entry<Contributed> {
  const category = contribution.contract.category
  return {
    point: ASSET_CATEGORIES_POINT,
    key: category,
    id: '',
    scope: deployment,
    rank: 0,
    digest: `${category}@${by.fiber}#${by.generation}`,
    item: Object.freeze({ ...contribution, category }),
  }
}

function readingOf(registry: Registry): CategoryReading {
  const read = candidates<Contributed>(registry, ASSET_CATEGORIES_POINT, null, deployment)
  if (read.kind !== 'read') return { kind: 'unavailable', detail: read.detail }
  return { kind: 'read', contributions: read.entries.map(entry => entry.item) }
}

/** @owner packages/assets/assets-cordis-contract */
export class AssetCategoriesService extends Service {
  static readonly provide = assetCategoriesKey
  readonly view: CategoryView
  /** What one tenant sees under one name on the point of a category; unavailable when the category gives no point. */
  readonly held: (
    capability: Readonly<{ category: string; name: string }>,
    tenant: string,
  ) => HeldReading
  protected readonly tree: DynamisService
  protected readonly brought = new Set<Brought>()
  constructor(ctx: Context) {
    super(ctx, AssetCategoriesService.provide)
    const tree = ctx.get(dynamisKey) as DynamisService
    tree.put([declare(categoriesContract)])
    this.tree = tree
    const view = categoryViewOf(() => readingOf(tree.registry()))
    this.view = view
    this.held = ({ category, name }, tenant) => {
      const listing = view.describe(category)
      if (listing === undefined || !('point' in listing)) return UNREAD
      const asker = scopeOfLayer('tenant', tenant)
      const read = candidates<HeldItem>(tree.registry(), listing.point, name, asker)
      return read.kind === 'read' ? { kind: 'read', entries: read.entries } : UNREAD
    }
  }

  /** A category and its point go on the tree together, put as the one who contributes, for as long as its scope lives. */
  contribute(category: Omit<CategoryContribution, 'point'>, point: HeldPoint): void {
    const admitted = admitCategory({ ...category, point: point.name })
    // Read from `this`, not captured: Cordis gives the caller its own view, so the items are put as the caller.
    const { tree } = this
    this.ctx.effect(
      () => tree.put(by => [contributed(admitted, by), declare(point)]),
      'assetCategories.contribute',
    )
  }

  /** Keeps what one tenant holds on the points of the categories, at the scope of that tenant, put as the caller. */
  holdingsOf(
    tenant: string,
    skipped: (holding: HeldHolding) => void,
  ): (holdings: readonly HeldHolding[]) => void {
    const { tree, view } = this
    return createHeldSync({
      put: entry => tree.put([entry]),
      pointOf(category) {
        const listing = view.describe(category)
        return listing !== undefined && 'point' in listing ? listing.point : undefined
      },
      scope: scopeOfLayer('tenant', tenant),
      skipped,
    })
  }

  /** The definitions the deployment brings, on the point of their category, with their bodies. */
  bring(point: string, held: readonly BroughtDefinition[]): void {
    const { tree, brought } = this
    const scope = scopeOfLayer('official')
    const entries = held.map(({ name, item }) => heldEntry(point, name, scope, item))
    const kept: Brought[] = held.map(each => ({ point, ...each }))
    this.ctx.effect(() => {
      for (const each of kept) brought.add(each)
      const remove = tree.put(entries)
      return () => {
        remove()
        for (const each of kept) brought.delete(each)
      }
    }, 'assetCategories.bring')
  }

  official(): readonly OfficialAsset[] | 'unavailable' {
    const registry = this.tree.registry()
    const found: OfficialAsset[] = []
    for (const { category, point } of this.view.list()) {
      const read = candidates<HeldItem>(registry, point, null, scopeOfLayer('official'))
      if (read.kind !== 'read') return 'unavailable'
      const entries = [...read.entries].sort((left, right) => (left.key < right.key ? -1 : 1))
      for (const { key, item } of entries) {
        const hit = [...this.brought].find(each => broughtAs(each, point, key, item))
        const capability = capabilityId(category, key)
        if (hit === undefined || !capability.ok) continue
        const known = found.some(
          each => each.capability.name === key && each.capability.category === category,
        )
        if (known) continue
        const { body, files } = hit
        const at = { capability: capability.id, asset: item.asset, version: item.version, body }
        found.push(files === undefined ? at : { ...at, files })
      }
    }
    return found
  }
}

/** @owner packages/assets/assets-cordis-contract */
export class AssetPublishingService extends Service implements TenantPublishing<unknown> {
  static readonly provide = assetPublishingKey
  private readonly publishing: TenantPublishing<unknown>
  constructor(ctx: Context, publishing: TenantPublishing<unknown>) {
    super(ctx, AssetPublishingService.provide)
    this.publishing = publishing
  }

  publish(request: TenantPublishRequest<unknown>): Promise<TenantPublishOutcome> {
    return this.publishing.publish(request)
  }
}

/** @owner packages/assets/assets-cordis-contract */
export class AssetManagementService extends Service {
  static readonly provide = assetManagementKey
  readonly management: TenantManagement<unknown>
  constructor(ctx: Context, management: TenantManagement<unknown>) {
    super(ctx, AssetManagementService.provide)
    this.management = management
  }
}

export type AssetChangeListener = Readonly<{ changed(): void; closed(): void }>
export type AssetChanges = Readonly<{
  subscribe(tenant: string, listener: AssetChangeListener): () => void
}>

/** @owner packages/assets/assets-cordis-contract */
export class AssetChangesService extends Service implements AssetChanges {
  static readonly provide = assetChangesKey
  private readonly changes: AssetChanges
  constructor(ctx: Context, changes: AssetChanges) {
    super(ctx, AssetChangesService.provide)
    this.changes = changes
  }

  subscribe(tenant: string, listener: AssetChangeListener): () => void {
    return this.changes.subscribe(tenant, listener)
  }
}

/** @owner packages/assets/assets-cordis-contract */
export class IndependentSettingsService extends Service {
  static readonly provide = independentSettingsKey
  readonly view: IndependentSettingsView
  protected readonly point: IndependentSettingsPoint
  constructor(ctx: Context, point: IndependentSettingsPoint) {
    super(ctx, IndependentSettingsService.provide)
    this.point = point
    this.view = Object.freeze({ list: point.list })
  }

  contribute(definition: SettingDefinitions): void {
    this.ctx.effect(() => this.point.contribute(definition), 'independentSettings.contribute')
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    assetCategories: AssetCategoriesService
    assetPublishing: AssetPublishingService
    assetManagement: AssetManagementService
    assetChanges: AssetChangesService
    independentSettings: IndependentSettingsService
  }
}

export function independentSettingsPlugin(
  name: string,
  definition: SettingDefinitions,
): Plugin.Object {
  return {
    name,
    inject: [independentSettingsKey],
    apply(ctx: Context) {
      ctx.independentSettings.contribute(definition)
    },
  }
}

export const assetCategoriesPlugin: Plugin.Object = {
  name: 'asset-categories',
  inject: [dynamisKey],
  apply(ctx: Context) {
    new AssetCategoriesService(ctx)
  },
}

/** Brings official definitions once the categories are there; the row that plugs it does not wait for them. */
export function broughtDefinitionsPlugin(
  name: string,
  point: string,
  held: readonly BroughtDefinition[],
): Plugin.Object {
  return {
    name,
    inject: [assetCategoriesKey],
    apply(ctx: Context) {
      ctx.assetCategories.bring(point, held)
    },
  }
}

export function categoryContributionPlugin(
  name: string,
  category: Omit<CategoryContribution, 'point'>,
  point: HeldPoint,
): Plugin.Object {
  return {
    name,
    inject: [assetCategoriesKey],
    apply(ctx: Context) {
      ctx.assetCategories.contribute(category, point)
    },
  }
}
