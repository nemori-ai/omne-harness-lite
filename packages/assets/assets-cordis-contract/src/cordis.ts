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
import type {
  IndependentSettingsPoint,
  IndependentSettingsView,
  SettingDefinitions,
} from '@omne-harness/settings'
import {
  assetCategoriesKey,
  assetChangesKey,
  assetManagementKey,
  assetPublishingKey,
  independentSettingsKey,
} from './index.ts'

/** @owner packages/assets/assets-cordis-contract */
export class AssetCategoriesService extends Service {
  static readonly provide = assetCategoriesKey
  readonly view: CategoryView
  protected readonly point: CategoryPoint
  constructor(ctx: Context) {
    super(ctx, AssetCategoriesService.provide)
    const point = createCategoryPoint()
    this.point = point
    this.view = Object.freeze({
      lookup: point.lookup,
      describe: point.describe,
      list: point.list,
    })
  }

  contribute(contribution: CategoryContribution): void {
    this.ctx.effect(() => this.point.contribute(contribution), 'assetCategories.contribute')
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
