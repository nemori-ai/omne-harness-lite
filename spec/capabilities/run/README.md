# Run、Step、执行权与控制

**当前正式契约为 [capability.run v2](v2/contract.md)**，接受依据
[D-015](../../../docs/decisions/D-015-tool-execution-message-stream-and-hooks.md)；
[v1](v1/contract.md)（由 [D-014](../../../docs/decisions/D-014-session-run-agent-lifecycles.md)
接受）标为 superseded，保持冻结与可引用，未迁移的消费者继续按 v1。精确版本、状态与接受
依据以 [catalog](../../catalog.json) 为准。

本能力与 [session](../session/README.md) 一起取代
[session-run v2](../session-run/README.md)：Run、状态、epoch、Step、驱动位置投影、取得下一
Step 的条件、等待登记簿、控制、复合打断对旧 Run 的处置、命令 Run 的终态映射与恢复兼容
证据归本能力；推进规则由 [run-driver](../run-driver/README.md) 消费本版定义；占位与执行者
关系归[生命周期组合](../../compositions/session-run-agent-lifecycles/README.md)。

| 对象 | 当前状态与依据 |
|---|---|
| v2 契约 | 已接受；与 v1 的差异见[差异表](v2/contract.md#与上一版的差异)。来源是[工具执行提案](../../../docs/proposals/tool-execution/README.md)的[等待登记簿](../../../docs/proposals/tool-execution/lifecycle.md#等待登记簿)、[动作链与级联表](../../../docs/proposals/tool-execution/lifecycle.md#控制与级联表)与作者裁决 1～3、7～10、14～15 |
| v1 契约 | superseded，保留精确引用与复现价值；[设计来源与评审](../../../docs/proposals/session-run-agent-lifecycles/README.md)、[Run 候选正文](../../../docs/proposals/session-run-agent-lifecycles/run.md) |
| 形式模型与场景 | 本能力没有自己目录下的模型；[验证范围](verification.md)逐条对应 RN-01～09：Run 的推进与等待由 [run-driver 模型](../run-driver/verification.md)覆盖，状态机、占位与执行者关系及新终态 `superseded` 由[生命周期组合模型](../../compositions/session-run-agent-lifecycles/verification.md)覆盖，等待登记簿的按调用投影由 [tools 模型](../tools/verification.md)覆盖 |
| 提供者设计 | [Run 提供者](../../../packages/session/run/design.md)（目标实现尚未开始；按 D-015 接受后重写，见提案的提供者归属表） |

本页不代替精确契约；实现符合性另行验收。

## 差异表来源裁决的出处

[v2 差异表](v2/contract.md#与上一版的差异)的"来源裁决"列只写编号，链接在此维护（契约正文
不引用候选材料）：

| 编号 | 出处 |
|---|---|
| U-43、U-44、U-45、U-46、U-59 | [工具执行提案的用户裁决记录](../../../docs/proposals/tool-execution/README.md#裁决记录2026-09-14用户) |
| 作者裁决 0～7 | [按用户工作风格的作者裁决](../../../docs/proposals/tool-execution/README.md#作者裁决2026-09-15按用户工作风格) |
| 作者裁决 8～13 | [第二轮作者裁决](../../../docs/proposals/tool-execution/README.md#第二轮作者裁决2026-09-15架构复核后) |
| 作者裁决 14～19 | [第三轮作者裁决](../../../docs/proposals/tool-execution/README.md#第三轮作者裁决2026-09-15第三轮架构复核后) |
| 缺口表各行（RN-01/04、RN-02/08、RN-03/05、SE-13、HD-04 等） | [契约措辞缺口表](../../../docs/proposals/tool-execution/lifecycle.md#契约措辞缺口表) |
| 等待登记簿的登记项、事实与提交边界 | [等待登记簿](../../../docs/proposals/tool-execution/lifecycle.md#等待登记簿) |
| 控制级联逐行处置、interrupt 与 interrupt_then_run 的动作链 | [控制与级联表](../../../docs/proposals/tool-execution/lifecycle.md#控制与级联表)、[动作链](../../../docs/proposals/tool-execution/lifecycle.md#interrupt-与-interrupt_then_run-的动作链) |
| "本批次作者裁决"（占位派生与升级路径的交互） | 契约的[差异说明](v2/contract.md#未由来源直接给出的表达)；来源提案未处理该交互 |
