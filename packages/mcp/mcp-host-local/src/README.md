# src

本目录承载本包的公开定义、运行时校验与内部实现。`index.ts` 是代码入口，本文件与 `index.md` 只是文档导航。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明：只有根入口 `.`。

## 边界

源码只用可擦除的 TypeScript 语法。根入口不导入 `@deepseek-ai/cordis`，本包没有 `cordis.ts`。产品源码不导入契约的 `./testing` 入口，不导入任何 `@modelcontextprotocol/*` 包；`src/` 没有 `as`（`as const` 除外）、`any` 与非空断言。非类型行为写在包根 `SPEC.md`，不写在源码注释里代替规格。

## 维护

新增或改名公开入口时，同步 `package.json` 的 `exports`、`docs/public-api.md`、`tests/public-entry.spec.ts` 与本目录 `index.md`。改 `line.ts` 的端口时同步两条线路与 `tests/memory-line.ts`。

## 本包事实

十个模块，见 [index.md](index.md)。负责人：本成员的维护者。当前缺口：`package.json` 声明的 `@modelcontextprotocol/client` 只被 `tests/public-entry.spec.ts` 的对照断言使用，产品源码不用它；它该不该留在 `dependencies` 由依赖的写入负责人决定。
