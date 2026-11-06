# src

本目录承载本包的公开定义、运行时校验与内部实现。`index.ts` 是代码入口，本文件与 `index.md` 只是文档导航。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明。

## 边界

源码只用可擦除的 TypeScript 语法。根入口不导入 `@deepseek-ai/cordis`，Cordis 服务定义只从 `./cordis` 导出。非类型行为写在包根 `SPEC.md`，不写在源码注释里代替规格。

## 维护

新增或改名公开入口时，同步 `package.json` 的 `exports`、`docs/public-api.md` 与本目录 `index.md`。

## 本包事实

- `index.ts` 导出 `createTiktokenExecutor`、执行器类型和资源类型。
- `executor.ts` 管理准入、租约、调度和物理线程生命周期。
- `worker.ts`、`tokenizer.ts`、`ordinary-counter.ts` 与 `piece-cache.ts` 在 worker 中完成初始化、计数和隔离缓存。
- `worker-port.ts` 与 `worker-protocol.ts` 拥有线程适配和内部消息校验。
- `definition.ts`、`digest.ts` 与 `engine-version.ts` 拥有身份快照、资源摘要与实际引擎版本。
- `cordis/` 拥有独立借用服务定义，关闭实现仍归宿主 owner。
