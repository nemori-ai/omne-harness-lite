# tests/fixtures 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：固定输入的来源与约束。没有数据文件，只有代码夹具
- [assembly.ts](assembly.ts)：真实 Cordis 根与各端口的提供者插件、闸门、有序关闭的协调者
- [backends.ts](backends.ts)：内存事务对，取自 session 的测试夹具
- [sql-backend.ts](sql-backend.ts)：session-storage-sql 的真实对，底下是真实 sqlite-provider
- [tenants.ts](tenants.ts)：两个租户与访问策略
- [session-spy.ts](session-spy.ts)：包着真实工厂的探针，数 `close`、`maintain` 与释放
