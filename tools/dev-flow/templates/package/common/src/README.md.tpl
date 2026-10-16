# src

<!-- documentation:placeholder -->

本目录承载本包的公开定义、运行时校验与内部实现。`index.ts` 是代码入口，本文件与 `index.md` 只是文档导航。

## 允许的内容

<!-- documentation:placeholder -->

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明。

## 边界

<!-- documentation:placeholder -->

源码只用可擦除的 TypeScript 语法。根入口不导入 `@deepseek-ai/cordis`，Cordis 绑定只从 `cordis.ts` 导出（仅绑定变体）。非类型行为写在包根 `SPEC.md`，不写在源码注释里代替规格。

## 维护

<!-- documentation:placeholder -->

新增或改名公开入口时，同步 `package.json` 的 `exports`、`docs/public-api.md` 与本目录 `index.md`。

## 本包事实

<!-- documentation:placeholder -->

待补：本目录对本包的实际内容、负责人与当前缺口。不适用时写明理由，并在 `documentation.json` 把本文件记为 `not-applicable`。
