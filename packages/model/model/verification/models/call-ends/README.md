# CallEnds：每次调用都有结局

本目录的模型检查 [model-contract](../../../../model-contract/SPEC.md) 的一条承诺：逻辑调用有最终完成、失败或被中断的结局。模型只证明列出的有限状态，不证明实现。

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

## 2. 规则

1. 执行写入被确定拒绝时，driver 丢掉存储没有接受的部分，以失败收场。
2. 这次收场不会被确定拒绝。
3. 答复未确认时 driver 停下，宿主之后再次运行它。
4. 收场唤醒推送，推送把结果交给消费者。

## 3. 性质

| 名称 | 种类 | 含义 |
| --- | --- | --- |
| `CallEnds` | 活性 | 每次调用最终收场 |
| `ResultDelivered` | 活性 | 消费者最终拿到结果 |
| `TerminalOnlyWhenEnding` | 安全 | 有终局的调用只处在收场中或已收场 |
| `DeliveredOnlySettled` | 安全 | 结果只在收场之后交付 |
| `NothingAfterSettle` | 安全 | 已收场的调用有终局 |
| `CompletedWasSent` | 安全 | 没有发出的调用不以完成收场 |

活性依赖两条公平假设：存储最终给出结论；被唤醒的 driver 最终运行。

## 4. 配置

| 配置 | 去掉的规则 | 必须得到 |
| --- | --- | --- |
| `positive` | 无 | 四条安全性质与两条活性都成立 |
| `drive-ends-on-refusal` | 规则 1：确定拒绝只结束这次 drive | 活性反例 |
| `terminal-refusable` | 规则 2：收场也能被确定拒绝 | 活性反例 |
| `no-rewake` | 规则 3：未确认之后没有人再运行 driver | 活性反例 |

## 5. 运行

```
TLA2TOOLS_JAR=<TLC 1.7.4 的 jar> python3 check.py --out <输出目录>
```

## 6. 模型到代码

答复的分类是一个全函数：`src/execution-write.ts` 的 `verdictOf`，对 `ModelFailure` 的全部种类取值。

| 模型 | 代码 | 用例 |
| --- | --- | --- |
| 确定拒绝之后以失败收场（`Refused`） | `verdictOf` 答 `refused`；`src/driver.ts` 进入收场阶段，`src/receive.ts` 交回执行失败的结束 | `tests/runtime-execution-failure.spec.ts` |
| 收场不会被确定拒绝（`Settle`） | `src/commands/judge.ts` 的 `executionFailed`：成因 `persistence` 的收场在任何未收场状态下合法，终局形状固定 | `tests/execution-failure-settlement.spec.ts` |
| 未确认之后停下并被再次运行（`Lost`、`Start`） | `verdictOf` 答 `unconfirmed` 或 `outdated`；阶段与原写入保留。再次唤醒在 `model-host-local` 的宿主里 | `model-host-local` 的 `tests/plugins-host.spec.ts` |
| 取消唤醒 driver（`Cancel`） | 已有行为，本模型只把它当作环境 | 已有用例 |

## 7. 模型不覆盖的

- 执行被别的实例接管（`verdictOf` 答 `superseded`）。那时这个 driver 不写终局，收场归接手的实例。由用例守。
- 进程重启。模型里的唤醒只在同一进程内成立；重启之后找回未收场的调用属于周期恢复扫描，尚未实现。
- 重试策略。首内容之前的可重试失败等待策略决定，策略循环尚未实现；模型把供应商的终局都当作可以直接收场。
- 存储写入的大小。收场写入不被容量或单行大小拒绝，由存储布局保证，不在本模型里。
