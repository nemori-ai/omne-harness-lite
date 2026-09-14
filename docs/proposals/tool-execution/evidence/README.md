# 证据：调用生命周期模型

[提案索引](../README.md) · [生命周期](../lifecycle.md) · [不变式](../invariants.md) · [场景](../scenarios.md)

`model/` 是[生命周期](../lifecycle.md)五维状态机的有限模型，按 Inbound 证据模型的先例放在
提案证据目录并登记为形式任务（`tool-execution-call-safety`、`tool-execution-call-progress`，
[formal-tasks.json](../../../../spec/formal-tasks.json)），每次 spec-check 运行。条款覆盖与
运行结果记在 [tools 验证范围](../../../../spec/capabilities/tools/verification.md)。

## 文件

| 文件 | 内容 |
|---|---|
| [ToolCall.tla](model/ToolCall.tla) | 模型正文：调用进展 / attempt 账本 / 等待关系 / 控制 / 结算交付，抽象 Run、Session 与执行 owner，`tool` 与 `human` 两种调用 |
| [ToolCallMC.tla](model/ToolCallMC.tla) | 对称约减与否定变体 `SpecRedispatch`（恢复时重发已耐久 dispatch_intent 的 attempt） |
| [ToolCall.cfg](model/ToolCall.cfg) | 安全配置：2 个调用、至多 1 次 owner 崩溃、对称约减 |
| [ToolCallProgress.cfg](model/ToolCallProgress.cfg) | 进展配置：1 个调用、至多 1 次崩溃、公平性假设见模块 `SpecFair`；登记为形式任务 |
| [ToolCallProgressTwo.cfg](model/ToolCallProgressTwo.cfg) | 进展补充：2 个调用、无崩溃；约 4 分钟，只在重放脚本里跑，不登记为形式任务 |
| [ToolCallRedispatch.cfg](model/ToolCallRedispatch.cfg) | 否定配置：期望 `AttemptMonotone` 被违反；不登记为形式任务 |
| [replay.py](model/replay.py) / [run-plan.json](model/run-plan.json) | 重放三个配置并写 [results.json](model/results.json)（命令、退出码、状态数、模块/配置哈希、日志路径） |

重放：设置 `JAVA_BIN` 与 `TLA2TOOLS_JAR` 后运行 `python3 docs/proposals/tool-execution/evidence/model/replay.py`。

## 抽象与边界

- 每个调用一个 attempt：崩溃后 owner 以同 attemptId 重发 start（模型里状态不变），不建第二个
  attempt；多 attempt 的政策不在本轮。
- Run 只有一个等待位置；预算、Step 内容、模型调用、Yield 与实例退役不建模（归 run-driver v2
  与生命周期组合模型）。
- 结算后保留最后一次等待关系，供 SE-14 判定 continuation（阻塞调用）与 context（后台调用）。
- 停止先于 start 时，fence 与 `cancelled_before_execution` 结算在同一提交（转移表），所以
  "fence 之后 owner 迟到 start"在模型里被 `prog = admitted` 的守卫排除，`NoStartAfterFence`
  由提交结构而非 owner 账本单独保护；owner 侧 start 与 fence 的账本排序（TL-08）是提供者
  验收项，一个只去掉 owner fence 检查的否定变体因此找不到反例，已换成重发变体。
- 不建模：帧、租户、费用、interrupt_then_run、force_stop 的 epoch 撤销、hooks、`request_approval`
  决定被后续调用消费、前台上限的计时数值（Detach / StopRequest 作为无标签触发）。
- 登记的进展配置只有 1 个调用：2 个调用加崩溃的活性检查在本机超过 10 分钟，超出"单配置
  ≤ 1 分钟"的裁决 h；2 个调用、无崩溃的补充配置约 4 分钟通过，只在重放脚本里运行。
- 公平性：系统动作弱公平；`Consume` 与 `RunStart` 强公平以容忍 interrupt/resume 与
  complete/start 循环；`Decide`（审批）、`Answer`（答复）、`RunResume` 是环境假设，写在
  `SpecFair` 里而非契约义务。
