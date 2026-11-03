# src

本目录承载本包的公开定义、运行时校验与内部实现。`index.ts` 是代码入口，本文件与 `index.md` 只是文档导航。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明。

## 边界

源码只用可擦除的 TypeScript 语法。根入口不导入 `@deepseek-ai/cordis`，Cordis 绑定只从 `cordis.ts` 导出（仅绑定变体）。非类型行为写在包根 `SPEC.md`，不写在源码注释里代替规格。

## 维护

新增或改名公开入口时，同步 `package.json` 的 `exports`、`docs/public-api.md` 与本目录 `index.md`。

## 本包事实

[calculation.ts](../src/calculation.ts)定义 LocalDate、snapshot、CalculationBasis、五类计算输入和判别结果。[queries.ts](../src/queries.ts)定义可信上下文、分页、版本选择、查询服务和错误。[supply.ts](../src/supply.ts)定义维护输入、完整操作地址、健康与种子封套。根入口聚合三者，不导入实现或 Cordis。
