# 唤醒与推进失败的有限模型

[WakeUp.tla](WakeUp.tla) 检查谁唤醒会话的解释方（S1），已授予的 Run 是否最终交给 Agent，以及推进放弃时是否留下具名诊断。运行记录见 [formal-runs.md](../formal-runs.md)。

模型检查只说明有限范围内的设计性质。它不证明产品实现符合模型。

## 性质

| 编号 | 性质（模型名） | 出处 | 违背后果 | 原来靠什么守 | 现在怎么守 |
| --- | --- | --- | --- | --- | --- |
| S5 | 唤醒不丢失：待处理的输入最终到达已发起的 Run（`InputsServed`）；已授予的 Run 最终发起（`GrantedInvoked`，PA-06 第 2 项） | [SPEC](../../../SPEC.md) PA-06、PM-14；session SPEC 的 S1、S3、C2 | 会话静默卡死 | `advance.spec.ts` 的唤醒与启动扫描用例 | 模型；守卫 session 成员的 `wake-up.spec.ts`（在途触发再跑一次） |
| S6 | 推进失败不静默：每次放弃都留下具名诊断（`NoSilentGiveUp`） | SPEC PA-07；session SPEC C2「停止并记诊断」 | 与 S5 组合成卡死且无法诊断 | 无 | 只有模型。现行实现不满足，见缺陷 F1 |

## 状态与动作

`pending` 是待处理输入数。S1 分两步：`Read` 读快照，`Judge` 按读到的内容判断。判断进行时到达的触发置 `again`，判断结束后再跑一次。触发来自提交通知（可能丢失）或周期扫描（按待处理输入找会话）。`Judge` 在没有 Run 时提交 `startRun`（条件提交），在 Run 已授予而 C2 空闲时重新交给 C2。C2 在 Agent 不可用时重试，`MaxTries` 次后放弃。崩溃丢掉内存里的 S1、C2 与在途通知。Run 结束是一次提交，带通知。

`Bug` 的值：`no-again`（在途触发被丢弃）、`scan-start-only`（现行实现：已授予的 Run 不再交给 C2）、`swallow`（现行实现：放弃时不写诊断）。

## 模型与代码的对应

| 模型 | 代码（session 成员） |
| --- | --- |
| `Notify`、`Trigger`、`again` | `advance.ts` 的 `trigger` 与 `triggers` 映射 |
| `Read`、`Judge` | `advance.ts` 的 `check`：读快照，`judgeRunStart`，`openRun` |
| `Scan` | `scan.ts` 的 `round` 与 `dispatch`：按 `inputs`、`unresolved`、`controls` 找会话 |
| `Invoke` | `advance.ts` 的 `invoke` 与 `advance.retryDelaysMs` |
| `Crash` | 进程重启 |
| `silent` | 诊断出口；现行实现未提供 |

## 有限范围

`MaxInputs = 2`、`MaxTries = 2`。正控 `positive`：扫描开启，至多丢一次通知、崩溃一次、Agent 下线两次。`positive-no-scan`：扫描关闭，不丢通知、不崩溃、Agent 不下线；它与 `negative-no-again` 只差 `Bug`，用来归因。活性用 `Live`：解释方、扫描、C2、Run 结束与 Agent 上线弱公平。

## 执行

同 [run-advance](../run-advance/README.md#执行)，模型目录换成本目录。
