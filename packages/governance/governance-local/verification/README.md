# 验证入口

关系检查见 [schema.spec.ts](../tests/schema.spec.ts)，真实迁移装配见 [materials.spec.ts](../tests/materials.spec.ts)。数据库实例由用例隔离创建并清理。

[GovernanceTargetSupport](../../../human-intervention/human-intervention/verification/models/GovernanceTargetSupport.tla) 及其 [说明](../../../human-intervention/human-intervention/verification/README.md#按租约保留目标支持) 维护目标支持的有限模型。模型不在本包复制。关系测试证明表能表达且约束指定绑定；完整单事务 adopt/withdraw 对投影的维护仍待业务实现。

10000 条历史原操作用来核对 pending 查询计划选择部分索引。它不是一万个用户并发，也不是延迟基准。目录完整性、资格保留、重装围栏和真实公开接口仍待提供者独立验收。

[operations.spec.ts](../tests/operations.spec.ts) 通过真实 Worker 调用生产私有事务函数，检查原操作认回、执行内容不可替换、封口后迟到执行、回滚、重开、epoch 隔离、精确目标支持、原 registrar 和容量竞争。[definitions.spec.ts](../tests/definitions.spec.ts) 检查复用的设置/权限语义及完整投影。它们不验证真实来源发行或 Identity 保留。

原操作模型归 [GovernanceOperation](../../../human-intervention/human-intervention/verification/models/GovernanceOperation.tla)。完整公开服务与生命周期的验收仍开放。

[sql-stage.spec.ts](../tests/sql-stage.spec.ts) 通过生产 planner、writer 和只读材料检查阶段单赋值、完整身份隔离、命令错绑、并发首次保存、预算、重启读回及丢失回包认回。缺少保管时业务不能发生。该组装配的身份回执仍为具名夹具，不能替代真实 Identity 或完整公共协调器验收。

[GovernanceSqlCustody](../../../human-intervention/human-intervention/verification/models/GovernanceSqlCustody.tla) 检查两个原操作阶段键、两种完整请求和任意保存、发送、封口、提交交错。说明及源码映射见 [SQL 请求保管守护](../../../human-intervention/human-intervention/verification/README.md#sql-请求保管守护)。
