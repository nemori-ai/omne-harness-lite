# 验证入口

[registrar.spec.ts](../tests/registrar.spec.ts) 把 GL-13/14/15 的私有机制接到 contribute/withdraw 应用入口，并使用真实 SqlStorage/Identity 验证恢复。原操作终态和 SQL 单赋值继续由既有模型守护。[GovernanceRegistrar](../../../human-intervention/human-intervention/verification/models/GovernanceRegistrar.tla) 补充首次来源证明、原回执不变、来源离线认回和当前租约投影。该增量没有完成公开导出、adopt/current、目录和 Cordis 生命周期；完整 C3b 独立验收仍开放。

[admission.spec.ts](../tests/admission.spec.ts) 检查发行主体、完整租户及可见性、显式 action 委托、逐 owner 的完整执行关口、当前资格和异步输入隔离。它包含真实 Identity SQL 撤回成员后的拒绝，其他条件使用具名受控来源逐项构造反例。有限证明与六个负控归 [治理准入交集](../../../human-intervention/human-intervention/verification/README.md#治理准入交集)。准入对象尚未接到完整公开服务，不能据此声称 C3b 已通过验收。

关系检查见 [schema.spec.ts](../tests/schema.spec.ts)，真实迁移装配见 [materials.spec.ts](../tests/materials.spec.ts)。数据库实例由用例隔离创建并清理。

[GovernanceTargetSupport](../../../human-intervention/human-intervention/verification/models/GovernanceTargetSupport.tla) 及其 [说明](../../../human-intervention/human-intervention/verification/README.md#按租约保留目标支持) 维护目标支持的有限模型。模型不在本包复制。关系测试证明表能表达且约束指定绑定；完整单事务 adopt/withdraw 对投影的维护仍待业务实现。

10000 条历史原操作用来核对 pending 查询计划选择部分索引。它不是一万个用户并发，也不是延迟基准。目录完整性、资格保留、重装围栏和真实公开接口仍待提供者独立验收。

[operations.spec.ts](../tests/operations.spec.ts) 通过真实 Worker 调用生产私有事务函数，检查原操作认回、执行内容不可替换、封口后迟到执行、回滚、重开、epoch 隔离、精确目标支持、原 registrar 和容量竞争。[definitions.spec.ts](../tests/definitions.spec.ts) 检查复用的设置/权限语义及完整投影。它们不验证真实来源发行或 Identity 保留。

原操作模型归 [GovernanceOperation](../../../human-intervention/human-intervention/verification/models/GovernanceOperation.tla)。完整公开服务与生命周期的验收仍开放。

[sql-stage.spec.ts](../tests/sql-stage.spec.ts) 通过生产 planner、writer 和只读材料检查阶段单赋值、完整身份隔离、命令错绑、并发首次保存、预算、重启读回及丢失回包认回。缺少保管时业务不能发生。该组装配的身份回执仍为具名夹具，不能替代真实 Identity 或完整公共协调器验收。

同组测试还以真实 Worker 重开、不同元数据组合摘要和缺失的原业务参与者，检查公开 SqlOperationCoordinator 的恢复行为。原材料缺失时发送不可用，操作仍为 submitted，原封套不变。替换封套冲突；原材料重新可用后，只提交原封套并按同一身份认回。该场景采用 mutation 命令验证公共阶段机制，不声称覆盖所有权限来源故障或自动恢复缺失的代码材料。

[GovernanceSqlCustody](../../../human-intervention/human-intervention/verification/models/GovernanceSqlCustody.tla) 检查两个原操作阶段键、两种完整请求和任意保存、发送、封口、提交交错。说明及源码映射见 [SQL 请求保管守护](../../../human-intervention/human-intervention/verification/README.md#sql-请求保管守护)。

`SqlOperationCoordinator.send` 和 executeControl 只发送已确认保管的请求，落实 GovernanceSqlCustody 的 ExactSend 前提。accept 成功后重新读取当前 Operation，不使用历史受理回执继续业务。SqlSubmission 的完整回执校验与真实并发观察场景补充 GovernanceOperation 的原操作守护。模型仍假设底层存储满足自身契约，不证明任意故障下的恢复活性。


[standing-coordinator.spec.ts](../tests/standing-coordinator.spec.ts) 使用真实Identity源服务与生产Governance planner/writer，验证完整请求先保存、真实held、业务终态、目的封口、源结算和本地settled。用例包含两种竞争顺序及并发竞争、源回执丢失、目的SQL回包丢失、迟到held、错绑定与Worker重开。资格与路由协议使用生产实现；公开准入和来源/current仍是具名夹具。

该组合把 GovernanceSqlCustody 的 ExactSend、SettingsReservationCustody 的 SettledCannotBecomeHeld 和 [StandingRequestSettlement](../../../assets/settings/verification/models/StandingRequestSettlement.tla) 的 NoLateHold 映射到实际协调链。有限模型各有自己的前提；组合测试不构成全系统归纳证明，不覆盖远程认证、任意代码升级、物理断电或无限故障下的进展。

[GovernanceRecoveryPhase](../../../human-intervention/human-intervention/verification/models/GovernanceRecoveryPhase.tla)补充固定SQL阶段的失败回执模型。错资格的seal先返回unavailable，随后正确原请求仍须结算；真实红绿反例同时检查阶段行缺失及正确恢复成功，不能只观察没有写入业务行。

## 权限读取的组织来源保管

[来源保管论证](proofs/permission-capture-custody.md)对应 GL-25。它说明原操作和来源责任的关系、有界恢复归并及假设，不构成新增机器证明。

[保管测试](../tests/permission-capture-custody.spec.ts)运行真实 SQLite Worker；[迁移测试](../tests/permission-capture-migration.spec.ts)覆盖原行字节和实际旧域升级；[SQL 协调测试](../tests/sql-coordinator.spec.ts)检查生产读取声明及阶段认回。权限材料生产、来源服务协调及业务消费者仍是后续验收范围。

[外域写协调入口](../tests/external-write-provider.spec.ts) 与 [真实来源组合](../tests/external-write-source.spec.ts) 覆盖 GL-29：原意图复制、真实主体核验、原资格保管、提交后不重算计划、关闭竞争，以及结算失败后的 Worker 重启与工厂恢复。来源组合采用真实 Identity、Settings 和 Governance，业务资格与业务计划为具名夹具。Session 成功写入及其治理终态同提交不在这些测试的证明范围内。

[原操作保管](../tests/external-write-custody.spec.ts) 还验证内部引用认回和 required 不得降级。恢复查询从原操作 schema 取得类型集合，防止新增原操作被恢复解析器遗漏。结构性论证见 [受信写入口与恢复闭合](proofs/permission-capture-custody.md#受信写入口与恢复闭合)。它不替代机器证明或完整 C3b 独立验收。


[真实 Session 同提交组合](../../../../apps/harness-server/tests/rows/governance/external-session-commit.spec.ts) 覆盖 GL-30。它装配真实 Session 写者、Governance 写者及 SqlStorage，检查成功、写后回滚、结果错绑、提前封口、完整 facts 替换及丢回执。业务资格与定义为具名测试适配器，生产原登录及当前定义接线不在该测试的证明范围内。对应论证见 [外域原子性](proofs/permission-capture-custody.md#外域效果与治理终态的原子性)。

[definition-projection.spec.ts](../tests/definition-projection.spec.ts) 使用真实注册服务与 SQLite 读取 settings=null 的声明，不构造 Settings target；覆盖撤下、旧 epoch、错误 scope、错误完整定义与关闭。原发布来源是具名测试来源，该测试不证明真实 Tool/Assets 发布或权限准入。[schema.spec.ts](../tests/schema.spec.ts) 对共享查询保留一万条旧代记录下的索引计划守护，拒绝贡献表或声明表全扫描。GL-31 的谓词与前提见[当前声明论证](proofs/permission-capture-custody.md#当前注册声明的独立读取)。
