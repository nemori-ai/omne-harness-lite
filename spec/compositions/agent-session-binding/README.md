# Agent 与 Session 运行附着

当前正式契约为 [composition.agent-session-binding v1](v1/contract.md)，由
[D-007](../../../docs/decisions/D-007-runtime-composition.md)接受并登记于
[catalog](../../catalog.json)。依赖 identity/live-agent v1，细化当前访问验证、
Session 附着、Factory/驱动与资源提供者的共同提交及释放义务。

- [规范场景](v1/scenarios.md)：16 个实现验收场景，分别标注模型和实际提供者验证。
- [TLA+ 模型](v1/Binding.tla)与[正常配置](v1/Binding.cfg)：有限安全模型。
- [验证与发布记录](verification.md)：受审快照、迁移哈希、实际结果及未覆盖范围。
- [系统视图](../../../docs/architecture/runtime-composition.md)与[提案](../../../docs/proposals/runtime-composition/README.md)：职责、取舍及接受依据。

设计已接受，真实提供者符合性尚未实现。完整 Session 持久化、Run/输入控制、
工具、模型和上下文内容仍按其专题定稿；此组合不代表完整产品闭环已可运行。
