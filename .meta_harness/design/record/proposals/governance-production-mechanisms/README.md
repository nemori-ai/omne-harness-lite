# 治理生产机制候选

- 状态：候选，2026-09-24；本包保留候选分析；D-039 已限定采用 SQLite 档位，D-040 已接受 AIv3/OEv2 基础规格与显式参与方向。
- 选择对象：本轮有限登录/主动改密/身份一致性与灾备安全事实保存如何由现有账号、组织、入口、存储与装配兑现。
- 输入：[产品基线](../governance-production-baseline/README.md)，PF-001 rev17、PF-016 rev7、PF-017 rev4，以及当前 catalog 已接受版本。产品目标已接受不等于机制已可实施。
- 三个以上实质恢复候选见 alternatives；第一稿登录 R1 已推进到 r3 有限模型复审；外部副本/guard 的 R2 留在延期灾备范围，未采用。客户端无秘密运输独立接续 [CLI-TUI](../cli-tui/governance-client.md)。

| 问题 | 入口 |
|---|---|
| 当前可保留的边界及须修的机制 | [设计](design.md) |
| 恢复路径比较 | [候选](alternatives.md) |
| 独立评审及处置 | [评审](review.md) |

本包不以新需求强行合并账号与组织 owner，也不登记未接受的版本号。基础规格已按D-040采用；完整治理/入口消费者对账与领域SQL精化尚未完成；不能按此包开始完整生产实现。

INT-009已明确首批单机先交付，整机/磁盘损毁灾备指标后补。独立推进的修订候选：[登录最终计时与改密竞争](login-finalization.md)、[SQLite持久性档位](sqlite-durability.md)。未把外部副本方案纳入本期已接受机制。

[SQL 事务精化候选](sql-transaction-refinement.md)接续登录模型，首版限定 SQLite，明确异常转换和通知边界。

[单机部署/备份/隔离恢复候选](single-host-delivery.md)接续INT009；分发闭包和备份原语已取证，操作契约、完整失败路径及独立采用仍待完成。

[维护回调资源生命周期](maintenance-resource-lifetime.md)比较既有run承接entry文件句柄的三条路径；不改变维护领域语义。

[符合性运行器三候选](conformance-runner-boundary.md)由D057采用，修复已接受依赖绑定在生产归档中的代价。
