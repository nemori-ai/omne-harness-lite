# src

本目录承载本包的公开定义、运行时校验与内部实现。`index.ts` 是代码入口，本文件与 `index.md` 只是文档导航。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明。

## 边界

源码只用可擦除的 TypeScript 语法。根入口不导入 `@deepseek-ai/cordis`。非类型行为写在包根 `SPEC.md`，不写在源码注释里代替规格。

## 维护

新增或改名公开入口时，同步 `package.json` 的 `exports`、`docs/public-api.md` 与本目录 `index.md`。

## 本包事实

`index.ts` 只重新导出三个工厂与 `SkillPorts`。`access/` 的三段、`mapping.ts`、`match.ts` 与两个答复模块不公开，测试直接导入它们。源码不用类、不用类型断言（只用 `as const`）、不用 TypeScript 的顶层宽类型；品牌只由契约的守卫授予。模块划分与依赖方向见 [docs/architecture.md](../docs/architecture.md)。
