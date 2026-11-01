# src

本目录承载本包的公开定义、运行时校验与内部实现。`index.ts` 与 `cordis.ts` 是代码入口，本文件与 `index.md` 只是文档导航。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明：根入口对应 `index.ts`，`./cordis` 对应 `cordis.ts`，`./testing` 对应 `testing/index.ts`。信任类型 `RequestContextTrust` 在 `trust.ts`。

## 边界

源码只用可擦除的 TypeScript 语法。`index.ts` 不导入 `@deepseek-ai/cordis`，只重导出契约类型。服务定义只从 `cordis.ts` 导出。`cordis.ts` 不导入 `@omne-harness/request-context` 或 `@omne-harness/request-context-cordis`（[SPEC 性质 10](../SPEC.md#结果与不变量)）。非类型行为写在包根 [SPEC.md](../SPEC.md)，不写在源码注释里代替规格。

## 维护

新增或改名公开导出时，同步 `package.json` 的 `exports`、[公开接口页](../docs/public-api.md)、本目录 `index.md` 与入口测试。改服务键、intercept 配置、事件或策略选择的配置形状时，同步 [Cordis 说明](../docs/cordis.md)。

## 本包事实

`index.ts` 显式重导出原契约类型，没有运行值。`cordis.ts` 发布抽象服务（含信任服务与账目收件口服务）、派生服务键、intercept 与策略选择类型，并增补 Context 和 Events。定义导航见[公开接口页](../docs/public-api.md#定义索引)。运行登记表、缓存和策略实现归提供者。
