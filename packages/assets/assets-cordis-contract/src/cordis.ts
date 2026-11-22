import { Service, type Context, type Plugin } from '@deepseek-ai/cordis'
import {
  createCategoryPoint,
  type CategoryContribution,
  type CategoryPoint,
  type CategoryView,
  type TenantManagement,
  type TenantPublishing,
  type TenantPublishOutcome,
  type TenantPublishRequest,
} from '@omne-harness/assets'
import { declare, type Contract, type Entry } from '@omne-harness/dynamis'
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
  independentSettingsKey,
} from './index.ts'

const categoriesContract: Contract = Object.freeze({
  name: ASSET_CATEGORIES_POINT,
  tree: 'server',
  arity: 'keyed-one',
  keyFrom: null,
  key: 'the category name',
  gives: 'nothing: the item is the category name alone',
  item: Object.freeze({ kind: 'data', fields: Object.freeze({ category: 'string' }) }),
  resolve: 'conflict',
  binding: 'run',
  onError: 'nothing is called: the item is data',
  version: 1,
  revision: 1,
  keys: 'public',
  conformance: null,
  summary: 'The asset categories now registered, by name; a contribution stays on the service.',
})

function named(category: string): Entry {
  const point = ASSET_CATEGORIES_POINT
  return { point, key: category, id: '', scope: [], rank: 0, digest: category, item: { category } }
}

/** @owner packages/assets/assets-cordis-contract */
export class AssetCategoriesService extends Service {
  static readonly provide = assetCategoriesKey
  readonly view: CategoryView
  protected readonly point: CategoryPoint
  private readonly place: (category: string) => () => unknown
  constructor(ctx: Context) {
    super(ctx, AssetCategoriesService.provide)
    const point = createCategoryPoint()
    this.point = point
    // Captured here, not read from `this`: a key is put as this service, whoever contributes.
    const tree = ctx.get(dynamisKey) as DynamisService
    tree.put([declare(categoriesContract)])
    this.place = category => tree.put([named(category)])
    this.view = Object.freeze({
      lookup: point.lookup,
      describe: point.describe,
      list: point.list,
    })
  }

  /** The name is a key on the tree for exactly as long as the contribution is on the point. */
  contribute(contribution: CategoryContribution): void {
    this.ctx.effect(() => {
      const withdraw = this.point.contribute(contribution)
      const take = this.place(contribution.contract.category)
      return () => {
        withdraw()
        return take()
      }
    }, 'assetCategories.contribute')
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

export function categoryContributionPlugin(
  name: string,
  contribution: CategoryContribution,
): Plugin.Object {
  return {
    name,
    inject: [assetCategoriesKey],
    apply(ctx: Context) {
      ctx.assetCategories.contribute(contribution)
    },
  }
}
