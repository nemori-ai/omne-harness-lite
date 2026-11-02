# src

本目录承载本包的公开定义、运行时校验与内部实现。`index.ts` 是代码入口，本文件与 `index.md` 只是文档导航。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明，本成员只有根入口。

## 边界

源码只用可擦除的 TypeScript 语法。本成员是 `module` 变体，没有 `cordis.ts`，任何源文件都不导入 `@deepseek-ai/cordis`。源码只依赖 runtime-context-contract 与 legal-identity，不导入契约的 `./testing` 入口或上层领域的契约。非类型行为写在包根 [SPEC.md](../SPEC.md)，不写在源码注释里代替规格。

## 维护

新增或改名公开导出时，同步 `package.json` 的 `exports`、[公开接口页](../docs/public-api.md)、本目录 `index.md` 与导出测试。按[内部架构](../docs/architecture.md#模块与依赖)的模块切分新增源文件，`index.ts` 只导出工厂与它需要的类型。

## 本包事实

`index.ts` 导出工厂、配置解析与公开类型。其余八个文件是[内部架构](../docs/architecture.md#模块与依赖)的模块，见 [index.md](index.md)。

具名维护者由负责人指定。
