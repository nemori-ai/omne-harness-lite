# Run 与 attempt 层的有限模型

[RunAdvance.tla](RunAdvance.tla) 检查一个会话的 Run 与 attempt 层：唯一推进者、Run 唯一、输入至多承接一次、取消与终态，以及 PM-02 有界收束在无关提交下是否会放弃。运行记录见 [formal-runs.md](../formal-runs.md)，无界推广见 [proofs](../../proofs/run-advance.md)。

模型检查只说明有限范围内的设计性质。它不证明产品实现符合模型。Journal 事实模型归 Journal 终态车道，这里不重复。

## 性质

条款都在本成员的 [SPEC](../../../SPEC.md)。

| 编号 | 性质（模型名） | 出处 | 违背后果 | 原来靠什么守 | 现在怎么守 |
| --- | --- | --- | --- | --- | --- |
| S1 | 唯一推进者：至多一个 attempt 持有 advance；序号只增；失去推进资格的 attempt 不再取回，它的写入答 `stale-advance`（`OneAdvance`、`NoRegain`、`AdvanceIsNewest`、`StaleWriterRejected`） | I-R2、PM-05、PM-11 | 两个实例同时推进同一 Run：重复发起、重复费用 | `reduce` 的结构检查与 `judgeAdvance` 的单点用例 | 模型；守卫 `run-advance-invariants.spec.ts` 的 I-R2 |
| S1′ | 两个恢复者读到同一 Run 层后各自 `claim`，至多一个成立，另一个答 `stale-advance`（`OneClaimPerRead`） | I-R2、PM-05；R2-D327 | 两个恢复者先后接管同一 Run，序号连跳两次 | 只靠执行记录提供者的条件提交 | 模型；守卫 `run-advance-invariants.spec.ts` 的两个 `claim` 用例。`claim.expected` 必填（R2-D343）；决定不比较它的负控见 `bad-claim-no-expected` |
| S2 | Run 唯一，输入至多承接一次（`OneOpenRun`、`TakeOnce`） | I-R1、I-R3、PA-08 | 同一输入进两个 Run：重复回答 | `judgeRunStart` 的 `run-active`；`reduce` 的检查 | 模型；守卫的 I-R1、I-R3 |
| S3 | 终态不可反转；终态后没有 attempt；取消只在生产者确认后才 reconciled（`TerminalStable`、`NoPostTerminalAttempt`、`ReconcileNeedsConfirmation`） | I-R4、I-R5、PM-08、PM-13 | 完成覆盖取消；取消后仍有推进者；「已请求停止」显示成「已停止」 | `control.spec.ts` 的用例 | 模型；守卫的 I-R4 |
| S4 | 有界收束不被无关提交饿死（`NoAbandonedClose`） | I-R2「条件提交核对 expected」、PM-02；session SPEC `command.retriesOnChanged` | 繁忙会话里收束永远提交不上，Run 留在 active | 无 | 采用 Run 层修订（R2-D327）。设计正控 `positive-run`，负控 `negative-global-expected` 是旧契约；守卫 `run-advance-invariants.spec.ts` 与 session 成员 `wake-up.spec.ts` 的有界收束用例 |

## 有限范围

一个会话；`Inputs = {i1, i2, i3}`；`Recoverers = {r1, r2}`；`MaxRuns = 2`；`MaxAttempts = 3`。`ExpectedScope` 取 `"run"`（R2-D327 采用的契约与实现：只与 Run 层修订比较）或 `"global"`（旧契约：与整份快照修订比较）。`Bug` 每个值去掉一条设计规则，`"none"` 是设计。`claim` 分两步：恢复者先读 Run 层（`ClaimRead`），再带读到的 `expected` 条件提交（`ClaimCommit`）。

收束进行时，收束的 attempt 保持 advance：模型里 `Release` 与 `Claim` 在 `close = "needed"` 时等待。收束期间的接管不在 S4 的范围内。

## 模型与代码的对应

| 模型 | 代码 |
| --- | --- |
| `revision`、`runRevision` | 快照修订（每次提交加一）；Run 层修订 `RunState.active.revision`，由 `reduce` 在写 SE13、SE15、SE16 或 SE08 的批次设置 |
| `Compared` | `judgments.ts` 的 `expectedRevision` 与 `expectedHolds` |
| `Accept` | `accept`：输入取得待处理资格，不动 Run 层 |
| `StartRun` | `decide.ts` 的 `decideStartRun` 与 `judgments.ts` 的 `judgeRunStart` |
| `Invoke`、`InvokeRefused` | session 成员 `advance.ts` 的 `invoke`；消息准入拒收进入有界收束 |
| `Take` | 输入交接（SE14，`intake.handed-over`） |
| `Release`、`ClaimRead`、`ClaimCommit` | `release`、`claim` 与 `decideAttempt`；`claim` 的 `expected` 必填，只与 Run 层修订比较（R2-D343） |
| `StaleWrite` | `judgeAdvance` 的 `stale-advance` |
| `AgentEnd` | Agent 结束事实的同日志解释 |
| `Cancel`、`ProducerConfirm`、`Reconcile` | `decide-management.ts` 的 `decideControl`、`decision-support.ts` 的 `terminalEntries`，以及控制进度的 reconciled |
| `CloseRead`、`CloseCommit`、`CloseChanged` | session 成员 `advance.ts` 的 `closeRefused`：读 Run 层修订，带 `expected` 提交 `finishRun`，答 `changed` 时重读，超过 `retriesOnChanged` 写诊断后停止 |

## 执行

运行入口是上一级的 [run-tlc.sh](../run-tlc.sh)，按本目录的 `expect.txt` 逐个跑配置：

```sh
wsl.exe -d Ubuntu-24.04 --exec bash -l <WSL 视角的 models 目录>/run-tlc.sh <WSL 视角的本目录> <输出目录>
```
