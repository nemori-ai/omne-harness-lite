# Run 结束时关上未答调用的有限模型

[RunClosure.tla](RunClosure.tla) 检查一个会话里先后的几个 Run 与它们的工具调用：Run 的终态提交为每个未答的调用写一条工具消息，所以终态的 Run 没有未答的调用，每个调用恰好一条工具消息，后继 Run 的模型请求读到完整的历史。

模型检查只说明有限范围内的设计性质。它不证明产品实现符合模型。Agent 一侧的取消、Tool 的收场与卡片的关闭由人工介入成员的[打断的级联模型](../../../../../human-intervention/human-intervention/verification/formal-mapping.md)检查，这里不重复。

## 性质

条款在本成员的 [SPEC](../../../SPEC.md#终态与控制)。

| 性质（模型名） | 违背后果 | 守卫 |
| --- | --- | --- |
| 终态的 Run 没有未答的调用（`TerminalClosed`） | 历史里留下没有工具消息的调用，供应商拒绝后继的每个模型请求 | `tests/run-closure.spec.ts` |
| 每个调用至多一条工具消息（`OneAnswer`） | 同一个调用有两条结果，供应商拒绝或模型读到互相矛盾的结果 | `tests/run-closure.spec.ts` 的迟到消息用例与「只补未答的」用例；一致性用例 JC-06 |
| 模型请求读到的历史里每个调用都有工具消息（`RequestReadsWholeHistory`） | 后继 Run 不能请求模型 | 发行应用的 `release-cancel.spec.ts` |

## 有限范围

一个会话；`Calls = {c1, c2}`；`MaxRuns = 3`。一个 Run 的循环只在自己的批次都有工具消息之后才发下一个模型请求；较早的 Run 留下的调用不是它的批次。`Bug` 每个值去掉一条设计规则，`"none"` 是设计。最后一个 Run 结束之后没有后继动作，配置关掉死锁检查。

## 配置

| 配置 | `Bug` | 预期 |
| --- | --- | --- |
| `positive.cfg` | `none` | 通过 |
| `negative-no-closure.cfg` | `no-closure`：终态提交不补写。这是本模型加入之前的实现 | 违反 `TerminalClosed` |
| `negative-no-closure-request.cfg` | `no-closure` | 违反 `RequestReadsWholeHistory` |
| `negative-late-accept.cfg` | `late-accept`：终态之后仍收循环交来的工具消息 | 违反 `OneAnswer` |
| `negative-close-all.cfg` | `close-all`：终态提交给已答的调用也补写一条 | 违反 `OneAnswer` |

## 模型与代码的对应

| 模型 | 代码 |
| --- | --- |
| `Open(c)` | `WorkSnapshot.unansweredCalls`，由 `reduce` 的消息分支经 `run-closure.ts` 的 `trackCalls` 维护 |
| `Assistant(c)`、`Answer(c)` | `decide.ts` 的 `decideRecordMessage`；`reduce.ts` 的消息分支 |
| `Answer(c)` 的前提「c 还未答」 | Agent 的循环：每个动作一个槽位，每个槽位交一条工具消息。Session 不核对它，Run 活动时对同一调用的第二条工具消息不被 Session 拒绝 |
| `Answer(c)` 在终态后被拒 | `judgments.ts` 的 `judgeAdvance`，参加分支答 `terminal` |
| `Terminal` | `decision-support.ts` 的 `terminalEntries` 与 `decide.ts` 的有界收束，两处都先放 `run-closure.ts` 的 `closingEntries`；`reduce.ts` 的 `run.terminal` 分支拒绝还有未答调用的终态 |
| `StartNext` | `judgments.ts` 的 `judgeRunStart` |

## 复跑

在本目录用 TLC 逐份配置运行，预期写在 [expect.txt](expect.txt)：

```sh
java -cp "$TLA2TOOLS_JAR" tlc2.TLC -config positive.cfg RunClosure.tla
```

运行记录见 [formal-runs.md](../formal-runs.md#run-closure)。

## 未覆盖

- 压缩之后的历史：被摘要覆盖的调用与保留的结果的配对由 Message 的规则守。
- 对模型不可见的调用块、未完成的调用块（`tool_call_incomplete`）不在模型内。
- 转后台的占位消息按一条工具消息计，它之后的真实结果不在模型内。
- 消息的角色由调用方保证：`accept`、首输入与 `interrupt` 的消息在生产入口只有用户消息，`completeExternalConsumption` 的消息没有生产调用方。契约不核对这些入口的角色，所以模型里只有 Run 的循环写助手消息。
- 历史的次序：Run 进行中受理的输入可以排在调用与它的工具消息之间。供应商适配层只要求调用之后有对应的结果，不要求相邻。
