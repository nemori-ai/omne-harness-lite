# @omne-harness/assets-cordis-contract 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `ASSET_CATEGORIES_POINT` · `index.d.ts`
- `assetCategoriesKey` · `index.d.ts`
- `assetChangesKey` · `index.d.ts`
- `assetManagementKey` · `index.d.ts`
- `assetPublishingKey` · `index.d.ts`
- `heldEntry` · `index.d.ts`
- `independentSettingsKey` · `index.d.ts`

## 入口 `./cordis` · `cordis.d.ts`

- `AssetCategoriesService` · `cordis.d.ts`
- `AssetChangeListener` · `cordis.d.ts`
- `AssetChanges` · `cordis.d.ts`
- `AssetChangesService` · `cordis.d.ts`
- `AssetManagementService` · `cordis.d.ts`
- `AssetPublishingService` · `cordis.d.ts`
- `IndependentSettingsService` · `cordis.d.ts`
- `assetCategoriesPlugin` · `cordis.d.ts`
- `broughtDefinitionsPlugin` · `cordis.d.ts`
- `categoryContributionPlugin` · `cordis.d.ts`
- `independentSettingsPlugin` · `cordis.d.ts`

## 声明文件 `cordis.d.ts`

```ts
import { Service, type Context, type Plugin } from '@deepseek-ai/cordis';
import { type CategoryContribution, type HeldItem, type HeldPoint, type CategoryView, type TenantManagement, type TenantPublishing, type TenantPublishOutcome, type TenantPublishRequest } from '@omne-harness/assets';
import { type DynamisService } from '@omne-harness/dynamis-cordis/cordis';
import type { IndependentSettingsPoint, IndependentSettingsView, SettingDefinitions } from '@omne-harness/settings';
export declare class AssetCategoriesService extends Service {
    static readonly provide = "assetCategories";
    readonly view: CategoryView;
    protected readonly tree: DynamisService;
    constructor(ctx: Context);
    contribute(category: Omit<CategoryContribution, 'point'>, point: HeldPoint): void;
    bring(point: string, held: readonly Readonly<{
        name: string;
        item: HeldItem;
    }>[]): void;
}
export declare class AssetPublishingService extends Service implements TenantPublishing<unknown> {
    static readonly provide = "assetPublishing";
    private readonly publishing;
    constructor(ctx: Context, publishing: TenantPublishing<unknown>);
    publish(request: TenantPublishRequest<unknown>): Promise<TenantPublishOutcome>;
}
export declare class AssetManagementService extends Service {
    static readonly provide = "assetManagement";
    readonly management: TenantManagement<unknown>;
    constructor(ctx: Context, management: TenantManagement<unknown>);
}
export type AssetChangeListener = Readonly<{
    changed(): void;
    closed(): void;
}>;
export type AssetChanges = Readonly<{
    subscribe(tenant: string, listener: AssetChangeListener): () => void;
}>;
export declare class AssetChangesService extends Service implements AssetChanges {
    static readonly provide = "assetChanges";
    private readonly changes;
    constructor(ctx: Context, changes: AssetChanges);
    subscribe(tenant: string, listener: AssetChangeListener): () => void;
}
export declare class IndependentSettingsService extends Service {
    static readonly provide = "independentSettings";
    readonly view: IndependentSettingsView;
    protected readonly point: IndependentSettingsPoint;
    constructor(ctx: Context, point: IndependentSettingsPoint);
    contribute(definition: SettingDefinitions): void;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        assetCategories: AssetCategoriesService;
        assetPublishing: AssetPublishingService;
        assetManagement: AssetManagementService;
        assetChanges: AssetChangesService;
        independentSettings: IndependentSettingsService;
    }
}
export declare function independentSettingsPlugin(name: string, definition: SettingDefinitions): Plugin.Object;
export declare const assetCategoriesPlugin: Plugin.Object;
export declare function broughtDefinitionsPlugin(name: string, point: string, held: readonly Readonly<{
    name: string;
    item: HeldItem;
}>[]): Plugin.Object;
export declare function categoryContributionPlugin(name: string, category: Omit<CategoryContribution, 'point'>, point: HeldPoint): Plugin.Object;
```

## 声明文件 `index.d.ts`

```ts
import type { HeldItem, HeldScope } from '@omne-harness/assets';
import type { Entry } from '@omne-harness/dynamis';
export declare const assetCategoriesKey = "assetCategories";
export declare const assetPublishingKey = "assetPublishing";
export declare const assetManagementKey = "assetManagement";
export declare const assetChangesKey = "assetChanges";
export declare const independentSettingsKey = "independentSettings";
export declare const ASSET_CATEGORIES_POINT = "assets.categories";
export declare function heldEntry(point: string, name: string, scope: HeldScope, held: HeldItem): Entry<HeldItem>;
```
