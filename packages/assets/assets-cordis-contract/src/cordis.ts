import { Service, type Context, type Plugin } from '@deepseek-ai/cordis'
import {
  admitCategory,
  categoryViewOf,
  scopeOfLayer,
  type CategoryContribution,
  type HeldItem,
  type HeldPoint,
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

type Contributed = CategoryContribution & Readonly<{ category: string }>

/** Two contributors of one category hold two items at one key: the digest names who put it. */
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
  protected readonly tree: DynamisService
  constructor(ctx: Context) {
    super(ctx, AssetCategoriesService.provide)
    const tree = ctx.get(dynamisKey) as DynamisService
    tree.put([declare(categoriesContract)])
    this.tree = tree
    this.view = categoryViewOf(() => readingOf(tree.registry()))
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

  /** The definitions the deployment itself brings: items of the whole deployment on the point of their category. */
  bring(point: string, held: readonly Readonly<{ name: string; item: HeldItem }>[]): void {
    const { tree } = this
    const scope = scopeOfLayer('official')
    const entries = held.map(({ name, item }) => heldEntry(point, name, scope, item))
    this.ctx.effect(() => tree.put(entries), 'assetCategories.bring')
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
  held: readonly Readonly<{ name: string; item: HeldItem }>[],
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
