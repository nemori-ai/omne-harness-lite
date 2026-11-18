# @omne-harness/assets-cordis-contract 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `assetCategoriesKey` · `index.d.ts`
- `assetPublishingKey` · `index.d.ts`

## 入口 `./cordis` · `cordis.d.ts`

- `AssetCategoriesService` · `cordis.d.ts`
- `AssetPublishingService` · `cordis.d.ts`
- `assetCategoriesPlugin` · `cordis.d.ts`
- `categoryContributionPlugin` · `cordis.d.ts`

## 声明文件 `cordis.d.ts`

```ts
import { Service, type Context, type Plugin } from '@deepseek-ai/cordis';
import { type CategoryContribution, type CategoryPoint, type CategoryView, type TenantPublishing, type TenantPublishOutcome, type TenantPublishRequest } from '@omne-harness/assets';
export declare class AssetCategoriesService extends Service {
    static readonly provide = "assetCategories";
    readonly view: CategoryView;
    protected readonly point: CategoryPoint;
    constructor(ctx: Context);
    contribute(contribution: CategoryContribution): void;
}
export declare class AssetPublishingService extends Service implements TenantPublishing<unknown> {
    static readonly provide = "assetPublishing";
    private readonly publishing;
    constructor(ctx: Context, publishing: TenantPublishing<unknown>);
    publish(request: TenantPublishRequest<unknown>): Promise<TenantPublishOutcome>;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        assetCategories: AssetCategoriesService;
        assetPublishing: AssetPublishingService;
    }
}
export declare const assetCategoriesPlugin: Plugin.Object;
export declare function categoryContributionPlugin(name: string, contribution: CategoryContribution): Plugin.Object;
```

## 声明文件 `index.d.ts`

```ts
export declare const assetCategoriesKey = "assetCategories";
export declare const assetPublishingKey = "assetPublishing";
```
