# @omne-harness/slash-command-cordis-contract 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `CatalogRead` · 包 `@omne-harness/slash-command-contract`
- `CommandCatalog` · 包 `@omne-harness/slash-command-contract`
- `EntrySourceSlot` · 包 `@omne-harness/slash-command-contract`

## 入口 `./cordis` · `cordis.d.ts`

- `CommandCatalogService` · `cordis.d.ts`
- `CommandEntrySourcesService` · `cordis.d.ts`
- `commandCatalogKey` · `cordis.d.ts`
- `commandEntrySourcesKey` · `cordis.d.ts`
- `commandEntrySourcesPlugin` · `cordis.d.ts`

## 声明文件 `cordis.d.ts`

```ts
import { type Context, type Plugin, Service } from '@deepseek-ai/cordis';
import { type DynamisService } from '@omne-harness/dynamis-cordis/cordis';
import { type CommandCatalog, type EntrySource, type EntrySourceSlot } from '@omne-harness/slash-command-contract';
export declare class CommandEntrySourcesService<P> extends Service {
    static readonly provide = "commandEntrySources";
    protected readonly tree: DynamisService;
    private readonly inflight;
    private readonly idle;
    constructor(ctx: Context);
    sources(): readonly EntrySourceSlot<P>[];
    hold(name: string): () => void;
    contribute(source: EntrySource<P>, options?: Readonly<{
        official: boolean;
    }>): void;
}
export declare const commandEntrySourcesKey = "commandEntrySources";
export declare const commandEntrySourcesPlugin: Plugin.Object;
export declare abstract class CommandCatalogService<P> extends Service implements CommandCatalog<P> {
    static readonly provide = "commandCatalog";
    constructor(ctx: Context);
    abstract readonly read: CommandCatalog<P>['read'];
    abstract readonly take: CommandCatalog<P>['take'];
    abstract readonly candidates: CommandCatalog<P>['candidates'];
}
export declare const commandCatalogKey = "commandCatalog";
```

## 声明文件 `index.d.ts`

```ts
export type { CatalogRead, CommandCatalog, EntrySourceSlot, } from '@omne-harness/slash-command-contract';
```
