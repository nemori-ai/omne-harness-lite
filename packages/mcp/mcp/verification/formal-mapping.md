# 连接表与调用口：性质、模型与实现的对应

[ConnectionTable.tla](models/ConnectionTable.tla) 是连接表生命周期的行为模型，[Calls.tla](models/Calls.tla) 是调用口的行为模型（连接表只剩抽象）。[models.json](models.json) 登记每份配置与它的预期，[check.py](check.py) 按预期判读；成员内 `pnpm run verify:formal` 一次跑完正控、负控与探针。对真实实现的有界穷举探索器在 `tests/model/`（`lifecycle.spec.ts` 与 `calls.spec.ts`）。性质归[包组规格](../../SPEC.md#不变式)。模型与探索器之间没有精化证明；有限检查的通过不等于实现符合。

两种证据的共同前提：一次事件循环轮次只有一个外部动作（客户调用、端口答复或时限到期），之后内部步一直运行到静止。所以「端口答复与停止信号或关停落在同一轮」的交错不由模型与探索器检查，由服务层的逐微任务扫描用例检查。

## 性质

| 规格不变式 | 模型性质                                                                  | 实现与用例                                                                |
| ---------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| P1         | `P1_AtMostOnce`、`P1_ShutdownReleasesAll`                                 | `internal/teardown.ts`、`internal/late.ts`；`teardown`、`shutdown` 用例   |
| P2         | `P2_NoneHoldsNothing`、`P2_ForgetHoldsNothing`                            | `internal/entry.ts` 的遗忘条件、`internal/late.ts`；`entry` 用例          |
| P13        | `P4_NoConnectAfterShut`、`P4_NoOkAfterShut`                               | `internal/table.ts` 的关停与 `internal/build.ts` 每步之后的关闭核对       |
| MC-3       | `P5_KeyIsolation`                                                         | `internal/table.ts` 的连接键；`ensure` 用例                               |
| MC-6       | `P6_LateInvisible`                                                        | `internal/late.ts`；`connection` 用例                                     |
| P7         | `P7_ErrorsHandled`                                                        | `internal/port.ts` 的 `ask` 与任务作用域；`port`、`port-breach` 用例      |
| P8         | `P8_BoundedEnsure`；探针 `P8_BoundedClose`、`P8_EveryCallerAnswers`       | `internal/port.ts` 的 `within`、`waitAtMost`；`races` 用例                |
| P16        | `P16_CloseRefusesAtOnce`、`P16_NoOkAfterClose`、`P16_NoRequestOnRefusing` | `internal/entry.ts` 的 `Ensured.wire`；`invoke`、`refresh` 的逐微任务用例 |
| P9         | `P9_NotSentNotSent`                                                       | `calls.ts` 的 `perform` 与发出前的同步核对                                |
| P10        | `P10_CancelOnce`                                                          | `calls.ts` 的发出后取消                                                   |
| P11        | `P11_ReservationEnded`                                                    | `internal/in-flight.ts` 的占位句柄；`in-flight` 用例                      |
| P12        | `P12_Isolation`                                                           | `internal/in-flight.ts`、`tasks.ts` 的任务表；`cancel`、`tasks` 用例      |
| P13        | `P13_NoSendAfterShut`                                                     | `calls.ts`、`tasks.ts` 的出口                                             |
| P14        | `P14_BoundedAfterStop`、`P14_EveryCallAnswers`                            | `calls.ts` 的 `under`；探索器                                             |
| P15        | 模型没有不带标记的失败；只由探索器的 `fail-usable` 答复检查               | `internal/lost.ts` 的 `lostOf`；`lost` 用例                               |

## 动作

| 模型动作                                     | 实现                                                          |
| -------------------------------------------- | ------------------------------------------------------------- |
| `EnsureCall`、`EnsureStep`、`TurnNext`       | `internal/table.ts` 的 `ensure` 与临界区；`internal/turns.ts` |
| `BuildStep`、`MarkStep`                      | `internal/build.ts` 的建连各步与清单标记                      |
| `TearStep`                                   | `internal/teardown.ts`                                        |
| `CloseStep`、`Forget`                        | `internal/table.ts` 的关闭；`internal/entry.ts` 的遗忘条件    |
| `LateStep`                                   | `internal/late.ts`                                            |
| `Release`、`CloseAll`、`Lose`                | `internal/table.ts` 的 `close`、`closeAll`、`lose`            |
| `Fire`、`Answer`                             | 时限到期；端口 promise 兑现或 reject，经 `ask` 读取           |
| `Invoke`、`Continue`、`CallStep`、`Conclude` | `calls.ts` 的 `perform`                                       |
| `MarkSent`、`Cancel`                         | `internal/in-flight.ts`                                       |
| `TaskOp`、`TaskStep`、`Reusable`、`SendTask` | `tasks.ts`                                                    |
| `Drop`                                       | `internal/table.ts` 的 `lose`                                 |

## 负控的缺陷

负控把一处实现会写错的地方做成模型里的缺陷钩子（常量 `Bugs`），配置只声明它要抓的那一条性质；`Bugs = {}` 时模型不变。

| 缺陷钩子            | 模拟的实现缺陷                                                                   |
| ------------------- | -------------------------------------------------------------------------------- |
| `keep-handle`       | `internal/teardown.ts` 还了凭据句柄却没从条目上清掉，下一次拆除再还一次          |
| `no-absorb-close`   | `internal/teardown.ts` 不吸收 `close()` 的拒绝，后面还句柄的一步被跳过           |
| `late-into-entry`   | `internal/late.ts` 把时限之后才到的句柄放回它为之而取的条目，不当场还            |
| `late-revive`       | 时限之后才打开的传输被收进条目，条目重新就绪                                     |
| `key-blind`         | `internal/table.ts` 找条目时不看连接键，几个键共用一个条目                       |
| `no-join`           | `internal/table.ts` 的 `ensure` 不加入在途的建连，另起一次，在准备中的连接上起步 |
| `no-shut`           | `closeAll` 不置关停                                                              |
| `ok-after-shut`     | 建连在它的连接已经关闭之后仍答就绪                                               |
| `close-after-build` | 关闭等建连结束之后才拒新请求                                                     |
| `unbounded-wrap`    | 失败之后的收场不受时限约束                                                       |

## 配置的预期

| 配置                           | 用途                 | 预期                                             |
| ------------------------------ | -------------------- | ------------------------------------------------ |
| `valid-faults`                 | 正控                 | P1–P7、P8 T2 与 P16 的不变式全部成立             |
| `valid-rebuild`                | 正控                 | 同上                                             |
| `valid-throws`                 | 正控                 | 同上                                             |
| `valid-two-keys`               | 正控                 | P1–P5、P7 与 P16 成立                            |
| `live`                         | 正控（活性）         | `LiveSpec` 下 `P8_EveryCallerAnswers` 成立       |
| `probe-a1`                     | 反定理的探针         | `P8_BoundedClose` 违反                           |
| `probe-live-hang`              | 反定理的探针（活性） | `HangSpec` 下 `P8_EveryCallerAnswers` 有时序反例 |
| `bad-keep-handle`              | 负控                 | `P1_AtMostOnce` 违反                             |
| `bad-no-absorb-close-shutdown` | 负控                 | `P1_ShutdownReleasesAll` 违反                    |
| `bad-no-absorb-close`          | 负控                 | `P2_NoneHoldsNothing` 违反                       |
| `bad-late-into-entry`          | 负控                 | `P2_ForgetHoldsNothing` 违反                     |
| `bad-key-blind`                | 负控                 | `P5_KeyIsolation` 违反                           |
| `bad-late-revive`              | 负控                 | `P6_LateInvisible` 违反                          |
| `bad-no-join`                  | 负控                 | `P7_ErrorsHandled` 违反                          |
| `bad-close-after-build`        | 负控                 | `P16_CloseRefusesAtOnce` 违反                    |
| `bad-close-after-build-ok`     | 负控                 | `P16_NoOkAfterClose` 违反                        |
| `bad-no-shut`                  | 负控                 | `P4_NoConnectAfterShut` 违反                     |
| `bad-ok-after-shut`            | 负控                 | `P4_NoOkAfterShut` 违反                          |
| `bad-unbounded-wrap`           | 负控                 | `P8_BoundedEnsure` 违反                          |
| `calls-valid`                  | 正控                 | P9–P13、P16 与 `P14_BoundedAfterStop` 成立       |
| `calls-valid-twice`            | 正控                 | 同上                                             |
| `calls-valid-continue`         | 正控                 | 同上                                             |
| `calls-valid-task`             | 正控                 | 同上                                             |
| `calls-valid-isolation`        | 正控                 | 同上                                             |
| `calls-live`                   | 正控（活性）         | `LiveSpec` 下 `P14_EveryCallAnswers` 成立        |
| `calls-bad-send-despite-stop`  | 负控                 | `P9_NotSentNotSent` 违反                         |
| `calls-bad-gate-unstopped`     | 负控                 | `P14_BoundedAfterStop` 违反                      |
| `calls-bad-cancel-twice`       | 负控                 | `P10_CancelOnce` 违反                            |
| `calls-bad-no-release`         | 负控                 | `P11_ReservationEnded` 违反                      |
| `calls-bad-task-any-account`   | 负控                 | `P12_Isolation` 违反                             |
| `calls-bad-key-blind`          | 负控                 | `P12_Isolation` 违反                             |
| `calls-bad-task-blind`         | 负控                 | `P12_Isolation` 违反                             |
| `calls-bad-send-after-shut`    | 负控                 | `P13_NoSendAfterShut` 违反                       |
| `calls-bad-send-unguarded`     | 负控                 | `P16_NoRequestOnRefusing` 违反                   |
| `calls-bad-wait-answer`        | 负控（活性）         | `LiveSpec` 下 `P14_EveryCallAnswers` 有时序反例  |

## 接续、事件订阅与 OAuth 授权

[Continuation.tla](models/Continuation.tla)、[Events.tla](models/Events.tla)、[Authorization.tla](models/Authorization.tla) 是三份独立的小模型，各守[包组规格](../../SPEC.md#不变式)里新加的一组不变式。它们与上面两份模型之间没有精化关系，也没有到实现的精化证明：有限实例没有反例，不等于实现符合；实现的符合由各成员的用例与发行应用里的用例核对。`Authorization.tla` 守的规则归成员 `mcp-authorization`，模型随那个成员走。

模型的前提，都是别人的保证：

- `Continuation`：一个检查点只有一个后继，一份答复只被采用一次，已关的等待不接受答复。这三条归 Tool（它的不变式 TL-29）。
- `Events`：对端的事件按产生的次序交来，可以重复交，可以忘掉最旧的；存储的一次提交要么全成立要么全不成立。
- `Authorization`：授权服务器每次成功续期都换掉续期材料；回跳可以来自任何人，带任何曾经发出过的状态值。

模型省掉的：真实的传输与时限（归 `TransportSession` 与 `Calls`）；多个订阅之间、多个接入点之间的交错；令牌的内容与加密；写入结果不知道时存储一侧的认回（归存储契约）。

### 性质

| 规格不变式 | 模型性质 | 实现与用例 |
| --- | --- | --- |
| MC-27 | `Continuation`：`I1_InitialOnce`、`I1_ContinuationOnce`、`P_CancelOnce` | `mcp-bridge` 的恢复段：发出之前写接续记录；进程丢失后的接续用例 |
| MC-28 | `Continuation`：`P_RowBeforePark`、`P_RowMatchesWait` | `mcp` 的任务看守：交出与任务行的转移同一次提交 |
| MC-29 | `Continuation`：`I6_CompleteIsTrue` | 任务结局到调用结局的映射 |
| MC-36 | `Events`：`I12_NothingLostSilently`、`I13_StoredOnce`、`P_PositionForward` | `mcp` 的事件接收：落盘与位置前进同一次提交 |
| MC-37 | `Events`：`I14_GapIsReported`、`P_TerminatedIsReported` | 缺口与终止的记录与报告 |
| MC-38 | `Events`：`I16_NoSubscriberNoStream`、`P_StreamOnlyWhenReceiving` | 订阅者的增减与流的开关 |
| MC-32 | `Authorization`：`I9_ExchangeChecked`、`I9_ExchangeOnce` | `mcp-authorization` 的回跳处理 |
| MC-33 | `Authorization`：`I10_OneRefresh`、`P_UnknownKeeps`、`P_ReconnectAfterRefusal` | `mcp-authorization` 的续期 |

### 动作

| 模型动作 | 设计里的哪一步 |
| --- | --- |
| `Continuation`：`FirstSegment` | 第一段发出 `tools/call`，对端答完成、要输入、建任务或不答 |
| `PersonAnswers` | 人答了卡片，Tool 采用答复并计划恢复段 |
| `ResumeRecord`、`ResumeSend`、`ResumeCommit` | 恢复段：先写接续记录，再发出接续或 `tasks/update`，再提交这一段的结果 |
| `Watch` | 任务的看守去查并交出「到了」或「要输入」 |
| `ResumeTask` | 恢复段读任务的结果，或换成等人 |
| `Crash` | 进程丢失：第一个检查点之前以未知收场；停泊的不丢；恢复段从同一检查点重来 |
| `Events`：`Subscribe`、`Unsubscribe` | 订阅者来与走；第一个建订阅，最后一个删订阅 |
| `Open` | 带着位置开流；对端服务不了这个位置时记缺口并跳过 |
| `Receive`、`Again` | 收到下一条事件；对端重复交来的不再落盘 |
| `Deliver` | 消费者收下一条已落盘的事件 |
| `Terminate`、`ConnectionLost`、`ConnectionBack`、`Break` | 对端终止；连接丢了与回来；流断了 |
| `Authorization`：`Begin` | 人开始一次连接，新的待完成的 OAuth 授权顶掉旧的 |
| `Callback` | 回跳到了：只为仍然有效的那一条、核过签发方之后换令牌 |
| `Use`、`RefreshAnswered`、`RefreshUnknown` | 用令牌；过期先续；续期被答复或没有应答 |
| `Disconnect` | 断开 |

### 负控的缺陷

| 缺陷钩子 | 模拟的实现缺陷 | 须违反的性质 |
| --- | --- | --- |
| `no-record` | 恢复段不写接续记录就发出 | `I1_ContinuationOnce` |
| `mark-later` | 看守交出答复之后才改任务行 | `P_RowMatchesWait` |
| `complete-on-gone` | 任务过期或查不到时把调用写成完成 | `I6_CompleteIsTrue` |
| `park-before-row` | 调用先停泊、任务行后写 | `P_RowBeforePark` |
| `cursor-first` | 位置先前进、事件后落盘 | `I12_NothingLostSilently` |
| `no-dedup` | 对端重复交来的事件再落盘一次 | `I13_StoredOnce` |
| `silent-gap` | 位置跳过对端忘掉的事件而不记缺口 | `I12_NothingLostSilently` |
| `keep-stream` | 最后一个订阅者走了或进程丢了之后流还开着 | `I16_NoSubscriberNoStream` |
| `stale-state` | 接受已经作废的状态值 | `I9_ExchangeChecked` |
| `skip-iss` | 不核签发方就换令牌 | `I9_ExchangeChecked` |
| `exchange-twice` | 换过令牌的待完成的 OAuth 授权还能再换 | `I9_ExchangeOnce` |
| `parallel-refresh` | 每个使用者各发一次续期 | `I10_OneRefresh` |
| `wipe-on-unknown` | 续期没有应答时删掉续期材料 | `P_UnknownKeeps` |
| `reconnect-on-unknown` | 续期没有应答时就要人重新连接 | `P_ReconnectAfterRefusal` |

### 配置的预期

| 配置 | 用途 | 预期 |
| --- | --- | --- |
| `cont-valid` | 正控：三个检查点、两次进程丢失 | 通过 |
| `events-valid` | 正控：三条事件、两个订阅者、两次进程丢失 | 通过 |
| `authz-valid` | 正控：两次开始连接、两个同时的使用者、两次续期被答复 | 通过 |
| `cont-bad-*`、`events-bad-*`、`authz-bad-*` | 负控，每份开一个缺陷钩子 | 违反上表那一行的性质 |
