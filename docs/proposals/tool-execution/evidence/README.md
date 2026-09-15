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
| [ToolCall.cfg](model/ToolCall.cfg) | 安全配置：2 个调用、至多 1 次 owner 崩溃、对称约减；登记为形式任务 |
| [ToolCallProgress.cfg](model/ToolCallProgress.cfg) | 进展配置：1 个调用、至多 1 次崩溃、公平性假设见模块 `SpecFair`；登记为形式任务 |
| [ToolCallProgressTwo.cfg](model/ToolCallProgressTwo.cfg) | 进展补充：2 个调用、无崩溃；约 3～5 分钟，只在重放脚本里跑，不登记为形式任务 |
| [ToolCallRedispatch.cfg](model/ToolCallRedispatch.cfg) | 否定配置：期望 `AttemptMonotone` 被违反；不登记为形式任务 |
| [replay.py](model/replay.py) / [run-plan.json](model/run-plan.json) | 重放四个配置并写 [results.json](model/results.json)（命令、退出码、状态数、模块/配置哈希、日志路径；`source_commit` 是重放时的 HEAD，文件身份以哈希为准） |

重放：设置 `JAVA_BIN` 与 `TLA2TOOLS_JAR` 后运行 `python3 docs/proposals/tool-execution/evidence/model/replay.py`。
形式任务命令带 `-deadlock`：终态状态本无后继，死锁检查关闭；卡住由进展性质检查。

## 抽象与边界

- 每个调用一个 attempt：崩溃后 owner 以同 attemptId 重发 start（模型里状态不变），不建第二个
  attempt；多 attempt 的政策不在本轮。
- Run 抽象为 none / running / waiting / interrupted / terminal / cancelled，`terminal` 同时代表
  completed（`RunComplete`，前提无阻塞调用）与不可恢复失败（`RunFail`，U-43：未准入的调用
  取消、已准入的与开放人类请求保留并失去等待位置、未消费输入转 queue）；只有一个等待位置。
- 结算交付按 SE-14 与等待登记簿（作者裁决 8）建模：`rel[c]` 是登记簿在调用上的投影，
  `Claimed(c)`（none / foreground / detach_in_flight / human_wait）= 有开放登记；结算后保留
  最后一次关系，`Route`：有开放登记且 Run 活动（running / waiting / interrupted）→ continuation，
  无登记而 Run 活动 → context，Run 非活动 → queue，归档 → closed。首稿给 `human_wait` 的
  "只在 Run 已等待时才是 continuation"特例已删（第二轮复核 A-4）：有登记就是接续，在 Step
  内到达的答复等下一 Step 消费。模型把结算（`Terminal` / `Answer`）与裁决（`Adjudicate`）
  相邻建模，不区分 SE-18 的受理未裁决窗口，所以"注销与裁决同批"在模型里表现为结算即
  不再 `Blocking`、裁决时看关系；门不建模。continuation 可在 running 或 waiting 时消费，
  context 只在 running 时消费，从不唤醒等待中的 Run；等待位置被释放（detach 确认、批准变
  后台、请求关闭）时 `RunWake` 让驱动器重评。
- `RunWait`（有 `Blocking` 的调用、无待消费项时 running → waiting）对应作者裁决 9 的 Step
  收束定义：attempt 结算且提议登记后 Step 即收束，前台调用执行期间 Run 就在 waiting；
  "结果一起回"是驱动器的合批规则，模型不区分一个 Step 的 tool_result 是同批还是分批呈现。
- 停止未知：`StopProgressUnknown`（派发意图之后 owner 的有界等待到期）让调用在 stop 请求
  下结算 `unknown`（TS-21）；`UnknownAfterDispatch` 继续约束它只在 `dispatch_intent` 之后
  发生。Run 级 force_stop 的 stopping 路径与单调用强停不建模，`Route` 因此没有
  `stopping` 分支——正文里 cancelled / stopping 发起 Run 的晚到结算走 SE-14 D1 `closed`
  这条差异模型不暴露（第三轮复核 A-阻2）。模型只有一个 Run 槽位（`RunStart` 要求 run ∈
  {none, terminal, cancelled}），所以"R0 interrupted、R1 在跑时 R0 的答复仍是 R0 的
  continuation"（A7）与受理未裁决窗口一样不在模型内。
- `TerminalRunOnlyBackground` 允许终态 Run 下仍有 `stop_requested` 的开放调用（失败级联后
  owner 尚未回答 stop）。
- 停止先于 start 时，fence 与 `cancelled_before_execution` 结算在同一提交（转移表），所以
  "fence 之后 owner 迟到 start"在模型里被 `prog = admitted` 的守卫排除，`NoStartAfterFence`
  由提交结构而非 owner 账本单独保护；owner 侧 start 与 fence 的账本排序（TL-08）是提供者
  验收项，一个只去掉 owner fence 检查的否定变体因此找不到反例，已换成重发变体。将来执行
  owner 跨协调域（决定 b 留的边界）时该同提交不再成立，owner 账本排序成为唯一保护，须补
  义务（[未决项](../README.md#未决项)）。
- interrupt_then_run 建模为 `RunInterruptThenRun`（2026-09-15 补，作者裁决 3）：一步内
  未启动调用取消、前台调用按非确定选择转后台或 stop、后台与开放人类请求保留、旧 Run 的
  等待登记整簿注销（continuation 改判 context、所有已提议调用的 `rel` 置为 background——
  含被取消的与结算中的，第二轮复核 A-4 指出只改执行中调用会让旧 Run 的取消结算被判为新
  Run 的接续），新 Run 立即 running；模型只有一个 Run 槽位，所以旧 Run 的终态 `superseded`
  不单独表示，由 `SupersedeReleasesPositions` / `SupersedeKeepsWork` 两条动作性质表达它的
  效应。停止未知在复合打断下计入收口（作者裁决 10）：模型里 `unknown` 结算与其它结算
  一样不阻止新 Run。
- 等待登记簿（U-59）不另建模：`rel[c]` 就是登记簿在调用上的投影（见上），两者在模型的
  抽象范围内行为等价；模型不覆盖的登记簿内容：门、`since` / `ret`、受理未裁决窗口、跨
  协调域的提交后反应。
- 等待期间的排队用户输入（PF-013.C5 的 2026-09-15 补充，作者裁决 7）建模为
  `RunSteer`：waiting → running，不改任何调用；队列本身不建模，动作无公平性（用户可能
  永远不说话）。它让"Run 在等待中被用户文本唤醒、前台调用仍开放、随后结算按 A 列进
  continuation"的交错进入状态空间，既有不变式与进展性质在其上继续检查。
- 不建模：帧、租户、费用、时间与预算、Yield、force_stop 的 epoch 撤销、hooks、
  `request_approval` 决定被后续调用消费、占位与迟到结果的投影（Detach / StopRequest 作为
  无标签触发；投影是驱动器的结构性质 T-14）、停止未知的可见状态（作者裁决 2 的界面部分）。
- 登记的进展配置只有 1 个调用：2 个调用加崩溃的活性检查在本机超过 10 分钟，超出"单配置
  ≤ 1 分钟"的裁决 h；2 个调用、无崩溃的补充配置约 3～5 分钟通过，只在重放脚本里运行。
- 公平性：系统动作弱公平；`Consume` 与 `RunStart` 强公平以容忍 interrupt/resume 与
  complete/start 循环；`Decide`（审批）、`Answer`（答复）、`RunResume` 是环境假设，写在
  `SpecFair` 里而非契约义务。`RunFail` 与其它控制动作一样无公平性。

## 模型发现

1. 首版 `RunWake` 要求无未消费输入：审批被批准成后台启动、随后该后台调用在 Run 仍
   waiting 时结算为 context，Run 既不再有阻塞者也不能消费 context，进展性质
   `SettlementsResolve` 被 TLC 否定；修正为"等待位置释放即重评"（RD-11 的出边），不改契约。
2. 首版 lateStart 否定变体找不到反例（见上），改用重发变体。
3. `RunInterruptThenRun` 首稿把"人类请求保留"写成"所有 `human` 调用不动"：一个尚未过门
   的人类调用（请求还没创建）被标成后台，新 Run 可以完成，之后它再过门变成 `human_wait`，
   `TerminalRunOnlyBackground` 被否定。修正为"未启动的调用不分种类都取消（门是旧 Run 的
   动作），只有已开放的请求（`hd = open`）保留"，`SupersedeKeepsWork` 随之改为只约束开放
   请求与后台调用；这条区分回到 lifecycle.md 级联表的"未准入调用"列，不改契约。
4. 第二轮复核后把 `RunInterruptThenRun` 的释放改为"所有调用 `rel` 置 background"，TLC 立刻
   给出 `TerminalRunOnlyBackground` 反例：连尚未提议的调用也被标成后台，之后它在新 Run 里
   被提议、过门成前台，而新 Run 已经因为"没有阻塞者"完成。修正为只改已提议的调用；
   `SupersedeReleasesPositions` 同样限定在已提议调用上。这是模型自己抓住的一处措辞漏洞：
   "整簿注销"只作用于簿上有的登记。
