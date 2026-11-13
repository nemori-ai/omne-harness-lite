# src

本目录承载本包的公开定义、运行时校验与内部实现。`index.ts` 是代码入口，本文件与 `index.md` 只是文档导航。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明：根入口 `src/index.ts` 与 `./cordis` 入口 `src/cordis.ts`。

## 边界

源码只用可擦除的 TypeScript 语法。根入口不导入 `@deepseek-ai/cordis`，Cordis 绑定只从 `cordis.ts` 导出。非类型行为写在包根 [SPEC.md](../SPEC.md)，不写在源码注释里代替规格。

## 维护

新增或改名公开入口时，同步 `package.json` 的 `exports`、[docs/public-api.md](../docs/public-api.md) 与本目录 `index.md`。

## 本包事实

本目录有八个源文件：`index.ts`、`cordis.ts`、`observation.ts`、`locate.ts`、`stream-subscription.ts`、`refresh-budget.ts`、`frames.ts`、`ports.ts`。各文件对应的对象见 [index.md](index.md)。
