# src

本目录承载本包的公开定义、运行时校验与内部实现。`index.ts` 是代码入口，本文件与 `index.md` 只是文档导航。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明。

## 边界

源码只用可擦除的 TypeScript 语法。本成员是 `module` 变体，没有 `cordis.ts`，根入口不导入 `@deepseek-ai/cordis`。非类型行为写在包根 [SPEC.md](../SPEC.md)，不写在源码注释里代替规格。

## 维护

新增或改名公开导出时，同步 `package.json` 的 `exports`、[公开接口页](../docs/public-api.md)、本目录 `index.md` 与导出测试。按[内部架构](../docs/architecture.md#模块与依赖)的模块切分新增源文件，`index.ts` 只做再导出。

## 本包事实

除 `index.ts` 外，本目录有十四个源模块，其中 `facilities/` 下是 `files`、`command`、`terminal` 三个核心设施，每个文件用 `declare module` 增补设施表。`decode.ts` 是内部解码器，根入口只再导出它的 `Issue` 类型（名为 `DecodeIssue`）。运行值依赖为 `operation-result`、`json-text` 和 `legal-identity`。`operation-schemas.ts` 承载三面 schema，`testing/` 承载进程内套件和非耐久替身。

`index.ts` 文件头带 `PACKAGE_TEMPLATE_DRAFT` 标记，它表示设施自身逐操作 schema 仍待后续；三面 schema 与套件已实现，交付接受另行判断。具名维护者由负责人指定。
