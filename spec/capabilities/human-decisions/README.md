# 耐久人类请求与决定

**当前正式契约为 [capability.human-decisions v2](v2/contract.md)**，接受依据
[D-015](../../../docs/decisions/D-015-tool-execution-message-stream-and-hooks.md)；
[v1](v1/contract.md)（[D-008](../../../docs/decisions/D-008-core-capabilities.md)）保持冻结与
可引用，标为 superseded。v2 把本能力定为内建 `human` 工具（[TL-17](../tools/v2/contract.md)）
的执行 owner，请求不再独立占用 Run 的等待位置而附属于调用，被越过或已终态 Run 的答复
按 [run v2](../run/README.md) 的等待登记簿与 [session v2](../session/README.md) 的入站裁决
路由，并新增受限的程序化作答者与待答请求的快照贡献（逐条见
[契约末尾的差异表](v2/contract.md#与上一版的差异)）。精确版本、状态与接受依据以
[catalog](../../catalog.json) 为准。

| 对象 | 当前状态与依据 |
|---|---|
| 人类请求与决定契约 | v1 由 [D-008](../../../docs/decisions/D-008-core-capabilities.md) 接受，v2 由 [D-015](../../../docs/decisions/D-015-tool-execution-message-stream-and-hooks.md) 接受；设计来源见[核心能力提案](../../../docs/proposals/core-capabilities/README.md)、[工具执行提案](../../../docs/proposals/tool-execution/README.md)（内建 `human` 工具与等待登记簿）与 [hooks 兼容提案](../../../docs/proposals/hooks-compat/README.md)（程序化作答者） |
| v2 差异表引用的裁决 | 契约正文不引用提案，差异表以编号给出来源；正文在[用户裁决 U-41～U-59](../../../docs/proposals/tool-execution/README.md#裁决记录2026-09-14用户)、[作者裁决 w／x](../../../docs/proposals/tool-execution/README.md#作者裁决用户按建议拍板)、[作者裁决 3](../../../docs/proposals/tool-execution/README.md#作者裁决2026-09-15按用户工作风格)、[第二轮 8／9](../../../docs/proposals/tool-execution/README.md#第二轮作者裁决2026-09-15架构复核后)、[第三轮 17](../../../docs/proposals/tool-execution/README.md#第三轮作者裁决2026-09-15第三轮架构复核后)、[契约措辞缺口表](../../../docs/proposals/tool-execution/lifecycle.md#契约措辞缺口表)、[等待登记簿](../../../docs/proposals/tool-execution/lifecycle.md#等待登记簿)、[hooks 决定 p 与 U2](../../../docs/proposals/hooks-compat/README.md#裁决记录)、[hooks 缺口表 HD-05 行](../../../docs/proposals/hooks-compat/README.md#与已接受契约的关系)、[消息流能力侧](../../../docs/proposals/message-stream/cordis.md#能力侧) |
| 形式模型 `Decisions.tla` / `Provisional.tla` | [v2 目录](v2/)内的模型与配置是 [v1](v1/) 的逐字节副本，本次发版没有重跑 TLC；覆盖的条款、运行数字与 v2 新条款的未覆盖部分见[验证范围](verification.md)。有限模型检查不是无条件证明 |
| v2 新语义的证据 | 内建 `human` 调用、interrupt 与失败下的请求保留由 [tools v2 的 ToolCall 模型](../tools/verification.md)覆盖；HD-05 的程序化作答者、HD-09 的快照贡献、HD-13 的三个执行动作尚无模型，见[验证范围](verification.md)的未覆盖表 |
| 目标实现 | [提供者设计](../../../packages/governance/human-decisions/design.md)仍是 v1 基线，区分当时接受的共享面与后续完整 HD 候选；按 v2 重写（执行 owner 的三个动作、结算接收器、程序化作答者登记）属接受之后的工作，源码 fork 不表示实现已符合 |

设计接受、模型检查与实现验收分别记录；本页不代替精确契约。
