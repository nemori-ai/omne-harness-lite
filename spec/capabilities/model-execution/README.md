# 模型选择、请求与上下文装配

**当前正式契约为 [capability.model-execution v2](v2/contract.md)**，接受依据
[D-015](../../../docs/decisions/D-015-tool-execution-message-stream-and-hooks.md)；
[v1](v1/contract.md)（[D-008](../../../docs/decisions/D-008-core-capabilities.md)）保持冻结与
可引用，标为 superseded。v2 把 interrupt 与强停并入同一 attempt 接纳账本，规定 attempt
结算记录必带的字段（`purpose`、缺失块清单、实际送达模态、公开紧凑流记录），补
`system_reminder` 按模型族的投影规则，并新增 attempt 的瞬态帧与发布计数、活跃 attempt
读面、私有序列与公开投影的边界三条（逐条见
[契约末尾的差异表](v2/contract.md#与上一版的差异)）。帧的形状、公开增量词表与公开投影
`toPublic` 的定义归 [message-stream v1](../message-stream/README.md)，本能力承担发布者一侧
的义务。精确版本、状态与接受依据以 [catalog](../../catalog.json) 为准。

| 对象 | 当前状态与依据 |
|---|---|
| 模型执行契约 | v1 由 [D-008](../../../docs/decisions/D-008-core-capabilities.md) 接受，v2 由 [D-015](../../../docs/decisions/D-015-tool-execution-message-stream-and-hooks.md) 接受；设计来源见[核心能力提案](../../../docs/proposals/core-capabilities/README.md)、[消息流提案](../../../docs/proposals/message-stream/README.md)（增量协议、重连基线、公开投影）与[工具执行提案](../../../docs/proposals/tool-execution/README.md)（interrupt 的归属、`system_reminder` 投影） |
| v2 差异表引用的裁决 | 契约正文不引用提案，差异表以编号给出来源；正文在[用户裁决 U-48～U-58](../../../docs/proposals/message-stream/README.md#裁决记录2026-09-15用户)、[作者裁决 R7／R8](../../../docs/proposals/message-stream/README.md#作者裁决评审后2026-09-15)、[第二轮 R12／R14／R15／R16](../../../docs/proposals/message-stream/README.md#第二轮复核后2026-09-15)、[第三轮 R20](../../../docs/proposals/message-stream/README.md#第三轮复核后2026-09-15)、[delta-protocol §5 重连基线](../../../docs/proposals/message-stream/delta-protocol.md#5-重连基线)与[§7 权威落点](../../../docs/proposals/message-stream/delta-protocol.md#7-权威落点)、[用户裁决 U-46](../../../docs/proposals/tool-execution/README.md#裁决记录2026-09-14用户)、[interrupt 动作链](../../../docs/proposals/tool-execution/lifecycle.md#interrupt-与-interrupt_then_run-的动作链)、[契约措辞缺口表](../../../docs/proposals/tool-execution/lifecycle.md#契约措辞缺口表) |
| 形式模型 `ModelSelection.tla` | [v2 目录](v2/)内的模型与配置是 [v1](v1/) 的逐字节副本，本次发版没有重跑 TLC；它只覆盖 MC-08～10 的模态与压缩门，运行数字与 v2 新条款的未覆盖部分见[验证范围](verification.md) |
| v2 新语义的证据 | MC-04 的“发网前耐久”由 [run-driver 模型](../run-driver/verification.md)的 I-18 与否定变体 sendEarly 覆盖；MC-12 的 `ended` 时机与 MP-2 由 [message-stream 的游标模型](../message-stream/verification.md)覆盖；MC-06/07/13/14 无模型，见[验证范围](verification.md) |
| 目标实现 | 尚未开始，且 MC 提供者设计仍是缺口：`packages/model` 只有 [llm 源切片](../../../packages/model/llm/README.md)，网络出口、adapter、`toPublic`、私有回放读面与 attempt 帧发布都待提供者设计。源码 fork 不表示实现已符合 |

设计接受、模型检查与实现验收分别记录；本页不代替精确契约。
