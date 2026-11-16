# 传输会话：性质、模型与实现的对应

[TransportSession.tla](models/TransportSession.tla) 是传输会话请求生命周期的行为模型，[run.py](models/run.py) 按下表的预期判读每份配置。对真实 `Session` 的有界穷举探索器在 `tests/model/`（`session-model.spec.ts`），负控变异在 `tests/model/mutants.ts`。性质归[包组规格](../../SPEC.md#不变式)。模型与探索器之间没有精化证明；有限检查的通过不等于实现符合。

模型把一个请求分成在途项（相：未登记、授权中、已交给线路、授权发现中、已结算）与会话拥有的后台工作流（等凭据句柄、等线路、等元数据取回）。结算只放开在途项；工作流在结算之后到达的答复被丢弃。中止信号与 `close()` 按相当场结算；两种断开（`LineGone` 与 `SessionEnded`）只结算依赖线路的两相。`cancelRequest` 当即返回，在模型的抽象之外。

## 性质

| 规格不变式 | 模型性质                                                | 实现与用例                                           |
| ---------- | ------------------------------------------------------- | ---------------------------------------------------- |
| V1         | `V1_SettleOnce`                                         | `src/session.ts` 在途表的唯一结算；探索器            |
| V2         | `V2_NoCredentialAfterClose`、`V2_NoWireAfterDead`       | 句柄调用入口的关闭核对；`session` 用例               |
| V3         | `V3_RejectAtMostOnce`                                   | 授权拒绝的后台工作流；探索器                         |
| V4         | `V4_SignalBounded`、`V4_CloseBounded`、`V4_DeadBounded` | 按相结算的 `stopAnswerOf`；`stdio` 真实子进程用例    |
| MC-22      | `V5_NoResendForCaller`                                  | 契约的 `withOneResend` 只对读类成立；`http` 用例     |
| V6         | `V6_ByPhase`                                            | `stopAnswerOf` 与 `lineGoneAnswerOf`；`session` 用例 |

## 动作

| 模型动作              | 实现（`src/session.ts`）                                                |
| --------------------- | ----------------------------------------------------------------------- |
| `Begin`               | `begin`：传输不可用时不登记；否则登记在途项并起后台工作流               |
| `AuthDone`            | 经句柄入口调用 `authorize`，返回后核在途项，再交给线路                  |
| `Answer`              | 交换翻成线上事件，经契约的 `classifyWireEvent` 与 `concludeAnswer` 结算 |
| `Refuse`              | 进入授权发现：回报拒绝与元数据取回在后台进行                            |
| `Broken`              | 流断开的结论：读类再发一次，写类答没有应答                              |
| `LineGone`            | 线路的 `ended`、`broken` 事件与 SSE 共用流的结束：记下原因，按相结算    |
| `SessionEnded`        | 带旧会话的 404：结算触发它的请求，传输转为不可用                        |
| `DiscDone`            | 授权发现结束，答需要授权                                                |
| `Signal`              | 中止信号按相结算该项                                                    |
| `Close`、`LineClosed` | `close()` 按相结算全部在途项，再只等线路的 `close()`                    |

## 配置的预期

| 配置                               | 用途 | 预期                             |
| ---------------------------------- | ---- | -------------------------------- |
| `valid-close`                      | 正控 | V1–V6 的不变式全部成立           |
| `valid-signal`                     | 正控 | 同上                             |
| `valid-no-handle`                  | 正控 | 同上                             |
| `bad-resettle`                     | 负控 | `V1_SettleOnce` 违反             |
| `bad-cred-after-close`             | 负控 | `V2_NoCredentialAfterClose` 违反 |
| `bad-report-twice`                 | 负控 | `V3_RejectAtMostOnce` 违反       |
| `bad-signal-dead`                  | 负控 | `V4_SignalBounded` 违反          |
| `bad-close-settles-after-line`     | 负控 | `V4_CloseBounded` 违反           |
| `bad-caller-waits-workflow-close`  | 负控 | `V4_CloseBounded` 违反           |
| `bad-caller-waits-workflow-signal` | 负控 | `V4_SignalBounded` 违反          |
| `bad-resend`                       | 负控 | `V5_NoResendForCaller` 违反      |
| `bad-close-not-sent`               | 负控 | `V6_ByPhase` 违反                |
| `bad-ended-sends-authorizing`      | 负控 | `V2_NoWireAfterDead` 违反        |

`run.py` 的 `MUTATIONS` 另把有效动作的原文换成缺陷，在模块副本上只查目标不变式；每个变异须让它变红：

| 变异                                                                                                                                                                                   | 须违反的不变式              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `V1-close-resettles-done`、`V1-late-answer-resettles`                                                                                                                                  | `V1_SettleOnce`             |
| `V2-begin-ignores-closed`、`V2-late-refusal-reports`                                                                                                                                   | `V2_NoCredentialAfterClose` |
| `V2-begin-ignores-dead`、`V2-dead-read-resends`                                                                                                                                        | `V2_NoWireAfterDead`        |
| `V3-discovery-reports-again`、`V3-report-without-handle`                                                                                                                               | `V3_RejectAtMostOnce`       |
| `V4-close-keeps-caller`、`V4-close-waits-discovery`                                                                                                                                    | `V4_CloseBounded`           |
| `V4-signal-leaves-discovery`                                                                                                                                                           | `V4_SignalBounded`          |
| `V4-ended-leaves-authorizing`、`V4-dead-keeps-caller`                                                                                                                                  | `V4_DeadBounded`            |
| `V5-write-resends`、`V5-read-resends-twice`                                                                                                                                            | `V5_NoResendForCaller`      |
| `V6-close-auth-abandoned`、`V6-close-disc-not-sent`、`V6-signal-sent-not-sent`、`V6-dead-settles-discovery`、`V6-gone-auth-broken`、`V6-gone-sent-abandoned`、`V6-ended-abandons-sent` | `V6_ByPhase`                |
