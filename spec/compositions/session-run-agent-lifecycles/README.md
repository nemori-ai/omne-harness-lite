# Session、Run 与 Agent 实例的生命周期组合

当前正式契约为 [composition.session-run-agent-lifecycles v2](v2/contract.md)，由
[D-015](../../../docs/decisions/D-015-tool-execution-message-stream-and-hooks.md) 接受并登记于
[catalog](../../catalog.json)；[v1](v1/contract.md)（由
[D-014](../../../docs/decisions/D-014-session-run-agent-lifecycles.md) 接受）标为 superseded，
保持冻结与可引用，未迁移的消费者继续按 v1。精确版本与状态以 catalog 为准。

本组合在 [agent-session-binding v1](../agent-session-binding/README.md)
之上，只拥有连接 [session](../../capabilities/session/README.md)、
[run](../../capabilities/run/README.md) 与 [live-agent v1](../../capabilities/live-agent/README.md)
三台状态机的三条关系（附着、占位、执行者）、级联的三种形状与逐行声明、事实广播的
反应义务、Yield/重取协议、崩溃恢复顺序，以及跨协调域部署前的义务清单。

| 对象 | 当前状态与依据 |
|---|---|
| v2 契约与场景 | 已接受；与 v1 的差异见[差异表](v2/contract.md#与上一版的差异)，来源是[工具执行提案](../../../docs/proposals/tool-execution/README.md)的控制与级联表、等待登记簿与作者裁决 3/7/10/12/14 |
| v1 契约与场景 | superseded，保留精确引用与复现价值；[设计来源与评审](../../../docs/proposals/session-run-agent-lifecycles/README.md) |
| 规范场景 | [v2/scenarios.md](v2/scenarios.md)：17 个场景，分别标注模型与提供者验收 |
| 形式模型 | [v2/Lifecycles.tla](v2/Lifecycles.tla) 与四个配置：同域安全、同域进展、跨域安全、跨域进展；v2 新增 `superseded` 终态与 interrupt_then_run 的一步转移。否定变体与 v1 的运行记录在[提案证据目录](../../../docs/proposals/session-run-agent-lifecycles/evidence/model/results.json) |
| 验证说明 | [verification.md](verification.md)：配置映射、有限范围、模型发现与未覆盖项 |
| 系统视图 | [运行组合](../../../docs/architecture/runtime-composition.md) |

设计已接受，真实提供者符合性尚未实现；本组合不代表完整产品闭环已可运行。

## 差异表来源裁决的出处

[v2 差异表](v2/contract.md#与上一版的差异)的"来源裁决"列只写编号，链接在此维护（契约正文
不引用候选材料）：

| 编号 | 出处 |
|---|---|
| 作者裁决 0～7 | [按用户工作风格的作者裁决](../../../docs/proposals/tool-execution/README.md#作者裁决2026-09-15按用户工作风格) |
| 作者裁决 8～13 | [第二轮作者裁决](../../../docs/proposals/tool-execution/README.md#第二轮作者裁决2026-09-15架构复核后) |
| 作者裁决 14～19 | [第三轮作者裁决](../../../docs/proposals/tool-execution/README.md#第三轮作者裁决2026-09-15第三轮架构复核后) |
| 等待登记簿（含跨域边界）、T-17 | [等待登记簿](../../../docs/proposals/tool-execution/lifecycle.md#等待登记簿)、[不变式 T-17](../../../docs/proposals/tool-execution/invariants.md) |
| 控制级联逐行处置 | [控制与级联表](../../../docs/proposals/tool-execution/lifecycle.md#控制与级联表) |
| "本批次作者裁决"（占位派生与升级路径的交互、行 3/行 9 的同提交声明） | 契约的[差异说明](v2/contract.md#未由来源直接给出的表达)；来源提案未处理这些交互 |
