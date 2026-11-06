# 测试索引

测试范围见[持续验证](../verification/README.md)，固定输入来源见[fixtures](fixtures/README.md)。

- [application.spec.ts](application.spec.ts)、[identity.spec.ts](identity.spec.ts)：真实Identity/SQLite公共方法、撤权与关闭。
- [requests.spec.ts](requests.spec.ts)、[terminals.spec.ts](terminals.spec.ts)：原子注册、决定、恢复、封口及晚失败。
- [queries.spec.ts](queries.spec.ts)、[pool-filters.spec.ts](pool-filters.spec.ts)：当前资格、签名分页、全部过滤组合及快照。
- [migration.spec.ts](migration.spec.ts)：原数据和操作保留、迁移篡改回滚。
- [relations.spec.ts](relations.spec.ts)、[relational.spec.ts](relational.spec.ts)：独立关系守护、DDL约束、唯一写者及恢复零SQL。
- [public-entry.spec.ts](public-entry.spec.ts)：公开材料入口。
