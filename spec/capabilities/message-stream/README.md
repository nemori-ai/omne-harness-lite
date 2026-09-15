# 客户端消息流

**当前正式契约为 [capability.message-stream v1](v1/contract.md)**，接受依据
[D-015](../../../docs/decisions/D-015-tool-execution-message-stream-and-hooks.md)；这是新增能力，
没有更早的版本，也不取代任何已发布契约。精确版本、状态与接受依据以
[catalog](../../catalog.json) 为准。

本能力拥有出站投递的语义：帧信封与封闭的帧类别、呈现标识词表、客户端游标、断线增量补齐与
全量重取、作用域与两处读权核对、背压与不进流的清单、模型 attempt 的瞬态帧协议。它**不**拥有：
消息与内容块的形状（[共享数据 CD v2](../../data/core-work/v2/contract.md)）、派生消息与
`history / changes / snapshot / visibilityVersion` 读面（[session v2](../session/v2/contract.md)）、
调用与帧的事实侧（[tools v2](../tools/v2/contract.md)）、请求与可答性（[human-decisions v2](../human-decisions/v2/contract.md)）、
attempt 结算记录与公开投影的兑现（[model-execution v2](../model-execution/v2/contract.md)），以及传输
选型与心跳、批处理、压缩、阈值等装配参数（应用装配）。

| 对象 | 当前状态与依据 |
|---|---|
| message-stream v1 设计与规格 | 由 D-015 接受；设计来源、决定点裁决（U-48～U-58）与三轮独立评审后的作者裁决（R1～R22）见[消息流提案](../../../docs/proposals/message-stream/README.md)与[评审记录](../../../docs/proposals/message-stream/review.md)；[验证范围](verification.md) |
| 形式模型 `Cursor.tla` | v1 目录内的模型与两个配置是[提案证据目录](../../../docs/proposals/message-stream/evidence/README.md)的逐字节副本；两个登记配置完整探索通过，两个否定变体各给出预期反例，其余补充配置留在提案证据目录；有限范围与未建模项见[验证范围](verification.md)，不是无条件证明 |
| 提供者设计与装配 | 尚未开始：出站流提供者、model-execution 提供者（含公开投影与 `attempts` 读面）、投影的 `changes / snapshot / floor` 读面与 SSE 端点装配都是接受之后的产物，缺口登记在[验证范围](verification.md) |

[规范场景](v1/scenarios.md)列出提供者、投影与客户端的验收条件。设计接受、模型检查与实现
验收分别记录；本页不代替精确契约。
