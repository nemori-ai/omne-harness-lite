# src

本目录承载本包的公开定义。`index.ts` 是根入口，`cordis.ts` 是 Cordis 定义入口，本文件与 `index.md` 只是文档导航。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明。

## 边界

源码只用可擦除的 TypeScript 语法。根入口不导入 `@deepseek-ai/cordis`，Cordis 绑定只从 `cordis.ts` 导出。非类型行为写在包根 `SPEC.md`，不写在源码注释里代替规格。

## 维护

新增或改名公开入口时，同步 `package.json` 的 `exports`、`docs/public-api.md` 与本目录 `index.md`。

## 本包事实

`index.ts` 不导出值。`cordis.ts` 持有 `TelemetryService`、`telemetryKey` 与 `Context.telemetry` 增补；它从 `@omne-harness/telemetry-contract` 只导入类型。没有别的模块。
