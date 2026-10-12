# @omne-harness-lite/session-log-sql

[English](README.md)

SQL 会话日志提供者，支持固定来源坐标、当前授权，以及参加共享 StorageUnit。

向 `openSqlSessionLog` 显式提供存储、授权和操作上限，并在该存储安装 `sessionLogMigrations`。根入口导出工厂；`./cordis` 导出提供者插件。存储为借用资源，必须持续存活到日志工作和借用全部排空。

公开类型与函数由本包维护。[薄规格](SPEC.md)约束类型表达不出的行为。[公共入口测试](tests/journal.spec.ts)提供可运行示例。实现完成、交付评审与接受分别核定。

按[开发指南](../../../docs/development.md)准备环境，先构建依赖。

```sh
pnpm --filter @omne-harness-lite/session-log-sql run build
pnpm --filter @omne-harness-lite/session-log-sql run typecheck
pnpm --filter @omne-harness-lite/session-log-sql run test
```
