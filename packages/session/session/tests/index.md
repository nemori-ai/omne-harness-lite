# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、替身、运行方式与当前缺口
- [public-entry.spec.ts](public-entry.spec.ts)：根入口的运行时导出
- [conformance.spec.ts](conformance.spec.ts)：事务套件经四个面，内存替身对
- [conformance-sql.spec.ts](conformance-sql.spec.ts)：事务套件经四个面，真实 SQL 提供者对（慢层）
- [access.spec.ts](access.spec.ts)：一次访问裁定、失败分支、调用方类与另一租户
- [pipeline.spec.ts](pipeline.spec.ts)：命令处理器流水线
- [construction.spec.ts](construction.spec.ts)：启动条件与配置核对
- [advance.spec.ts](advance.spec.ts)：S1、C2 开 Run、会话槽引用、S4、S3
- [complexity.spec.ts](complexity.spec.ts)：SS-02 确定性计数
- [fixtures/](fixtures/index.md)：替身装配与真实 SQL 装配
