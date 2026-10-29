# src

本目录承载本包的公开定义。`index.ts` 与 `cordis.ts` 是两个代码入口，本文件与 `index.md` 只是文档导航。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明。

## 边界

源码只用可擦除的 TypeScript 语法。根入口不导入 `@deepseek-ai/cordis`，Cordis 绑定只从 `cordis.ts` 导出；两个入口都不导入提供者成员。非类型行为写在包根 [SPEC.md](../SPEC.md)，不写在源码注释里代替规格。

## 维护

新增或改名公开入口时，同步 `package.json` 的 `exports`、[公开接口](../docs/public-api.md)、[Cordis 说明](../docs/cordis.md)的键表、本目录 `index.md` 与 `tests/cordis-entry.spec.ts` 的键表，并重新生成 `api/session-cordis-contract.api.md`。

## 本包事实

`index.ts` 以 `export type *` 重导出 `@omne-harness/session-contract` 的类型，没有运行值。`cordis.ts` 导出 `SessionService` 与 `sessionKey`、十一个依赖抽象 Service 与键常量（含 `SessionAccessCheckService` 与 `sessionAccessCheckKey`）、`SessionIntercept`、`Context` 与 `Events` 增补。被替代的 `sessionToolStartFence`（已被替代）与 `sessionDeliveryRelease`（已被替代）不定义。具名维护者由负责人指定。
