# Session、Run 与 Agent 实例的生命周期组合

当前正式契约为 [composition.session-run-agent-lifecycles v1](v1/contract.md)，由
[D-014](../../../docs/decisions/D-014-session-run-agent-lifecycles.md) 接受并登记于
[catalog](../../catalog.json)。它在 [agent-session-binding v1](../agent-session-binding/README.md)
之上，只拥有连接 [session v1](../../capabilities/session/README.md)、
[run v1](../../capabilities/run/README.md) 与 [live-agent v1](../../capabilities/live-agent/README.md)
三台状态机的三条关系（附着、占位、执行者）、级联的三种形状与逐行声明、事实广播的
反应义务、Yield/重取协议、崩溃恢复顺序，以及跨协调域部署前的义务清单。

- [规范场景](v1/scenarios.md)：12 个场景，分别标注模型与提供者验收。
- [TLA+ 模型](v1/Lifecycles.tla)与四个配置：同域安全、同域进展、跨域安全、跨域进展；
  否定变体与运行记录在[提案证据目录](../../../docs/proposals/session-run-agent-lifecycles/evidence/model/results.json)。
- [验证说明](verification.md)：配置映射、有限范围、模型发现与未覆盖项。
- [系统视图](../../../docs/architecture/runtime-composition.md)与[提案](../../../docs/proposals/session-run-agent-lifecycles/README.md)：关系、取舍及接受依据。

设计已接受，真实提供者符合性尚未实现；本组合不代表完整产品闭环已可运行。
