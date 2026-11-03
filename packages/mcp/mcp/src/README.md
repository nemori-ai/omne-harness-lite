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

公开根只导出两个工厂与它们的类型；`internal/` 是聚合、关口与连接表，下一波的调用口在成员内接入。`class` 只出现在两个聚合里；源码没有类型断言。缺口：调用口与任务表。
