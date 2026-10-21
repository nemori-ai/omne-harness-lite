# src

本目录承载本包的公开定义、运行时校验与内部实现。`index.ts` 与 `cordis.ts` 是代码入口，本文件与 `index.md` 只是文档导航。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明：根入口对应 `index.ts`，`./cordis` 对应 `cordis.ts`。

## 边界

源码只用可擦除的 TypeScript 语法。`index.ts`、`host-files.ts` 与 `host-provider.ts` 不导入 `@deepseek-ai/cordis`，也不导入 `./cordis`（[IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4)）。Cordis 绑定只从 `cordis.ts` 导出。非类型行为写在包根 [SPEC.md](../SPEC.md)，不写在源码注释里代替规格。

## 维护

新增或改名公开导出时，同步 `package.json` 的 `exports`、[公开接口页](../docs/public-api.md)、本目录 `index.md` 与入口测试。根入口新增模块时，同步 [public-entry.spec.ts](../tests/public-entry.spec.ts) 的文件清单。改宿主文件使用的已接受行为，先经原接受入口。

## 本包事实

- `host-files.ts`：宿主文件设施 `createHostFiles` 与 `hostObjectToken`，另有一个标为 `@internal` 的测试辅助函数，根入口不导出它。
- `host-provider.ts`：宿主文件提供者 `createHostFilesProvider`。
- `cordis.ts`：`ExecutionEnvironmentRegistry`、`executionEnvironmentRegistryWith`、`hostFilesPlugin`、`unavailableRecoveryAuthority` 与空配置 Schema。
- `index.ts`：重导出根入口的三个函数。

`index.ts` 与 `cordis.ts` 带 `PACKAGE_TEMPLATE_DRAFT` 注释，写明还没有接受的部分：`files` 的其余操作、`command` 与 `terminal` 提供者、平台前提探测、Runtime Context 生产者插件、调用方类核对。具名维护者由负责人指定。
