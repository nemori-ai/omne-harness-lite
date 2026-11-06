# src

本目录承载本包的公开定义、运行时校验与内部实现。`index.ts` 与 `cordis.ts` 是代码入口，本文件与 `index.md` 只是文档导航。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明：根入口 `.` 对应 `index.ts`，`./cordis` 对应 `cordis.ts`。

## 边界

源码只用可擦除的 TypeScript 语法。根入口不导入 `@deepseek-ai/cordis`，也不导入 `cordis.ts`；Cordis 插件只从 `cordis.ts` 导出。产品源码不导入契约的 `./testing` 入口，不导入任何 `@modelcontextprotocol/*` 包；`src/` 没有 `as`（`as const` 除外）、`any` 与非空断言。非类型行为写在包根 `SPEC.md`，不写在源码注释里代替规格。

## 维护

新增或改名公开入口时，同步 `package.json` 的 `exports`、`docs/public-api.md`、`tests/public-entry.spec.ts` 与本目录 `index.md`。改 `line.ts` 的端口时同步两条线路与 `tests/memory-line.ts`。改插件的键、配置、适配器或撤除函数时，同步包根 `SPEC.md` 的「Cordis 插件」、`docs/cordis.md`、`tests/cordis-entry.spec.ts` 与 `tests/cordis-journey.spec.ts`。

## 本包事实

模块见 [index.md](index.md)。负责人：本成员的维护者。`@modelcontextprotocol/client` 在 `package.json` 的 `devDependencies` 里，只给测试与 `tests/probes/` 的探针用；产品源码不导入它。
