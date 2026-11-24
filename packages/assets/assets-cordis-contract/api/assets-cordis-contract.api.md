# @omne-harness/assets-cordis-contract 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `ASSET_CATEGORIES_POINT` · `index.d.ts`
- `HeldPlacing` · `index.d.ts`
- `assetCategoriesKey` · `index.d.ts`
- `assetChangesKey` · `index.d.ts`
- `assetManagementKey` · `index.d.ts`
- `assetPublishingKey` · `index.d.ts`
- `createHeldSync` · `index.d.ts`
- `heldEntry` · `index.d.ts`
- `independentSettingsKey` · `index.d.ts`

## 入口 `./cordis` · `cordis.d.ts`

- `AssetCategoriesService` · `cordis.d.ts`
- `AssetChangeListener` · `cordis.d.ts`
- `AssetChanges` · `cordis.d.ts`
- `AssetChangesService` · `cordis.d.ts`
- `AssetManagementService` · `cordis.d.ts`
- `AssetPublishingService` · `cordis.d.ts`
- `BroughtDefinition` · `cordis.d.ts`
- `IndependentSettingsService` · `cordis.d.ts`
- `assetCategoriesPlugin` · `cordis.d.ts`
- `broughtDefinitionsPlugin` · `cordis.d.ts`
- `categoryContributionPlugin` · `cordis.d.ts`
- `independentSettingsPlugin` · `cordis.d.ts`

## 声明文件 `cordis.d.ts`

```ts
import { Service, type Context, type Plugin } from '@deepseek-ai/cordis';
import { type JsonValue, type OfficialAsset, type PackageReader, type CategoryContribution, type HeldHolding, type HeldItem, type HeldPoint, type HeldReading, type CategoryView, type TenantManagement, type TenantPublishing, type TenantPublishOutcome, type TenantPublishRequest } from '@omne-harness/assets';
import { type DynamisService } from '@omne-harness/dynamis-cordis/cordis';
import type { IndependentSettingsPoint, IndependentSettingsView, SettingDefinitions } from '@omne-harness/settings';
export type BroughtDefinition = Readonly<{
    name: string;
    item: HeldItem;
    body: JsonValue;
    files?: PackageReader;
}>;
export declare class AssetCategoriesService extends Service {
    static readonly provide = "assetCategories";
    readonly view: CategoryView;
    readonly held: (capability: Readonly<{
        category: string;
        name: string;
    }>, tenant: string) => HeldReading;
    protected readonly tree: DynamisService;
    protected readonly brought: Set<Readonly<{
        point: string;
        name: string;
        item: HeldItem;
        body: JsonValue;
        files?: PackageReader;
    }>>;
    constructor(ctx: Context);
    contribute(category: Omit<CategoryContribution, 'point'>, point: HeldPoint): void;
    holdingsOf(tenant: string, skipped: (holding: HeldHolding) => void): (holdings: readonly HeldHolding[]) => void;
    bring(point: string, held: readonly BroughtDefinition[]): void;
    official(): readonly OfficialAsset[] | 'unavailable';
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
export declare function broughtDefinitionsPlugin(name: string, point: string, held: readonly BroughtDefinition[]): Plugin.Object;
export declare function categoryContributionPlugin(name: string, category: Omit<CategoryContribution, 'point'>, point: HeldPoint): Plugin.Object;
```

## 声明文件 `index.d.ts`

```ts
import type { HeldHolding, HeldItem, HeldScope } from '@omne-harness/assets';
import type { Entry } from '@omne-harness/dynamis';
export declare const assetCategoriesKey = "assetCategories";
export declare const assetPublishingKey = "assetPublishing";
export declare const assetManagementKey = "assetManagement";
export declare const assetChangesKey = "assetChanges";
export declare const independentSettingsKey = "independentSettings";
export declare const ASSET_CATEGORIES_POINT = "assets.categories";
export declare function heldEntry(point: string, name: string, scope: HeldScope, held: HeldItem): Entry<HeldItem>;
export type HeldPlacing = Readonly<{
    put(entry: Entry<HeldItem>): () => unknown;
    pointOf(category: string): string | undefined;
    scope: HeldScope;
    skipped(holding: HeldHolding): void;
}>;
export declare function createHeldSync(placing: HeldPlacing): (holdings: readonly HeldHolding[]) => void;
```
