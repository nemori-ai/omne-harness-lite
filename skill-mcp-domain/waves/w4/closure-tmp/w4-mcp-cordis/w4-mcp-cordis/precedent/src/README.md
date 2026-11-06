# src

本目录承载本包的公开定义、运行时校验与内部实现。`index.ts` 与 `cordis.ts` 是代码入口，本文件与 `index.md` 只是文档导航。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明：根入口对应 `index.ts`，`./cordis` 对应 `cordis.ts`。

## 边界

源码只用可擦除的 TypeScript 语法。根入口不导入 `@deepseek-ai/cordis`，Cordis 定义只从 `cordis.ts` 导出。`cordis.ts` 不导入任何提供者（[SPEC 性质 6](../SPEC.md#结果与不变量)）。非类型行为写在包根 `SPEC.md`，不写在源码注释里代替规格。

## 维护

新增或改名公开入口时，同步 `package.json` 的 `exports`、`docs/public-api.md` 与本目录 `index.md`。

## 本包事实

`index.ts` 是空导出。`cordis.ts` 导出五个抽象类，`PackageInspectionService`、`SkillCatalogService`、`SkillAccessService`、`SkillReadCheckService`、`SkillResolutionService`，另导出五个键常量（`skillPackageInspectionKey`、`skillCatalogKey`、`skillAccessKey`、`skillReadCheckKey`、`skillResolutionKey`），并声明五个键的 `Context` 增补。键只写在各类的 `provide`，常量取自它。具名维护者由负责人指定。
