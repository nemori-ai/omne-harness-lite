# 源码索引

公开入口为[index.ts](index.ts)，行为承诺归[SPEC](../SPEC.md)，职责归[架构](../docs/architecture.md)。

- [application.ts](application.ts)、[identity.ts](identity.ts)：公共应用与ID-19协调。
- [commands.ts](commands.ts)、[materials.ts](materials.ts)、[independent-materials.ts](independent-materials.ts)：完整命令集合、事实依赖与表拥有权。
- [wait-plan.ts](wait-plan.ts)、[joint-plan.ts](joint-plan.ts)、[request-plan.ts](request-plan.ts)：只读等待规划、本地组合和请求规则。
- [wait-write.ts](wait-write.ts)、[request-write.ts](request-write.ts)：唯一拥有者写入；对应store模块只实现关系增量。
- [relational-ddl.ts](relational-ddl.ts)、[request-relational-migration.ts](request-relational-migration.ts)、[wait-relational-migration.ts](wait-relational-migration.ts)：关系结构与旧数据核验迁移。
- [pool-read.ts](pool-read.ts)、[request-read.ts](request-read.ts)、[independent-read.ts](independent-read.ts)、[delivery-read.ts](delivery-read.ts)：有界索引读取。
- [operations.ts](operations.ts)、[terminal-participant.ts](terminal-participant.ts)：完整原结果认回与同目的端封口。
