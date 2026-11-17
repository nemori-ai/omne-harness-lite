# @omne-harness/assets-cordis-contract 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `assetCategoriesKey` · `index.d.ts`

## 入口 `./cordis` · `cordis.d.ts`

- `AssetCategoriesService` · `cordis.d.ts`
- `assetCategoriesPlugin` · `cordis.d.ts`
- `categoryContributionPlugin` · `cordis.d.ts`

## 声明文件 `cordis.d.ts`

```ts
import { Service, type Context, type Plugin } from '@deepseek-ai/cordis';
import { type CategoryContribution, type CategoryPoint, type CategoryView } from '@omne-harness/assets';
export declare class AssetCategoriesService extends Service {
    static readonly provide = "assetCategories";
    readonly view: CategoryView;
    protected readonly point: CategoryPoint;
    constructor(ctx: Context);
    contribute(contribution: CategoryContribution): void;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        assetCategories: AssetCategoriesService;
    }
}
export declare const assetCategoriesPlugin: Plugin.Object;
export declare function categoryContributionPlugin(name: string, contribution: CategoryContribution): Plugin.Object;
```

## 声明文件 `index.d.ts`

```ts
export declare const assetCategoriesKey = "assetCategories";
```
