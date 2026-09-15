# 会话、耐久输入与到达账本

**当前正式契约为 [capability.session v2](v2/contract.md)**，接受依据
[D-015](../../../docs/decisions/D-015-tool-execution-message-stream-and-hooks.md)；
[v1](v1/contract.md) 转为 superseded、保持冻结与可引用，精确版本、状态与接受依据以
[catalog](../../catalog.json) 为准。本能力与 [run](../run/README.md) 一起取代
[session-run v2](../session-run/README.md)：Session 身份与生命周期、历史与派生消息读面、
输入队列、复合打断的受理、会话级强停的 hold、状态贡献注册、恢复顺序、Session Inbound、
`frames(S)` 流与可见范围版本归本能力；占位、执行者与三台状态机的级联归
[生命周期组合](../../compositions/session-run-agent-lifecycles/README.md)，Run 的状态、等待
登记簿与控制归 [run](../run/README.md)。

v2 相对 v1 的变化集中在四处：入站裁决的 A / B 两列改为查 Run 的等待登记簿；被新输入
越过的 Run 以终态 `superseded` 收束并整簿注销；等待中的 Run 可在空闲点取入排队的用户
文本；历史读面、投影快照、`frames(S)` 与可见范围版本进入契约，供
[message-stream v1](../message-stream/README.md) 消费。逐条登记见
[与上一版的差异](v2/contract.md#与上一版的差异)。

| 对象 | 当前状态与依据 |
|---|---|
| session v2 设计与规格 | 已接受；来源为[工具执行](../../../docs/proposals/tool-execution/README.md)、[消息流](../../../docs/proposals/message-stream/README.md)与 [hooks 兼容](../../../docs/proposals/hooks-compat/README.md)三份提案，逐条来源见[差异表](v2/contract.md#与上一版的差异) |
| session v1 设计与规格 | superseded；[设计来源与评审](../../../docs/proposals/session-run-agent-lifecycles/README.md)、[条款归属](../../../docs/proposals/session-run-agent-lifecycles/session.md#2-条款逐句归属)、[接受记录](../../../docs/proposals/session-run-agent-lifecycles/README.md#接受记录) |
| 形式模型与场景 | 本能力两版都没有自己目录下的模型；[验证范围](verification.md)说明证据分担与未覆盖条款：Inbound 受理、裁决、消费与转换由提案证据目录的 `Inbound.tla`（两个形式任务）覆盖，等待登记簿的按调用投影由 [tools v2 模型](../tools/verification.md)覆盖，生命周期与级联由[生命周期组合模型](../../compositions/session-run-agent-lifecycles/verification.md)覆盖，队列顺序、命令与强停仍由 session-run v1 的 `QueueControl` 覆盖，Run 侧等待与结算由 [run-driver 模型](../run-driver/verification.md)覆盖 |
| 提供者设计 | [Session 提供者](../../../packages/session/session/design.md)、[Run 提供者](../../../packages/session/run/design.md)、[恢复](../../../packages/session/persistence/design.md)、[投影](../../../packages/session/projection/design.md) 仍是 v1 基线：v2 新增的派生消息表、`changes / snapshot / floor` 读面、`frames(S)` 与可见范围版本待接受后按提供者设计重写；目标实现尚未开始 |

## 差异表来源裁决的出处

[v2 差异表](v2/contract.md#与上一版的差异)的"来源裁决"列只写编号，链接在此维护（契约正文
不引用候选材料）：

| 编号 | 出处 |
|---|---|
| 用户裁决 U-42、U-58 | [工具执行提案的用户裁决记录](../../../docs/proposals/tool-execution/README.md#裁决记录2026-09-14用户) |
| 工具执行提案作者裁决 3、7 | [按用户工作风格的作者裁决](../../../docs/proposals/tool-execution/README.md#作者裁决2026-09-15按用户工作风格) |
| 第二轮作者裁决 8、12 | [第二轮作者裁决](../../../docs/proposals/tool-execution/README.md#第二轮作者裁决2026-09-15架构复核后) |
| 第三轮作者裁决 15、16、17 | [第三轮作者裁决](../../../docs/proposals/tool-execution/README.md#第三轮作者裁决2026-09-15第三轮架构复核后) |
| 缺口表 SE-13 / RN-04 / SE-02 / SE-17 行 | [契约措辞缺口表](../../../docs/proposals/tool-execution/lifecycle.md#契约措辞缺口表) |
| 消息流提案 R2、R3、R4/R5、R11、R12、R13、R18 | [消息流提案的作者裁决](../../../docs/proposals/message-stream/README.md#作者裁决评审后2026-09-15)及其[第二轮](../../../docs/proposals/message-stream/README.md#第二轮复核后2026-09-15)、[第三轮](../../../docs/proposals/message-stream/README.md#第三轮复核后2026-09-15) |
| 决定点 K、作用域与投递 §7 落点 | [消息流提案的决定点](../../../docs/proposals/message-stream/README.md#决定点用户裁决-2026-09-15)与提案正文 |
| hooks 兼容提案 U3、U5、裁决 q、缺口表 | [hooks 兼容提案的裁决记录](../../../docs/proposals/hooks-compat/README.md#裁决记录)与[评审后的决定点](../../../docs/proposals/hooks-compat/README.md#评审后的决定点用户裁决2026-09-15) |

本页不代替精确契约；实现符合性另行验收。
