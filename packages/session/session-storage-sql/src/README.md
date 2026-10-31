# src

本目录承载本包的公开定义、运行时校验与内部实现。`index.ts` 是代码入口，本文件与 `index.md` 只是文档导航。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明。

## 边界

源码只用可擦除的 TypeScript 语法。根入口不导入 `@deepseek-ai/cordis`，Cordis 绑定只从 `cordis.ts` 导出（仅绑定变体）。非类型行为写在包根 `SPEC.md`，不写在源码注释里代替规格。

## 维护

新增或改名公开入口时，同步 `package.json` 的 `exports`、`docs/public-api.md` 与本目录 `index.md`。

## 本包事实

现在有两个文件：`index.ts` 与 `cordis.ts`。两者都只有 `PACKAGE_TEMPLATE_DRAFT` 标记与空导出。这个标记表示公开定义还没有进入源码。

当前缺口：[内部架构](../docs/architecture.md#模块与依赖)的七个模块都还没有进入，包括事务端口实现、参加者模块、派生维护、读路径、重建、编解码与迁移片段。`cordis.ts` 的插件见 [Cordis 集成](../docs/cordis.md)。候选导出清单见[公开接口导航](../docs/public-api.md#候选导出尚未实现)。`package.json` 现在只列出 `@deepseek-ai/cordis`，对 session-contract、session-cordis-contract、存储契约成员与 Kysely 的依赖随实现进入。存储契约没有可依赖的 workspace 成员，见 SPEC 的 [XP 表](../SPEC.md#xp-table)。具名维护者由负责人指定。
