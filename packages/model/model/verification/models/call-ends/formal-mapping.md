# CallEnds：每次调用都有结局

本目录的模型检查包组规格的一条承诺（「[不变式](../../../../SPEC.md#不变式)」的 MD-9 与 MD-11）：逻辑调用有最终完成、失败或被中断的结局。模型只证明列出的有限状态，不证明实现。

## 1. 建模的对象

一次逻辑调用，从受理到结果交给消费者。driver 做这次调用的执行写入：准备发送、开接收窗口、逐批保存输出、收场。存储对每次写入的答复是三种之一：接受、确定拒绝、未确认（答复丢失或存储此刻答不了；写入可能成立，也可能没有）。

| 变量 | 含义 |
| --- | --- |
| `phase` | 调用的阶段：已受理、已准备、接收中、收场中、已收场 |
| `outcome` | 存储里的终局：没有、完成、失败、被中断 |
| `batches` | 存储接受了几批输出 |
| `sent` | 供应商是否收到了请求 |
| `driver` | driver 的状态：空闲、运行、停下。停下的 driver 只有被唤醒才再运行 |
| `woken` | 是否有人要求 driver 运行 |
| `cancelled` | 调用方是否请求停止 |
| `delivered` | 消费者是否拿到了结果 |
| `dispatches` | 已经准备了几次真实发出 |
| `retry` | 调用的重试记录：没有、已取位置、决定停止、决定再发、决定略去推理状态再发 |
| `due` | 决定再发的那个时刻到了没有 |
| `carried` | 这次发出带没带推理状态 |
| `rejected` | 上游有没有说它因推理状态拒绝了这次发出 |
| `resends` | 略去推理状态再发了几次 |

## 2. 规则

1. 执行写入被确定拒绝时，driver 丢掉存储没有接受的部分，以失败收场。
2. 这次收场不会被确定拒绝。
3. 答复未确认时 driver 停下，宿主之后再次运行它。
4. 收场唤醒推送，推送把结果交给消费者。
5. 一次发出在首内容之前失败、成因可以再试时，调用到策略点：driver 取重试位置，问策略。策略答停止、在请求允许的次数内答再发，或答不了。答不了时调用以失败收场。
6. 决定再发的那一次到了时刻才准备。时刻到了，宿主唤醒 driver。
7. 调用方请求停止之后不再准备新的发出。调用以失败的那次发出的终局收场，不论重试记录是什么。
8. 一次发出在首内容之前因它带上的推理状态被拒时，策略在略去再发的名额内决定立即对同一供应商再发，略去全部推理状态；这次再发不占规则 5 的名额。名额用完时调用以失败收场。
9. 没带推理状态的发出被说成因推理状态被拒，调用以失败收场，不再发。略去再发之后，同一调用的发出都不带推理状态。

## 3. 性质

| 名称 | 种类 | 含义 |
| --- | --- | --- |
| `CallEnds` | 活性 | 每次调用最终收场 |
| `ResultDelivered` | 活性 | 消费者最终拿到结果 |
| `TerminalOnlyWhenEnding` | 安全 | 有终局的调用只处在收场中或已收场 |
| `DeliveredOnlySettled` | 安全 | 结果只在收场之后交付 |
| `NothingAfterSettle` | 安全 | 已收场的调用有终局 |
| `CompletedWasSent` | 安全 | 没有发出的调用不以完成收场 |
| `DispatchesBounded` | 安全 | 真实发出的次数不超过请求允许的次数加略去再发的名额 |
| `ResendCarriesNone` | 安全 | 略去再发之后，同一调用的发出都不带推理状态 |
| `RetryOnlyFromPolicyPoint` | 安全 | 重试记录只在到了策略点之后存在 |

活性依赖三条公平假设：存储最终给出结论；被唤醒的 driver 最终运行；决定再发的时刻最终到来。

## 4. 配置

| 配置 | 去掉的规则 | 必须得到 |
| --- | --- | --- |
| `positive` | 无 | 七条安全性质与两条活性都成立 |
| `drive-ends-on-refusal` | 规则 1：确定拒绝只结束这次 drive | 活性反例 |
| `terminal-refusable` | 规则 2：收场也能被确定拒绝 | 活性反例 |
| `no-rewake` | 规则 3：未确认之后没有人再运行 driver | 活性反例 |
| `policy-fail-stuck` | 规则 5：策略答不了时只结束这次 drive | 活性反例 |
| `control-blocks-settle` | 规则 7：已取位置或决定再发的重试记录在请求停止之后拒绝收场 | 活性反例 |
| `resend-no-wake` | 规则 8：略去再发的决定保存之后没有人再运行 driver | 活性反例 |
| `resend-keeps-state` | 规则 9：略去再发的那次发出仍带着推理状态 | `ResendCarriesNone` 的安全反例 |
| `resend-reachable` | 无；多检一条 `NeverResends` | `NeverResends` 的安全反例。它证明略去再发的分支可达，正向配置的通过不是空转 |

## 5. 模型到代码

答复的分类是一个全函数：`src/commands/execution-write.ts` 的 `verdictOf`，对 `ModelFailure` 的全部种类取值。

| 模型 | 代码 | 用例 |
| --- | --- | --- |
| 确定拒绝之后以失败收场（`Refused`） | `verdictOf` 答 `refused`；`src/driver.ts` 进入收场阶段，`src/receive.ts` 交回执行失败的结束 | `tests/runtime-execution-failure.spec.ts` |
| 收场不会被确定拒绝（`Settle`） | `src/commands/judge.ts` 的 `executionFailed`：成因 `persistence` 的收场在任何未收场状态下合法，终局形状固定 | `tests/execution-failure-settlement.spec.ts` |
| 未确认之后停下并被再次运行（`Lost`、`Start`） | `verdictOf` 答 `unconfirmed` 或 `outdated`；阶段与原写入保留。再次唤醒在 `model-host-local` 的宿主里 | `model-host-local` 的 `tests/plugins-host.spec.ts` |
| 取消唤醒 driver（`Cancel`） | 本模型只把它当作环境 | 取消的成员用例 |
| 因推理状态被拒（`rejected`）与没带时改判（规则 9 前半） | `pi-ai-transport` 的 `src/fact-stream.ts`：引擎把拒绝分类成 `replay-rejected`；编码结果的 `replayCarried` 为假时改判为 `input-rejected` | `pi-ai-transport` 的 `tests/messages-decode.spec.ts` |
| 略去再发的决定（`Decide` 的略去分支）与名额用完 | `src/retry-policy.ts` 的 `resendOrStop`；`src/commands/judge.ts` 的 `retryChoiceFailure` 只在定位的那次发出以 `replay-rejected` 失败、供应商相同、此前没有略去过时收这个决定，普通名额只数不是再发的发出 | `tests/retry-policy.spec.ts`、`tests/runtime-retry.spec.ts` |
| 立即再发（`Resend`） | `src/after-dispatch.ts` 对这个决定不等时刻；准备派发时把派发记录标为 `resend` | `tests/runtime-retry.spec.ts`；`model-host-local` 的 `tests/replay-resend.spec.ts` 在组装好的本地路径上跑通 |
| 再发之后不带推理状态（`ResendCarriesNone`） | 派发记录的 `withoutReplay`；发送边界 `src/send/attempt.ts` 按它把带回放标记的回复全部交给传输略去 | `tests/runtime-retry.spec.ts` 核每次发出给传输的略去名单 |

## 6. 模型不覆盖的

- 执行被别的实例接管（`verdictOf` 答 `superseded`）。那时这个 driver 不写终局，收场归接手的实例。由用例守。
- 进程重启。模型里的唤醒只在同一进程内成立。进程没了之后，调用方经「你的活体还在推进它吗」那一问得知调用不在任何活体里，由调用方以新的调用身份另要一次。
- 策略答「未决」。模型里策略每次都给出停止、再发或答不了。
- 存储写入的大小。收场写入不被容量或单行大小拒绝，由存储布局保证，不在本模型里。
