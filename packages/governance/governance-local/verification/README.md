# 验证入口

关系检查见 [schema.spec.ts](../tests/schema.spec.ts)，真实迁移装配见 [materials.spec.ts](../tests/materials.spec.ts)。数据库实例由用例隔离创建并清理。

[GovernanceTargetSupport](../../../human-intervention/human-intervention/verification/models/GovernanceTargetSupport.tla) 及其 [说明](../../../human-intervention/human-intervention/verification/README.md#按租约保留目标支持) 维护目标支持的有限模型。模型不在本包复制。关系测试证明表能表达且约束指定绑定；完整单事务 adopt/withdraw 对投影的维护仍待业务实现。

10000 条历史原操作用来核对 pending 查询计划选择部分索引。它不是一万个用户并发，也不是延迟基准。目录完整性、资格保留、重装围栏和真实公开接口仍待提供者独立验收。
