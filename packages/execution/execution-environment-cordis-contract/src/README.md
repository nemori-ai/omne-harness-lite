# src

本目录承载本包的公开定义、运行时校验与内部实现。`index.ts` 与 `cordis.ts` 是代码入口，本文件与 `index.md` 只是文档导航。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明：根入口对应 `index.ts`，`./cordis` 对应 `cordis.ts`。

## 边界

源码只用可擦除的 TypeScript 语法。`index.ts` 不导入 `@deepseek-ai/cordis`。服务定义只从 `cordis.ts` 导出。`cordis.ts` 不导入 `@omne-harness/execution-environment` 或 `@omne-harness/execution-environment-host-local`（[SPEC 性质 8](../SPEC.md#结果与不变量)）。非类型行为写在包根 [SPEC.md](../SPEC.md)，不写在源码注释里代替规格。

## 维护

新增或改名公开导出时，同步 `package.json` 的 `exports`、[公开接口页](../docs/public-api.md)、本目录 `index.md` 与入口测试。改服务键或 intercept 配置时，同步 [Cordis 说明](../docs/cordis.md)。

## 本包事实

`index.ts` 是空导出。`cordis.ts` 导出 `ExecutionEnvironmentService` 与 `executionEnvironmentKey`，声明 `ExecutionEnvironmentIntercept` 与 `Context` 增补。两个文件都带 `PACKAGE_TEMPLATE_DRAFT` 注释。`cordis.ts` 的标记写明恢复两操作的调用方类核对还没有接受。

当前缺口：调用方类的核对，见 [Cordis 说明](../docs/cordis.md#intercept-配置与调用方类)。具名维护者由负责人指定。
