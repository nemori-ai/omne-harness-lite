# src

本目录承载本包的公开定义、运行时校验与内部实现。`index.ts` 与 `cordis.ts` 是代码入口，本文件与 `index.md` 只是文档导航。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明：根入口对应 `index.ts`，`./cordis` 对应 `cordis.ts`。

## 边界

源码只用可擦除的 TypeScript 语法。`index.ts` 不导入 `@deepseek-ai/cordis`。服务定义只从 `cordis.ts` 导出。`cordis.ts` 不导入 `@omne-harness/execution-environment` 或 `@omne-harness/execution-environment-host-local`（[SPEC 性质 8](../SPEC.md#结果与不变量)）。非类型行为写在包根 [SPEC.md](../SPEC.md)，不写在源码注释里代替规格。

## 维护

新增或改名公开导出时，同步 `package.json` 的 `exports`、[公开接口页](../docs/public-api.md)、本目录 `index.md` 与入口测试。改服务键或 intercept 配置时，同步 [Cordis 说明](../docs/cordis.md)。

## 本包事实

`index.ts` 是空导出。`cordis.ts` 导出 `ExecutionEnvironmentService`、`executionEnvironmentKey`、`ExecutionRecoveryAuthorityService` 与 `executionRecoveryAuthorityKey`，声明 `ExecutionEnvironmentIntercept` 与 `Context` 增补。`cordis.ts` 另导出分面类型与映射，以及登记面错误 `CallerClassMismatch`；八个模板方法核对后委托受保护钩子。

当前剩余责任：候选机制读数的 basis 登记与完整资源组合接受，见 [Cordis 说明](../docs/cordis.md#intercept-配置与调用方类)。具名维护者由负责人指定。
