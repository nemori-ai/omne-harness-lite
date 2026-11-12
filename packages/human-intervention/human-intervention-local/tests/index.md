# 测试索引

测试范围见[持续验证](../verification/README.md)，固定输入来源见[fixtures](fixtures/README.md)。

- [application.spec.ts](application.spec.ts)、[identity.spec.ts](identity.spec.ts)：真实Identity/SQLite公共方法、撤权与关闭。
- [requests.spec.ts](requests.spec.ts)、[terminals.spec.ts](terminals.spec.ts)：原子注册、决定、恢复、封口及晚失败。
- [queries.spec.ts](queries.spec.ts)、[pool-filters.spec.ts](pool-filters.spec.ts)：当前资格、签名分页、全部过滤组合及快照。
- [tables.spec.ts](tables.spec.ts)：每个表拥有者一个建表迁移，建出的表与登记的表相同。
- [seed.ts](seed.ts)：用公开命令建立多状态库，供关系守护、池过滤和查询成本测试使用。
- [relations.spec.ts](relations.spec.ts)、[relational.spec.ts](relational.spec.ts)：独立关系守护、DDL约束、唯一写者及恢复零SQL。
- [public-entry.spec.ts](public-entry.spec.ts)：公开材料入口。
- [tool-origin.spec.ts](tool-origin.spec.ts)：tool 来源的登记、按会话与来源过滤的池、跳过后果，以及原工作守卫的缺失、拒绝与回滚。守卫是替身参与者。
- [agent-origins.spec.ts](agent-origins.spec.ts)：admission 与 agent-extension 来源的登记、按会话与来源过滤的池与答复。
- [origin-world.ts](origin-world.ts)：带会话的来源共用的测试世界与可切换的守卫替身。
