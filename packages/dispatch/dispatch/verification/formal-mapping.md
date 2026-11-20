# 形式模型与规格的对应

模型 `models/report/DispatchReport.tla` 守 [Dispatch 规格](../../SPEC.md#不变式)里能用有限状态穷举的那几条。跑法：`TLA2TOOLS_JAR=<钉住的 tla2tools.jar> python3 check.py`。范围与没有覆盖的东西写在 `models.json` 的 `scope`。

两个正例：`two-tries`（报告的输入可以送两次，代表一次结果不知道的送达）、`one-try`（只送一次）。七个变异各改模型里的一处，只查它对应的那条不变式，必须变红。

| 模型里的不变式 | 规格里的不变式 | 变异：改掉什么它应当变红 |
| --- | --- | --- |
| `AtMostOneReport` | DP-01 | 已有报告时还接受报告 |
| `DeliveredOnce` | DP-02、Tool 的 TL-63 | 等待还读不出是不是已关就送输入；重送时换一个提交标识 |
| `NoStrandedReport` | DP-03 | 等待已关之后不送输入 |
| `WithdrawExcludesReport` | DP-04 | 撤回之后还接受报告；有报告之后还接受撤回 |
| `CallAlwaysSettles` | DP-05 | 撤回成立之后不答复还在等的调用 |

模型里的名字与规格的对应：`state` 是派发的状态；`reports` 是成立过的报告数；`run` 是起始输入引起的那一轮；`wait` 是派发方那次调用的等待，`answer` 是它得到的答复；`delivery` 是报告的交付；`log` 是派发方会话日志里由本组送进的报告输入，`SubOf` 是提交标识；`archived` 是派发方的会话已归档。`SysNext` 是系统自己会走的步，人与 agent 选择做的事（撤回、取消、归档）与那一轮的结束不在其中。

模型没有覆盖：受理与建会话；`handoff`；消息；深度与同时开着的派发数；资格；一个会话的几次派发；撤回之后那一轮的停止；归档向子会话的级联；「系统最终会走它的步」这类活性。这些只有文字与实现时的用例守。
